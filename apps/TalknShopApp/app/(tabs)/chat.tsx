import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/components/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { OrchestratorWebSocketClient, OrchestratorServerEvent } from '@/services/orchestratorWebSocket';
import {
  AuroraOrb,
  Chip,
  IconBadge,
  PressableScale,
  WhisperBackground,
  type OrbState,
} from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { AURORA_COLORS, AURORA_LOCATIONS } from '@/constants/theme';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing as RNEasing,
} from 'react-native-reanimated';

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

// ── JSON-blob filters (untouched from previous implementation) ────────────────

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

function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/im.exec(t);
  if (fenced) return fenced[1].trim();
  return t;
}

const INTERNAL_JSON_KEY_RE =
  /"(product_type|requirement_spec|attributes|suggestions|question|context|clarifying_question|filters|pagination|price|brand|category)"\s*:/;

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

// ── Starter prompts (3 only, full-width rows, no emoji) ───────────────────────

type StarterIdea = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
};

const STARTER_IDEAS: StarterIdea[] = [
  {
    icon: 'flash-outline',
    title: 'Fast wireless earbuds',
    message: 'Wireless noise-cancelling earbuds under $200',
  },
  {
    icon: 'laptop-outline',
    title: 'Student laptop',
    message: 'Lightweight laptop for a college student under $800',
  },
  {
    icon: 'home-outline',
    title: 'Cozy coffee maker',
    message: 'Quiet drip coffee maker under $80',
  },
];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors, typography } = useTheme();
  const { user } = useAuth();
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const insets = useSafeAreaInsets();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [needsClarification, setNeedsClarification] = useState(false);
  const [activityLine, setActivityLine] = useState<string | null>(null);

  const idCounterRef = useRef(0);
  const lastAssistantTextRef = useRef<string>('');
  const streamIsJsonRef = useRef(false);
  const streamingTextRef = useRef('');
  const scrollRef = useRef<ScrollView | null>(null);

  const nextId = (prefix: 'sys' | 'u' | 'a') => {
    const n = idCounterRef.current++;
    return `${prefix}_${Date.now()}_${n}`;
  };

  const userId = useMemo(() => user?.email || user?.id || 'demo_user', [user?.email, user?.id]);
  const sessionId = useMemo(() => `sess_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`, []);

  const clientRef = useRef<OrchestratorWebSocketClient | null>(null);
  const connectInFlightRef = useRef<Promise<void> | null>(null);
  const chatScreenActiveRef = useRef(true);

  // Orb state derives from server activity (idle / listening / thinking / responding)
  const orbState: OrbState = useMemo(() => {
    if (streamingText.length > 0) return 'responding';
    if (activityLine != null) return 'thinking';
    if (isConnecting) return 'thinking';
    return 'idle';
  }, [streamingText, activityLine, isConnecting]);

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
    setMessages((prev) => [...prev, { id: nextId('a'), kind: 'results', products, summary }]);
  };

  const openProductLink = async (product: OrchestratorProduct) => {
    const url = product.deep_link || product.marketplace_url;
    if (!url) return appendSystem('No product link available.');
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) return appendSystem(`Cannot open URL: ${url}`);
      await Linking.openURL(url);
    } catch (e) {
      appendSystem(`Failed to open: ${(e as Error)?.message || String(e)}`);
    }
  };

  const connect = (): Promise<void> => {
    if (clientRef.current?.isConnected()) {
      setIsConnected(true);
      return Promise.resolve();
    }
    if (connectInFlightRef.current) return connectInFlightRef.current;

    const promise = (async () => {
      setIsConnecting(true);
      let client: OrchestratorWebSocketClient | null = null;
      let unsubscribe: (() => void) | undefined;
      try {
        client = new OrchestratorWebSocketClient({ sessionId, userId });
        clientRef.current = client;

        unsubscribe = client.onEvent((event: OrchestratorServerEvent) => {
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
              return [...pruned, { id: nextId('a'), kind: 'clarification', question, context, suggestions }];
            });
            return;
          }
          if (event.type === 'results') {
            setActivityLine(null);
            const products = Array.isArray(event.data?.products) ? (event.data.products as OrchestratorProduct[]) : [];
            const finalResponse = event.data?.final_response ? String(event.data.final_response) : undefined;
            appendResults(products, finalResponse || `Found ${products.length} matches`);
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
            if (shouldHideAssistantBlob(buffered)) buffered = '';
            const msg = event.data?.message ? String(event.data.message).trim() : '';
            if (buffered) appendAssistant(buffered);
            if (msg && !shouldHideAssistantBlob(msg) && msg !== buffered) appendAssistant(msg);
            setNeedsClarification(false);
            return;
          }
        });

        await client.connect();

        if (!chatScreenActiveRef.current) {
          try { unsubscribe?.(); client.disconnect(); } catch {}
          clientRef.current = null;
          return;
        }

        (clientRef.current as any).__unsubscribe = unsubscribe;
      } catch (e) {
        setIsConnected(false);
        try { unsubscribe?.(); client?.disconnect(); } catch {}
        if (clientRef.current === client) clientRef.current = null;
        throw e;
      } finally {
        setIsConnecting(false);
      }
    })();

    connectInFlightRef.current = promise;
    promise.finally(() => {
      if (connectInFlightRef.current === promise) connectInFlightRef.current = null;
    });
    return promise;
  };

  const disconnect = () => {
    const client = clientRef.current;
    if (client) {
      try {
        const unsub = (client as any).__unsubscribe as undefined | (() => void);
        unsub?.();
      } catch {}
      client.disconnect();
      clientRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setActivityLine(null);
  };

  const sendWithText = async (textRaw: string) => {
    const text = textRaw.trim();
    if (!text) return;
    try { await connect(); } catch { return; }
    const client = clientRef.current;
    if (!client?.isConnected()) return;

    const pending = streamingTextRef.current.trim();
    if (pending && !shouldHideAssistantBlob(pending)) appendAssistant(pending);
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
    } catch {
      setActivityLine(null);
    }
  };

  // Send-pulse animation refs (expanding violet ring + bounce)
  const sendScale = useSharedValue(1);
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);

  const sendButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));
  const sendRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const triggerSendPulse = () => {
    sendScale.value = withSequence(
      withTiming(0.9, { duration: 80, easing: RNEasing.out(RNEasing.cubic) }),
      withTiming(1.08, { duration: 140, easing: RNEasing.out(RNEasing.cubic) }),
      withTiming(1, { duration: 180, easing: RNEasing.out(RNEasing.cubic) }),
    );
    ringScale.value = 0;
    ringOpacity.value = 0.55;
    ringScale.value = withTiming(2.4, { duration: 480, easing: RNEasing.out(RNEasing.cubic) });
    ringOpacity.value = withTiming(0, { duration: 480, easing: RNEasing.out(RNEasing.cubic) });
  };

  const send = () => {
    if (!input.trim()) return;
    triggerSendPulse();
    void sendWithText(input);
  };

  useEffect(() => {
    chatScreenActiveRef.current = true;
    void connect().catch(() => {});
    return () => {
      chatScreenActiveRef.current = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raw = prefill;
    const text = Array.isArray(raw) ? raw[0] : raw;
    if (typeof text === 'string' && text.trim()) setInput(text.trim());
  }, [prefill]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, streamingText, activityLine]);

  const showEmptyState = messages.length === 0 && streamingText.length === 0 && activityLine == null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WhisperBackground />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={(r) => { scrollRef.current = r; }}
          style={styles.messages}
          contentContainerStyle={[
            styles.messagesContent,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 160 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {showEmptyState ? (
            <View style={styles.emptyState}>
              <AuroraOrb size={104} state={orbState} />
              <Text style={[typography.display, styles.heroTitle, { color: colors.text }]}>
                Ask. Show. Sign.
              </Text>
              <Text style={[typography.body, styles.heroSubtitle, { color: colors.textSecondary }]}>
                One AI. Every modality. Tap a starter or use{' '}
                <Text style={{ color: colors.primary, fontFamily: 'Geist_600SemiBold' }}>voice / camera / sign</Text>{' '}
                below.
              </Text>

              <View style={styles.starterList}>
                {STARTER_IDEAS.map((idea) => (
                  <PressableScale
                    key={idea.title}
                    onPress={() => { void sendWithText(idea.message); }}
                    haptic="light"
                  >
                    <View style={[styles.starterRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <IconBadge icon={idea.icon} size="md" variant="subtle" />
                      <View style={styles.starterTextWrap}>
                        <Text style={[typography.bodyMd, { color: colors.text }]}>{idea.title}</Text>
                        <Text style={[typography.caption, { color: colors.textTertiary ?? colors.textSecondary }]} numberOfLines={1}>
                          {idea.message}
                        </Text>
                      </View>
                      <Ionicons name="arrow-forward" size={16} color={colors.textTertiary ?? colors.textSecondary} />
                    </View>
                  </PressableScale>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((m) => {
            if (m.kind === 'clarification') {
              return (
                <View
                  key={m.id}
                  style={[styles.clarifyCard, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.borderStrong ?? colors.border }]}
                >
                  <View style={[styles.clarifyBadge, { backgroundColor: colors.primaryMuted ?? colors.surface }]}>
                    <Ionicons name="sparkles" size={12} color={colors.primary} />
                    <Text style={[typography.label, { color: colors.primary }]}>I need a hint</Text>
                  </View>
                  <Text style={[typography.h2, { color: colors.text }]}>{m.question}</Text>
                  {m.context ? (
                    <Text style={[typography.body, { color: colors.textSecondary }]}>{m.context}</Text>
                  ) : null}
                  {m.suggestions.length > 0 ? (
                    <View style={styles.chipWrap}>
                      {m.suggestions.map((s, i) => (
                        <Chip
                          key={`sg_${i}_${s.slice(0, 24)}`}
                          label={s}
                          onPress={() => { void sendWithText(s); }}
                          active
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            }

            if (m.kind === 'results') {
              return (
                <View key={m.id} style={styles.resultsBlock}>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>
                    {m.products.length} MATCHES
                  </Text>
                  <Text style={[typography.h2, { color: colors.text, marginTop: 4 }]}>
                    {m.summary || 'Here you go'}
                  </Text>
                  {m.products.length === 0 ? (
                    <Text style={[typography.body, { color: colors.textSecondary, marginTop: 8 }]}>
                      No matches — try rephrasing.
                    </Text>
                  ) : (
                    <View style={styles.resultsList}>
                      {m.products.map((p, idx) => {
                        const key = p.product_id ? `${p.product_id}_${idx}` : `p_${m.id}_${idx}`;
                        const image = p.image_url;
                        const title = p.title || 'Untitled product';
                        const price = typeof p.price === 'number' ? p.price : undefined;
                        const currency = p.currency || 'USD';
                        const marketplace = p.marketplace || '';
                        return (
                          <PressableScale
                            key={key}
                            onPress={() => openProductLink(p)}
                            haptic="selection"
                          >
                            <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                              <View style={[styles.resultImageWrap, { backgroundColor: colors.surfaceSunk ?? colors.background }]}>
                                {image ? (
                                  <Image source={{ uri: image }} style={styles.resultImage} resizeMode="cover" />
                                ) : (
                                  <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
                                )}
                              </View>
                              <View style={styles.resultInfo}>
                                <Text numberOfLines={2} style={[typography.bodyMd, { color: colors.text }]}>
                                  {title}
                                </Text>
                                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                  {marketplace ? marketplace.toUpperCase() : 'WEB'}
                                </Text>
                                {price !== undefined ? (
                                  <Text style={[typography.priceLg, { color: colors.text, marginTop: 2 }]}>
                                    {currency === 'USD' ? `$${price.toFixed(2)}` : `${currency} ${price.toFixed(2)}`}
                                  </Text>
                                ) : null}
                              </View>
                              <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
                            </View>
                          </PressableScale>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            }

            if (m.kind === 'text' && m.role === 'assistant' && shouldHideAssistantBlob(m.text)) return null;

            const isUser = m.role === 'user';
            const isSystem = m.role === 'system';

            if (isSystem) {
              return (
                <View key={m.id} style={styles.systemBubble}>
                  <Text style={[typography.caption, { color: colors.textTertiary ?? colors.textSecondary, textAlign: 'center' }]}>
                    {m.text}
                  </Text>
                </View>
              );
            }

            if (isUser) {
              return (
                <View key={m.id} style={[styles.bubbleRow, { justifyContent: 'flex-end' }]}>
                  <LinearGradient
                    colors={[...AURORA_COLORS]}
                    locations={[...AURORA_LOCATIONS]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.userBubble]}
                  >
                    <Text style={[typography.body, { color: '#fff' }]}>{m.text}</Text>
                  </LinearGradient>
                </View>
              );
            }

            return (
              <View key={m.id} style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
                <View
                  style={[
                    styles.assistantBubble,
                    { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.assistantStripe} />
                  <Text style={[typography.body, { color: colors.text, flex: 1, paddingLeft: 10 }]}>
                    {m.text}
                  </Text>
                </View>
              </View>
            );
          })}

          {activityLine ? (
            <View style={[styles.activityChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Mini orb instead of plain ActivityIndicator — keeps the brand alive during streaming */}
              <AuroraOrb size={20} state="thinking" glow={false} />
              <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>
                {activityLine}
              </Text>
            </View>
          ) : null}

          {streamingText.length > 0 && !shouldHideAssistantBlob(streamingText) ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={[styles.assistantBubble, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.border }]}>
                <View style={styles.assistantStripe} />
                <Text style={[typography.body, { color: colors.text, flex: 1, paddingLeft: 10 }]}>
                  {streamingText}
                  <Text style={{ color: colors.primary }}> ▍</Text>
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* Gradient fade-mask so scroll content doesn't crash into the compose pill */}
        <LinearGradient
          colors={['rgba(10, 10, 15, 0)', 'rgba(10, 10, 15, 0.92)', 'rgba(10, 10, 15, 1)']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={[
            styles.composeFadeMask,
            { bottom: insets.bottom + 92, height: 80 },
          ]}
        />

        {/* Compose pill — sits above the floating tab bar */}
        <View
          style={[
            styles.composeWrap,
            { bottom: insets.bottom + 96 },
          ]}
        >
          <View
            style={[
              styles.compose,
              {
                backgroundColor: colors.surfaceRaised ?? colors.surface,
                borderColor: colors.borderStrong ?? colors.border,
              },
            ]}
          >
            <PressableScale onPress={() => router.push('/(tabs)/asl')} haptic="selection">
              <View style={[styles.composeIconBtn, { backgroundColor: colors.surface }]}>
                <Ionicons name="hand-left-outline" size={18} color={colors.primary} />
              </View>
            </PressableScale>

            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={needsClarification ? 'Answer the question…' : 'Type, sign, or speak…'}
              placeholderTextColor={colors.textTertiary ?? colors.textSecondary}
              style={[styles.composeInput, { color: colors.text }]}
              multiline
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={send}
            />

            <PressableScale
              onPress={send}
              disabled={!input.trim()}
              haptic="medium"
              pressedScale={0.92}
            >
              <View style={styles.sendBtnHost}>
                {/* Expanding violet ring on send (fires from triggerSendPulse) */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.sendRing,
                    { borderColor: colors.primary },
                    sendRingStyle,
                  ]}
                />
                {/* Send button — gradient when input has text, sunk-surface when disabled */}
                <Animated.View style={sendButtonStyle}>
                  {input.trim() ? (
                    <LinearGradient
                      colors={[...AURORA_COLORS]}
                      locations={[...AURORA_LOCATIONS]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.sendBtn}
                    >
                      <Ionicons name="arrow-up" size={18} color="#fff" />
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.sendBtn,
                        { backgroundColor: colors.surfaceSunk ?? colors.surface },
                      ]}
                    >
                      <Ionicons
                        name="arrow-up"
                        size={18}
                        color={colors.textTertiary ?? colors.textSecondary}
                      />
                    </View>
                  )}
                </Animated.View>
              </View>
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messages: { flex: 1, paddingHorizontal: 18 },
  messagesContent: { gap: 12 },

  emptyState: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  heroTitle: { textAlign: 'center', marginTop: 8 },
  heroSubtitle: {
    textAlign: 'center',
    paddingHorizontal: 8,
    marginTop: -8,
  },
  starterList: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 14,
  },
  starterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  starterTextWrap: { flex: 1, gap: 2 },

  bubbleRow: { flexDirection: 'row', width: '100%' },
  userBubble: {
    minWidth: 60,
    maxWidth: '85%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    shadowColor: '#7C5CFF',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  assistantBubble: {
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  assistantStripe: {
    width: 3,
    backgroundColor: '#7C5CFF',
    borderRadius: 2,
    marginRight: 6,
  },
  systemBubble: {
    alignSelf: 'center',
    paddingVertical: 4,
  },

  clarifyCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  clarifyBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  resultsBlock: { gap: 8 },
  resultsList: { gap: 10, marginTop: 4 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultImageWrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  resultImage: { width: 64, height: 64 },
  resultInfo: { flex: 1, gap: 2 },

  activityChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '88%',
  },

  composeWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  composeIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeInput: {
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 40,
    maxHeight: 96,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  sendBtnHost: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
  },

  composeFadeMask: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
