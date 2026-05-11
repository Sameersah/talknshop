import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { router } from 'expo-router';
import { OrchestratorWebSocketClient, type MediaItemForSend } from '@/services/orchestratorWebSocket';
import { uploadMediaFile } from '@/services/mediaUploadService';
import { getFeaturedProducts, searchProducts, Product } from '@/data/products';
import { searchCatalog } from '@/services/catalogService';
import {
  AuroraOrb,
  Chip,
  IconBadge,
  PressableScale,
  ProductTile,
  SectionHeader,
  WhisperBackground,
} from '@/components/ui';

const TRENDING_SEARCHES = [
  'Running shoes under $100',
  'Wireless headphones',
  'Coffee maker',
  'Lightweight laptop',
  'Winter jacket',
];

const QUICK_MODES: Array<{
  key: 'voice' | 'photo' | 'video' | 'sign';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}> = [
  { key: 'voice', icon: 'mic-outline', label: 'Voice' },
  { key: 'photo', icon: 'camera-outline', label: 'Photo' },
  { key: 'video', icon: 'videocam-outline', label: 'Video' },
  { key: 'sign', icon: 'hand-left-outline', label: 'Sign' },
];

const getFileSize = async (uri: string): Promise<number> => {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return (info as { size?: number }).size ?? 0;
  } catch {
    return 0;
  }
};

