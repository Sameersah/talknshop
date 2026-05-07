import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/components/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { OrchestratorWebSocketClient, OrchestratorServerEvent } from '@/services/orchestratorWebSocket';

type OrchestratorProduct = {
  product_id?: string;
  marketplace?: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  rating?: number;
  review_count?: number;
  availability?: string;
  image_url?: string;
  deep_link?: string;
  marketplace_url?: string;
  seller_name?: string;
  attributes?: Record<string, any>;
};

type ChatItem =
  | { id: string; kind: 'text'; role: 'user' | 'assistant' | 'system'; text: string }
  | {
      id: string;
      kind: 'clarification';
      question: string;
      context?: string;
      suggestions: string[];
    }
  | { id: string; kind: 'results'; products: OrchestratorProduct[]; summary?: string };

function normalizeSuggestionList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        if (typeof o.label === 'string') return o.label.trim();
        if (typeof o.text === 'string') return o.text.trim();
        if (typeof o.value === 'string') return o.value.trim();
      }
      return String(item ?? '').trim();
    })
    .filter(Boolean);
}

/** LLM / graph often wraps JSON in markdown fences; stream may be partial so we also regex raw text. */
function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/im.exec(t);
  if (fenced) return fenced[1].trim();
  return t;
}

const INTERNAL_JSON_KEY_RE =
  /"(product_type|requirement_spec|attributes|suggestions|question|context|clarifying_question|filters|pagination|price|brand|category)"\s*:/;

/**
 * Hide requirement-spec blobs, clarification JSON, and ```json streams — not meant for the user.
 */
function shouldHideAssistantBlob(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;

  if (raw.startsWith('```') || raw.includes('```json')) return true;

  const inner = stripMarkdownJsonFence(raw);
  if (!inner.startsWith('{') && !inner.startsWith('[')) return false;

  if (INTERNAL_JSON_KEY_RE.test(inner) || INTERNAL_JSON_KEY_RE.test(raw)) return true;

  try {
    const parsed = JSON.parse(inner) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      const markers = [
        'product_type',
        'requirement_spec',
        'attributes',
        'question',
        'suggestions',
        'clarifying_question',
        'filters',
        'pagination',
      ];
      if (keys.some((k) => markers.includes(k))) return true;
    }
  } catch {
    // Incomplete JSON during parse — still hide if it looks like graph output
    if (inner.startsWith('{') && INTERNAL_JSON_KEY_RE.test(inner)) return true;
  }

  return false;
}

