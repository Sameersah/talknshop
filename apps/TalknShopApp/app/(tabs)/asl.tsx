import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import {
  recognizeAslVideoFromUri,
  type AslRecognitionOutcome,
  type AslAlternative,
} from '@/services/aslService';

/** Matches talknshop-web MessageInput ASL panel accent (teal). */
const ASL_TEAL = '#14b8a6';
const ASL_TEAL_MUTED = 'rgba(20, 184, 166, 0.15)';

function guessMime(uri: string, fileName: string): string {
  const lower = (fileName || uri).toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

function aslDebugHint(outcome: AslRecognitionOutcome): string {
  const parts: string[] = [];
  if (outcome.decision && outcome.decision !== 'stub') {
    parts.push(`decision=${outcome.decision}`);
  }
  if (typeof outcome.confidence === 'number') {
    parts.push(`confidence=${outcome.confidence.toFixed(2)}`);
  }
  return parts.length ? parts.join(' · ') : 'ASL video recognized';
}

export default function AslScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AslRecognitionOutcome | null>(null);
  const [manualOverride, setManualOverride] = useState('');

  const clearOutcome = useCallback(() => {
    setOutcome(null);
    setManualOverride('');
    setStatus(null);
  }, []);

  const runPredict = useCallback(async (uri: string, fileName: string) => {
    setBusy(true);
    setStatus('Uploading and recognizing ASL video…');
    setOutcome(null);
    try {
      const mime = guessMime(uri, fileName);
      const result = await recognizeAslVideoFromUri(uri, fileName, mime);
      setOutcome(result);
      setManualOverride('');
      setStatus(aslDebugHint(result));
    } catch (e) {
      setOutcome(null);
      setStatus(e instanceof Error ? e.message : 'ASL recognition failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const pickFromLibrary = async () => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') {
      setStatus('Photo library permission is required to upload ASL video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    const fileName = asset.fileName || uri.split('/').pop() || `asl_${Date.now()}.mp4`;
    await runPredict(uri, fileName);
  };

  const recordFromCamera = async () => {
    const { status: cam } = await ImagePicker.requestCameraPermissionsAsync();
    if (cam !== 'granted') {
      setStatus('Camera permission is required to record ASL video.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    const fileName = asset.fileName || uri.split('/').pop() || `asl_record_${Date.now()}.mov`;
    await runPredict(uri, fileName);
  };

  const confirmText = (text: string) => {
    const t = text.trim();
    if (!t) return;
    router.push({
      pathname: '/(tabs)/chat',
      params: { prefill: t },
    });
  };

  const onPickAlternative = (a: AslAlternative) => {
    const q = (a.query || a.gloss || '').trim();
    if (q) confirmText(q);
  };

  const activeTranscript = manualOverride.trim() || outcome?.transcript?.trim() || '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 12) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={[styles.heroTitle, { color: colors.text, ...typography.h1 }]}>Sign to shop</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary, ...typography.body }]}>
              Record or upload a clip—we turn your signs into text for Chat.
            </Text>
          </View>

          <View style={[styles.hintCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.hintTitle, { color: ASL_TEAL }]}>How it works</Text>
            <Text style={{ color: colors.textSecondary, ...typography.caption, marginTop: 6 }}>
              Type below or use record / upload for ASL — both work together. After recognition, pick a
              suggestion or edit the text, then open Chat to search with the assistant.
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: ASL_TEAL, borderColor: ASL_TEAL },
                busy && styles.actionBtnDisabled,
              ]}
              onPress={recordFromCamera}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="videocam" size={22} color="#fff" />
              <Text style={styles.actionBtnText}>Record</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: ASL_TEAL,
                },
                busy && styles.actionBtnDisabled,
              ]}
              onPress={pickFromLibrary}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="folder-open" size={22} color={ASL_TEAL} />
              <Text style={[styles.actionBtnTextOutline, { color: ASL_TEAL }]}>Upload</Text>
            </TouchableOpacity>
          </View>

          {busy && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={ASL_TEAL} />
              <Text style={[styles.loadingLabel, { color: colors.textSecondary }]}>Processing…</Text>
            </View>
          )}

          {status && !busy && (
            <View style={[styles.statusBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.text, ...typography.caption }}>{status}</Text>
            </View>
          )}

          {outcome && (
            <View style={[styles.resultCard, { borderColor: `${ASL_TEAL}66`, backgroundColor: ASL_TEAL_MUTED }]}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Top transcript</Text>
              <Text style={[styles.transcript, { color: colors.text }]}>&quot;{outcome.transcript}&quot;</Text>

              {(outcome.alternatives?.length ?? 0) > 0 && (
                <>
                  <Text style={[styles.altLabel, { color: colors.textSecondary }]}>Choose a search word</Text>
                  <View style={styles.chipWrap}>
                    {outcome.alternatives!.slice(0, 8).map((a, i) => {
                      const label = a.query || a.gloss || `alt_${i}`;
                      return (
                        <TouchableOpacity
                          key={`${label}_${i}`}
                          style={[styles.chip, { borderColor: ASL_TEAL, backgroundColor: colors.background }]}
                          onPress={() => onPickAlternative(a)}
                        >
                          <Text style={[styles.chipText, { color: ASL_TEAL }]} numberOfLines={1}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={[styles.altLabel, { color: colors.textSecondary }]}>Or type / fix wording</Text>
              <TextInput
                value={manualOverride}
                onChangeText={setManualOverride}
                placeholder="Override transcript…"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.manualInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                ]}
              />

              <View style={styles.resultActions}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                  onPress={clearOutcome}
                >
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryMergeBtn,
                    { backgroundColor: colors.primary, opacity: activeTranscript ? 1 : 0.45 },
                  ]}
                  disabled={!activeTranscript}
                  onPress={() => confirmText(activeTranscript)}
                >
                  <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
                  <Text style={styles.primaryMergeBtnText}>Open Chat with this</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!outcome && !busy && (
            <TouchableOpacity
              style={[styles.stubNote, { borderColor: colors.border }]}
              onPress={() =>
                setStatus(
                  'Tip: With ASL_USE_STUB=1 the service returns a demo transcript so you can test the UI without a model.'
                )
              }
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.stubNoteText, { color: colors.textSecondary }]}>
                Stub mode returns a sample phrase — check asl-service .env for ASL_USE_STUB.
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  hero: {
    paddingVertical: 20,
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
  hintCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  hintTitle: { fontWeight: '700', fontSize: 15 },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnDisabled: { opacity: 0.55 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actionBtnTextOutline: { fontWeight: '700', fontSize: 15 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingLabel: { fontSize: 14 },
  statusBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  resultLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  transcript: { fontSize: 17, fontWeight: '600', lineHeight: 24 },
  altLabel: { fontSize: 12, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  chipText: { fontWeight: '600', fontSize: 13 },
  manualInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  resultActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  primaryMergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexGrow: 1,
    justifyContent: 'center',
  },
  primaryMergeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stubNote: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  stubNoteText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