export const SearchScreen: React.FC = () => {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const wsClientRef = useRef<OrchestratorWebSocketClient | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const sessionIdRef = useRef(`sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const userIdRef = useRef('user_ios');

  useEffect(() => {
    const client = new OrchestratorWebSocketClient({
      sessionId: sessionIdRef.current,
      userId: userIdRef.current,
    });
    wsClientRef.current = client;
    client.connect().catch((e) => console.warn('Orchestrator WS connect failed', e));
    return () => {
      client.disconnect();
      wsClientRef.current = null;
    };
  }, []);

  // Auto-search as user types
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    let cancelled = false;
    (async () => {
      const remote = await searchCatalog(query);
      if (cancelled) return;
      if (remote != null && remote.length > 0) {
        setSearchResults(remote);
      } else {
        setSearchResults(searchProducts(query));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  const displayedProducts = useMemo(() => {
    if (isSearching && searchQuery.trim()) {
      return searchResults;
    }
    return getFeaturedProducts();
  }, [isSearching, searchQuery, searchResults]);

  const sendMediaToOrchestrator = async (mediaItems: MediaItemForSend[]) => {
    const client = wsClientRef.current;
    if (!client?.isConnected()) {
      Alert.alert('Not Connected', 'Connecting to assistant… Try again in a moment.');
      return;
    }
    client.sendUserMessage('', mediaItems);
    // Forward the user to the Talk tab so they see the response live
    router.push('/(tabs)/chat');
  };

  const handleProductPress = (product: Product) => {
    Alert.alert(
      product.name,
      `${product.description}\n\nPrice: $${product.price.toFixed(2)}\nRating: ${product.rating}/5 (${product.reviewCount} reviews)`,
      [
        { text: 'Close', style: 'cancel' },
        { text: 'Ask AI about this', onPress: () => router.push({ pathname: '/(tabs)/chat', params: { prefill: `Tell me more about ${product.name}` } }) },
      ],
    );
  };

  const handleVoice = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone needed', 'Grant microphone access to use voice search.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      await recording.startAsync();
      Alert.alert('Listening…', 'Speak your question, then tap Stop & Send.', [
        {
          text: 'Stop & Send',
          onPress: async () => {
            try {
              await recording.stopAndUnloadAsync();
              const uri = recording.getURI();
              recordingRef.current = null;
              if (!uri) return;
              setMediaUploading(true);
              try {
                const fileSize = await getFileSize(uri);
                const { s3_key } = await uploadMediaFile(uri, `audio_${Date.now()}.m4a`, 'audio/m4a', fileSize, 'audio');
                await sendMediaToOrchestrator([{ media_type: 'audio', s3_key, content_type: 'audio/m4a', size_bytes: fileSize }]);
              } catch (e) {
                Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload audio');
              } finally {
                setMediaUploading(false);
              }
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to stop recording');
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: async () => {
            try { await recording.stopAndUnloadAsync(); } catch {}
            recordingRef.current = null;
          },
        },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const handlePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Grant access to search with photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    setMediaUploading(true);
    try {
      const fileName = uri.split('/').pop() ?? `image_${Date.now()}.jpg`;
      const fileSize = asset.fileSize ?? (await getFileSize(uri));
      const { s3_key } = await uploadMediaFile(uri, fileName, 'image/jpeg', fileSize, 'image');
      await sendMediaToOrchestrator([{ media_type: 'image', s3_key, content_type: 'image/jpeg', size_bytes: fileSize }]);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload image');
    } finally {
      setMediaUploading(false);
    }
  };

  const handleVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    setMediaUploading(true);
    try {
      const fileName = uri.split('/').pop() ?? `video_${Date.now()}.mp4`;
      const fileSize = asset.fileSize ?? (await getFileSize(uri));
      const { s3_key } = await uploadMediaFile(uri, fileName, 'video/mp4', fileSize, 'video');
      await sendMediaToOrchestrator([{ media_type: 'video', s3_key, content_type: 'video/mp4', size_bytes: fileSize }]);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload video');
    } finally {
      setMediaUploading(false);
    }
  };

  const handleSign = () => {
    router.push('/(tabs)/asl');
  };

  const handleModeAction = (key: typeof QUICK_MODES[number]['key']) => {
    if (mediaUploading) return;
    if (key === 'voice') return handleVoice();
    if (key === 'photo') return handlePhoto();
    if (key === 'video') return handleVideo();
    if (key === 'sign') return handleSign();
  };

  const goToChat = () => {
    const q = searchQuery.trim();
    if (q) {
      router.push({ pathname: '/(tabs)/chat', params: { prefill: q } });
    } else {
      router.push('/(tabs)/chat');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WhisperBackground />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero header — display text + breathing orb (tighter on phone widths) */}
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Text style={[typography.label, { color: colors.textSecondary }]}>TALKNSHOP</Text>
            <Text
              style={[
                typography.h1,
                {
                  color: colors.text,
                  marginTop: 6,
                  fontSize: 34,
                  lineHeight: 38,
                  letterSpacing: -0.7,
                },
              ]}
              numberOfLines={2}
            >
              Find anything.{"\n"}
              <Text style={{ color: colors.primary }}>Any way.</Text>
            </Text>
          </View>
          <PressableScale onPress={goToChat} haptic="light">
            <AuroraOrb size={56} state="idle" />
          </PressableScale>
        </View>

        {/* Search input */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surfaceSunk ?? colors.surface,
              borderColor: colors.borderStrong ?? colors.border,
            },
          ]}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontFamily: 'Geist_500Medium' }]}
            placeholder="What are you shopping for?"
            placeholderTextColor={colors.textTertiary ?? colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={goToChat}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <PressableScale onPress={() => setSearchQuery('')} hitSlop={10} haptic="light">
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </PressableScale>
          ) : null}
        </View>

        {/* Modality row — equally-weighted "Ask. Show. Sign." affordances */}
        <View style={styles.modeRow}>
          {QUICK_MODES.map((m) => (
            <PressableScale
              key={m.key}
              onPress={() => handleModeAction(m.key)}
              haptic="selection"
              style={styles.modeBtnWrap}
            >
              <View
                style={[
                  styles.modeBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <IconBadge icon={m.icon} size="sm" variant="subtle" />
                <Text style={[typography.bodyMd, { color: colors.text }]}>{m.label}</Text>
              </View>
            </PressableScale>
          ))}
        </View>

        {mediaUploading ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Sending to assistant…</Text>
          </View>
        ) : null}

        {/* Trending searches */}
        {!isSearching ? (
          <View style={styles.section}>
            <SectionHeader title="Trending" eyebrow="WHAT EVERYONE'S ASKING" />
            <View style={styles.chipWrap}>
              {TRENDING_SEARCHES.map((q) => (
                <Chip
                  key={q}
                  label={q}
                  icon="trending-up"
                  onPress={() => router.push({ pathname: '/(tabs)/chat', params: { prefill: q } })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Products */}
        <View style={styles.section}>
          <SectionHeader
            title={isSearching ? `Results for "${searchQuery.trim()}"` : 'Featured'}
            eyebrow={isSearching ? `${displayedProducts.length} MATCHES` : 'HAND-PICKED FOR YOU'}
            actionLabel={isSearching ? 'Clear' : undefined}
            onActionPress={isSearching ? () => setSearchQuery('') : undefined}
          />
          {displayedProducts.length > 0 ? (
            <View style={styles.grid}>
              {displayedProducts.map((p, idx) => (
                <View key={p.id} style={[styles.gridCell, idx % 2 === 0 ? { paddingRight: 6 } : { paddingLeft: 6 }]}>
                  <ProductTile product={p} onPress={handleProductPress} />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyHint}>
              <Ionicons name="leaf-outline" size={20} color={colors.textTertiary ?? colors.textSecondary} />
              <Text style={[typography.body, { color: colors.textSecondary, flex: 1 }]}>
                Nothing matched. Try the AI — it understands "comfy running shoes for flat feet under $100."
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  heroText: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeBtnWrap: {
    flex: 1,
  },
  modeBtn: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  section: {
    gap: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    width: '50%',
    paddingBottom: 12,
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
});