function shouldSuppressTokenStream(buffer: string, jsonLocked: boolean): boolean {
  if (jsonLocked) return true;
  const lead = buffer.trimStart();
  if (lead.startsWith('```')) return true;
  if (lead.startsWith('{') || lead.startsWith('[')) return true;
  if (/^```[a-z]/i.test(lead)) return true;
  return false;
}

function pruneTrailingHiddenAssistant(items: ChatItem[]): ChatItem[] {
  const next = [...items];
  while (next.length > 0) {
    const last = next[next.length - 1];
    if (last.kind === 'text' && last.role === 'assistant' && shouldHideAssistantBlob(last.text)) {
      next.pop();
      continue;
    }
    break;
  }
  return next;
}

export default function ChatScreen() {
  const { colors, typography } = useTheme();
  const { user } = useAuth();
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [needsClarification, setNeedsClarification] = useState(false);
  /** Single in-place loading line (replaces stacking progress bubbles) */
  const [activityLine, setActivityLine] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const idCounterRef = useRef(0);
  const lastAssistantTextRef = useRef<string>('');
  /** LLM streams JSON for ask_clarifying_q; hide it until structured clarification event arrives */
  const streamIsJsonRef = useRef(false);
  const streamingTextRef = useRef('');

  const nextId = (prefix: 'sys' | 'u' | 'a') => {
    // Date.now() alone can collide when multiple events arrive in the same millisecond
    const n = idCounterRef.current++;
    return `${prefix}_${Date.now()}_${n}`;
  };

  const userId = useMemo(() => {
    // Orchestrator requires a user_id query param; for demo we can use email or fallback.
    return user?.email || user?.id || 'demo_user';
  }, [user?.email, user?.id]);

  const sessionId = useMemo(() => {
    // Stable for the lifecycle of this screen instance.
    return `sess_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`;
  }, []);

  const clientRef = useRef<OrchestratorWebSocketClient | null>(null);

  const appendSystem = (text: string) => {
    setMessages((prev) => [...prev, { id: nextId('sys'), kind: 'text', role: 'system', text }]);
  };

  const appendUser = (text: string) => {
    setMessages((prev) => [...prev, { id: nextId('u'), kind: 'text', role: 'user', text }]);
  };

  const appendAssistant = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (shouldHideAssistantBlob(trimmed)) return;
    if (trimmed === lastAssistantTextRef.current) return;
    lastAssistantTextRef.current = trimmed;
    setMessages((prev) => [...prev, { id: nextId('a'), kind: 'text', role: 'assistant', text: trimmed }]);
  };

  const appendResults = (products: OrchestratorProduct[], summary?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId('a'),
        kind: 'results',
        products,
        summary,
      },
    ]);
  };

  const openProductLink = async (product: OrchestratorProduct) => {
    const url = product.deep_link || product.marketplace_url;
    if (!url) {
      appendSystem('No product link available for this item.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        appendSystem(`Cannot open URL: ${url}`);
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      appendSystem(`Failed to open URL: ${(e as Error)?.message || String(e)}`);
    }
  };

  const connect = async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);
    try {
      const client = new OrchestratorWebSocketClient({ sessionId, userId });
      clientRef.current = client;

      const unsubscribe = client.onEvent((event: OrchestratorServerEvent) => {
        if (event.type === 'connected') {
          setIsConnected(true);
          streamIsJsonRef.current = false;
          streamingTextRef.current = '';
          return;
        }

        if (event.type === 'thinking') {
          setActivityLine(String(event.data?.message || 'Thinking…').trim());
          return;
        }

        if (event.type === 'progress') {
          setActivityLine(String(event.data?.message || 'Working…').trim());
          return;
        }

        if (event.type === 'token') {
          setActivityLine(null);
          const token = String(event.data?.content || '');
          if (!token) return;
          setStreamingText((prev) => {
            const next = prev + token;
            if (shouldSuppressTokenStream(next, streamIsJsonRef.current)) {
              streamIsJsonRef.current = true;
              streamingTextRef.current = '';
              return '';
            }
            streamingTextRef.current = next;
            return next;
          });
          return;
        }

        if (event.type === 'clarification') {
          streamIsJsonRef.current = false;
          streamingTextRef.current = '';
          setStreamingText('');
          setActivityLine(null);
          setNeedsClarification(true);
          const question = String(event.data?.question || 'Can you clarify?').trim();
          const contextRaw = event.data?.context;
          const context =
            contextRaw !== undefined && contextRaw !== null && String(contextRaw).trim() !== ''
              ? String(contextRaw).trim()
              : undefined;
          const suggestions = normalizeSuggestionList(event.data?.suggestions);
          setMessages((prev) => {
            const pruned = pruneTrailingHiddenAssistant(prev);
            return [
              ...pruned,
              {
                id: nextId('a'),
                kind: 'clarification',
                question,
                context,
                suggestions,
              },
            ];
          });
          return;
        }

        if (event.type === 'results') {
          setActivityLine(null);
          const products = Array.isArray(event.data?.products) ? (event.data.products as OrchestratorProduct[]) : [];
          const count = products.length;
          const finalResponse = event.data?.final_response ? String(event.data.final_response) : undefined;
          appendResults(products, finalResponse || `Found ${count} products`);
          return;
        }

        if (event.type === 'error') {
          streamIsJsonRef.current = false;
          streamingTextRef.current = '';
          setStreamingText('');
          setActivityLine(null);
          appendSystem(`Error: ${event.data?.error || 'Unknown error'}`);
          return;
        }

        if (event.type === 'done') {
          streamIsJsonRef.current = false;
          setActivityLine(null);
          let buffered = streamingTextRef.current.trim();
          streamingTextRef.current = '';
          setStreamingText('');
          if (shouldHideAssistantBlob(buffered)) {
            buffered = '';
          }
          const msg = event.data?.message ? String(event.data.message).trim() : '';

          if (buffered) {
            appendAssistant(buffered);
          }

          if (msg && !shouldHideAssistantBlob(msg)) {
            if (msg !== buffered) {
              appendAssistant(msg);
            }
          }
          setNeedsClarification(false);
          return;
        }
      });

      await client.connect();

      // Cleanup on disconnect/reconnect
      clientRef.current = client;

      // Ensure we clean subscription when client is replaced
      (clientRef.current as any).__unsubscribe = unsubscribe;
    } catch (e) {
      appendSystem(`Failed to connect: ${(e as Error)?.message || String(e)}`);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    const client = clientRef.current;
    if (client) {
      try {
        const unsub = (client as any).__unsubscribe as undefined | (() => void);
        unsub?.();
      } catch {
        // ignore
      }
      client.disconnect();
      clientRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setActivityLine(null);
    appendSystem('Disconnected');
  };

  const sendWithText = (textRaw: string) => {
    const text = textRaw.trim();
    if (!text) return;
    const client = clientRef.current;
    if (!client || !client.isConnected()) {
      appendSystem('Not connected. Tap Connect first.');
      return;
    }

    // Flush any partial assistant stream before sending next message
    const pending = streamingTextRef.current.trim();
    if (pending && !shouldHideAssistantBlob(pending)) {
      appendAssistant(pending);
    }
    streamingTextRef.current = '';
    setStreamingText('');
    streamIsJsonRef.current = false;

    appendUser(text);
    setInput('');
    setActivityLine('Sending…');

    try {
      if (needsClarification) {
        client.sendClarificationAnswer(text);
        setNeedsClarification(false);
      } else {
        client.sendUserMessage(text);
      }
    } catch (e) {
      setActivityLine(null);
      appendSystem(`Send failed: ${(e as Error)?.message || String(e)}`);
    }
  };

  const send = () => sendWithText(input);

  // Auto-connect when user lands on Chat tab (good for demos).
  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raw = prefill;
    const text = Array.isArray(raw) ? raw[0] : raw;
    if (typeof text === 'string' && text.trim()) {
      setInput(text.trim());
    }
  }, [prefill]);

  useEffect(() => {
    // Keep the latest message visible
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, streamingText, activityLine]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.status, { color: isConnected ? colors.success : colors.textSecondary }]}>
              {isConnected ? 'Connected' : isConnecting ? 'Connecting…' : 'Disconnected'}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.connectButton,
              { backgroundColor: isConnected ? colors.surface : colors.primary, borderColor: colors.border },
            ]}
            onPress={isConnected ? disconnect : connect}
            disabled={isConnecting}
          >
            <Ionicons name={isConnected ? 'close' : 'link'} size={16} color={isConnected ? colors.text : '#fff'} />
            <Text style={[styles.connectButtonText, { color: isConnected ? colors.text : '#fff' }]}>
              {isConnected ? 'Disconnect' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: colors.text, ...typography.h1 }]}>Chat with us</Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary, ...typography.body }]}>
            Ask what you need—we’ll help you find products.
          </Text>
        </View>

        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((m) => {
            if (m.kind === 'clarification') {
              return (
                <View
                  key={m.id}
                  style={[
                    styles.clarifyCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.primary + '40',
                    },
                  ]}
                >
                  <View style={[styles.clarifyBadge, { backgroundColor: colors.primary + '22' }]}>
                    <Ionicons name="help-circle-outline" size={14} color={colors.primary} />
                    <Text style={[styles.clarifyBadgeText, { color: colors.primary }]}>Quick question</Text>
                  </View>
                  <Text style={[styles.clarifyQuestion, { color: colors.text }]}>{m.question}</Text>
                  {m.context ? (
                    <Text style={[styles.clarifyContext, { color: colors.textSecondary }]}>{m.context}</Text>
                  ) : null}
                  {m.suggestions.length > 0 ? (
                    <View style={styles.chipWrap}>
                      {m.suggestions.map((s, i) => (
                        <TouchableOpacity
                          key={`sg_${i}_${s.slice(0, 24)}`}
                          style={[
                            styles.suggestionChip,
                            {
                              borderColor: colors.primary,
                              backgroundColor: colors.primary + '14',
                            },
                          ]}
                          onPress={() => sendWithText(s)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.suggestionChipText, { color: colors.primary }]} numberOfLines={2}>
                            {s}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[styles.clarifyHint, { color: colors.textSecondary }]}>
                    Tap a suggestion to send it, or type your own answer below.
                  </Text>
                </View>
              );
            }

            if (m.kind === 'results') {
              return (
                <View
                  key={m.id}
                  style={[
                    styles.resultsContainer,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.resultsTitle, { color: colors.text, ...typography.h3 }]}>
                    {m.summary || 'Results'}
                  </Text>

                  {m.products.length === 0 ? (
                    <Text style={{ color: colors.textSecondary }}>No products returned.</Text>
                  ) : (
                    <View style={styles.resultsList}>
                      {m.products.map((p, idx) => {
                        const key = p.product_id ? `${p.product_id}_${idx}` : `p_${m.id}_${idx}`;
                        const image = p.image_url;
                        const title = p.title || 'Untitled product';
                        const price = typeof p.price === 'number' ? p.price : undefined;
                        const currency = p.currency || 'USD';
                        const rating = typeof p.rating === 'number' ? p.rating : undefined;
                        const reviews = typeof p.review_count === 'number' ? p.review_count : undefined;
                        const marketplace = p.marketplace || '';

                        return (
                          <View key={key} style={[styles.productCard, { borderColor: colors.border }]}>
                            <View style={styles.productRow}>
                              <View style={[styles.productImageWrap, { backgroundColor: colors.background }]}>
                                {image ? (
                                  <Image source={{ uri: image }} style={styles.productImage} resizeMode="cover" />
                                ) : (
                                  <View style={styles.productImagePlaceholder}>
                                    <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
                                  </View>
                                )}
                              </View>

                              <View style={styles.productInfo}>
                                <Text numberOfLines={2} style={[styles.productTitle, { color: colors.text }]}>
                                  {title}
                                </Text>
                                <Text style={{ color: colors.textSecondary }}>
                                  {marketplace ? `${marketplace} • ` : ''}{price !== undefined ? `${currency} ${price.toFixed(2)}` : `Price N/A`}
                                </Text>
                                {rating !== undefined && (
                                  <Text style={{ color: colors.textSecondary }}>
                                    ⭐ {rating.toFixed(1)}{reviews !== undefined ? ` (${reviews})` : ''}
                                  </Text>
                                )}
                              </View>
                            </View>

                            <TouchableOpacity
                              style={[styles.openButton, { backgroundColor: colors.primary }]}
                              onPress={() => openProductLink(p)}
                              activeOpacity={0.85}
                            >
                              <Ionicons name="open-outline" size={16} color="#fff" />
                              <Text style={styles.openButtonText}>Open</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            }

            if (m.kind === 'text' && m.role === 'assistant' && shouldHideAssistantBlob(m.text)) {
              return null;
            }

            return (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  m.role === 'user'
                    ? styles.userBubble
                    : m.role === 'assistant'
                      ? styles.assistantBubble
                      : styles.systemBubble,
                  {
                    backgroundColor:
                      m.role === 'user' ? colors.primary : m.role === 'assistant' ? colors.surface : colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: m.role === 'user' ? '#fff' : colors.text,
                    ...(m.role === 'assistant'
                      ? { fontSize: 16, lineHeight: 22 }
                      : m.role === 'system'
                        ? { fontSize: 12, lineHeight: 16 }
                        : {}),
                  }}
                >
                  {m.text}
                </Text>
              </View>
            );
          })}
          {activityLine ? (
            <View
              style={[
                styles.activityInline,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.activityText, { color: colors.textSecondary }]} numberOfLines={2}>
                {activityLine}
              </Text>
            </View>
          ) : null}
          {streamingText.length > 0 && !shouldHideAssistantBlob(streamingText) && (
            <View
              style={[
                styles.bubble,
                styles.assistantBubble,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22 }}>{streamingText}</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={needsClarification ? 'Answer the question…' : 'Message…'}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            multiline={false}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={send}
          />
          <TouchableOpacity
            onPress={send}
            style={[styles.sendButton, { backgroundColor: colors.primary }]}
            disabled={!input.trim()}
          >
            <Ionicons name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
  },
  hero: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    textAlign: 'center',
    opacity: 0.85,
    paddingHorizontal: 12,
  },
  status: {
    fontSize: 12,
  },
  connectButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  activityInline: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  activityText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  messages: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingVertical: 12,
    gap: 12,
  },
  clarifyCard: {
    alignSelf: 'stretch',
    marginHorizontal: 0,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  clarifyBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  clarifyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clarifyQuestion: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
  },
  clarifyContext: {
    fontSize: 14,
    lineHeight: 20,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
  suggestionChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  clarifyHint: {
    fontSize: 12,
    marginTop: 4,
  },
  bubble: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    maxWidth: '92%',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
  },
  systemBubble: {
    alignSelf: 'center',
  },
  inputRow: {
    borderTopWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  resultsTitle: {
    fontWeight: '700',
  },
  resultsList: {
    gap: 12,
  },
  productCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  productRow: {
    flexDirection: 'row',
    gap: 12,
  },
  productImageWrap: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: 64,
    height: 64,
  },
  productImagePlaceholder: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
    gap: 4,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  openButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  openButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
