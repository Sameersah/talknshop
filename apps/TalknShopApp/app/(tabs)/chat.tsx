import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  | { id: string; kind: 'results'; products: OrchestratorProduct[]; summary?: string };

export default function ChatScreen() {
  const { colors, typography } = useTheme();
  const { user } = useAuth();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [needsClarification, setNeedsClarification] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const idCounterRef = useRef(0);
  const lastAssistantTextRef = useRef<string>('');

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
          appendSystem(`Connected (session: ${event.session_id || sessionId})`);
          return;
        }

        if (event.type === 'thinking') {
          // Keep the UI less noisy: show one "thinking" line at most
          appendSystem(event.data?.message || 'Thinking…');
          return;
        }

        if (event.type === 'progress') {
          // Progress can be very chatty; keep it minimal
          const msg = event.data?.message || 'Working…';
          appendSystem(msg);
          return;
        }

        if (event.type === 'token') {
          const token = String(event.data?.content || '');
          if (token) setStreamingText((prev) => prev + token);
          return;
        }

        if (event.type === 'clarification') {
          setNeedsClarification(true);
          const q = event.data?.question || 'Can you clarify?';
          appendAssistant(q);
          return;
        }

        if (event.type === 'results') {
          const products = Array.isArray(event.data?.products) ? (event.data.products as OrchestratorProduct[]) : [];
          const count = products.length;
          const finalResponse = event.data?.final_response ? String(event.data.final_response) : undefined;
          appendResults(products, finalResponse || `Found ${count} products`);
          return;
        }

        if (event.type === 'error') {
          appendSystem(`Error: ${event.data?.error || 'Unknown error'}`);
          return;
        }

        if (event.type === 'done') {
          if (streamingText.trim()) {
            appendAssistant(streamingText.trim());
            setStreamingText('');
          }
          // Avoid duplicating "final_response" that may have been shown in RESULTS
          if (event.data?.message) appendAssistant(String(event.data.message));
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
    appendSystem('Disconnected');
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const client = clientRef.current;
    if (!client || !client.isConnected()) {
      appendSystem('Not connected. Tap Connect first.');
      return;
    }

    // Flush any partial assistant stream before sending next message
    if (streamingText.trim()) {
      appendAssistant(streamingText.trim());
      setStreamingText('');
    }

    appendUser(text);
    setInput('');

    try {
      if (needsClarification) {
        client.sendClarificationAnswer(text);
        setNeedsClarification(false);
      } else {
        client.sendUserMessage(text);
      }
    } catch (e) {
      appendSystem(`Send failed: ${(e as Error)?.message || String(e)}`);
    }
  };

  // Auto-connect when user lands on Chat tab (good for demos).
  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Keep the latest message visible
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, streamingText]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.text, ...typography.h2 }]}>Orchestrator Chat</Text>
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

        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((m) => {
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
                <Text style={{ color: m.role === 'user' ? '#fff' : colors.text }}>{m.text}</Text>
              </View>
            );
          })}
          {streamingText.length > 0 && (
            <View
              style={[
                styles.bubble,
                styles.assistantBubble,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.text }}>{streamingText}</Text>
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
            multiline
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
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
  },
  status: {
    marginTop: 4,
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
  messages: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingVertical: 12,
    gap: 10,
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
