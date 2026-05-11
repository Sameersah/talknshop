import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import {
  recognizeAslVideoFromUri,
  type AslRecognitionOutcome,
  type AslAlternative,
} from '@/services/aslService';
import {
  AuroraOrb,
  Chip,
  GradientButton,
  IconBadge,
  PressableScale,
  SectionHeader,
  WhisperBackground,
  type OrbState,
} from '@/components/ui';

function guessMime(uri: string, fileName: string): string {
  const lower = (fileName || uri).toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

export default function AslScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AslRecognitionOutcome | null>(null);
  const [manualOverride, setManualOverride] = useState('');

  const orbState: OrbState = busy ? 'listening' : outcome ? 'responding' : 'idle';

  const clearOutcome = useCallback(() => {
    setOutcome(null);
    setManualOverride('');
    setStatus(null);
  }, []);

  const runPredict = useCallback(async (uri: string, fileName: string) => {
    setBusy(true);
    setStatus('Recognizing sign…');
    setOutcome(null);
    try {
      const mime = guessMime(uri, fileName);
      const result = await recognizeAslVideoFromUri(uri, fileName, mime);
      setOutcome(result);
      setManualOverride('');
      setStatus(null);
    } catch (e) {
      setOutcome(null);
      setStatus(e instanceof Error ? e.message : 'Recognition failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const pickFromLibrary = async () => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') {
      setStatus('Photo library access is required.');
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
      setStatus('Camera access is required.');
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
    router.push({ pathname: '/(tabs)/chat', params: { prefill: t } });
  };

  const onPickAlternative = (a: AslAlternative) => {
    const q = (a.query || a.gloss || '').trim();
    if (q) confirmText(q);
  };

  const activeTranscript = manualOverride.trim() || outcome?.transcript?.trim() || '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WhisperBackground />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <PressableScale onPress={() => router.back()} haptic="selection" style={styles.backBtn}>
            <View style={[styles.backInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </View>
          </PressableScale>

          {/* Hero */}
          <View style={styles.hero}>
            <AuroraOrb size={104} state={orbState} />
            <Text style={[typography.label, { color: colors.primary, marginTop: 20 }]}>
              ACCESSIBILITY · ASL
            </Text>
            <Text style={[typography.display, { color: colors.text, marginTop: 6, textAlign: 'center' }]}>
              Sign to shop.
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 8, textAlign: 'center' }]}>
              Record or upload a sign — we translate it into a search the AI understands.
            </Text>
          </View>

          {/* Primary actions */}
          {!outcome ? (
            <View style={styles.actionsRow}>
              <PressableScale
                onPress={recordFromCamera}
                disabled={busy}
                haptic="medium"
                style={{ flex: 1 }}
              >
                <View style={[styles.actionTile, { backgroundColor: colors.surface, borderColor: colors.borderStrong ?? colors.border }]}>
                  <IconBadge icon="videocam-outline" size="md" variant="gradient" />
                  <Text style={[typography.bodyMd, { color: colors.text, marginTop: 10 }]}>Record</Text>
                  <Text style={[typography.caption, { color: colors.textTertiary ?? colors.textSecondary }]}>
                    Use camera
                  </Text>
                </View>
              </PressableScale>
              <PressableScale
                onPress={pickFromLibrary}
                disabled={busy}
                haptic="selection"
                style={{ flex: 1 }}
              >
                <View style={[styles.actionTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <IconBadge icon="folder-open-outline" size="md" variant="subtle" />
                  <Text style={[typography.bodyMd, { color: colors.text, marginTop: 10 }]}>Upload</Text>
                  <Text style={[typography.caption, { color: colors.textTertiary ?? colors.textSecondary }]}>
                    From library
                  </Text>
                </View>
              </PressableScale>
            </View>
          ) : null}

          {/* Status / processing */}
          {busy ? (
            <View
              style={[
                styles.processingCard,
                { backgroundColor: colors.surface, borderColor: colors.borderStrong ?? colors.border },
              ]}
            >
              <ActivityIndicator color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyMd, { color: colors.text }]}>Watching your sign…</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  This usually takes a couple seconds.
                </Text>
              </View>
            </View>
          ) : null}

          {status && !busy ? (
            <View style={[styles.statusBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={[typography.caption, { color: colors.text, flex: 1 }]}>{status}</Text>
            </View>
          ) : null}

          {/* Transcript card */}
          {outcome ? (
            <View style={styles.section}>
              <SectionHeader title="We heard" eyebrow="TRANSCRIPT" />
              <View
                style={[
                  styles.transcriptCard,
                  { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.borderStrong ?? colors.border },
                ]}
              >
                <Text style={[typography.h1, { color: colors.text }]}>
                  &ldquo;{outcome.transcript}&rdquo;
                </Text>
              </View>

              {(outcome.alternatives?.length ?? 0) > 0 ? (
                <View style={styles.altSection}>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>OR PICK ANOTHER</Text>
                  <View style={styles.chipWrap}>
                    {outcome.alternatives!.slice(0, 8).map((a, i) => {
                      const label = a.query || a.gloss || `alt_${i}`;
                      return (
                        <Chip
                          key={`${label}_${i}`}
                          label={label}
                          onPress={() => onPickAlternative(a)}
                          variant="outline"
                        />
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={styles.altSection}>
                <Text style={[typography.label, { color: colors.textSecondary }]}>
                  EDIT WORDING
                </Text>
                <View style={[styles.textField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    value={manualOverride}
                    onChangeText={setManualOverride}
                    placeholder={outcome.transcript}
                    placeholderTextColor={colors.textTertiary ?? colors.textSecondary}
                    style={[styles.textInput, { color: colors.text, fontFamily: 'Geist_500Medium' }]}
                  />
                </View>
              </View>

              <View style={styles.confirmRow}>
                <PressableScale onPress={clearOutcome} haptic="selection" style={{ flex: 1 }}>
                  <View style={[styles.secondaryBtn, { borderColor: colors.borderStrong ?? colors.border }]}>
                    <Text style={[typography.bodyMd, { color: colors.text }]}>Try again</Text>
                  </View>
                </PressableScale>
                <View style={{ flex: 1.4 }}>
                  <GradientButton
                    label="Search with this"
                    icon="arrow-forward"
                    size="md"
                    disabled={!activeTranscript}
                    onPress={() => confirmText(activeTranscript)}
                  />
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 24 },

  backBtn: { alignSelf: 'flex-start' },
  backInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },

  hero: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },

  actionsRow: { flexDirection: 'row', gap: 12 },
  actionTile: {
    alignItems: 'flex-start',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },

  processingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },

  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },

  section: { gap: 12 },
  transcriptCard: {
    padding: 22,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  altSection: { gap: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  textField: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  textInput: { fontSize: 15, paddingVertical: 12 },

  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
