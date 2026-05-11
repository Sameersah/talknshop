import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/components/AuthProvider';
import { sellerService } from '@/services/sellerService';
import {
  SellerProduct,
  loadSellerProducts,
  getSellerProducts,
  clearSellerProducts,
} from '@/data/sellerProducts';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar,
  IconBadge,
  PressableScale,
  SectionHeader,
  StatCard,
  WhisperBackground,
} from '@/components/ui';

export default function ProfileScreen() {
  const { colors, typography } = useTheme();
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadListings();
  }, []);

  const loadListings = async () => {
    try {
      setLoading(true);
      await loadSellerProducts();
      const local = getSellerProducts('current-user');
      if (local.length > 0) setListings(local);
      try {
        const remote = await sellerService.getMyListings();
        if (remote.length > 0) setListings(remote);
      } catch {
        // backend unavailable — local listings already shown
      }
    } catch (error) {
      console.error('Error loading listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error: any) {
      console.error('Logout error:', error);
      router.replace('/(auth)/login');
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear all listings?',
      `Permanently deletes ${listings.length} local listing${listings.length === 1 ? '' : 's'}. eBay Sandbox copies stay on eBay's side. Cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearSellerProducts();
              setListings([]);
            } catch {
              Alert.alert('Error', 'Failed to clear listings.');
            }
          },
        },
      ],
    );
  };

  const liveListings = listings.filter((l) => l.ebayListingUrl).length;
  const localListings = listings.length - liveListings;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WhisperBackground />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — avatar + name + email */}
        <View style={styles.heroRow}>
          <Avatar name={user?.name || user?.email || 'Guest'} size={72} />
          <View style={styles.heroText}>
            <Text style={[typography.label, { color: colors.textSecondary }]}>MEMBER</Text>
            <Text style={[typography.h1, { color: colors.text, marginTop: 2 }]} numberOfLines={1}>
              {user?.name || 'Welcome'}
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary }]} numberOfLines={1}>
              {user?.email || 'guest@example.com'}
            </Text>
          </View>
        </View>

        {/* Stat row */}
        <View style={styles.statRow}>
          <StatCard
            value={listings.length}
            label="LISTINGS"
            icon="cube-outline"
            variant={listings.length > 0 ? 'accent' : 'empty'}
          />
          <StatCard value={liveListings} label="LIVE ON EBAY" icon="globe-outline" />
          <StatCard value={localListings} label="DRAFTS" icon="bookmark-outline" />
        </View>

        {/* Listings */}
        <View style={styles.section}>
          <SectionHeader
            title="Your listings"
            eyebrow="WHAT YOU'VE LISTED"
            actionLabel={listings.length > 0 ? 'Clear all' : undefined}
            onActionPress={listings.length > 0 ? handleClearAll : undefined}
          />

          {loading ? (
            <View style={styles.centerRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading…</Text>
            </View>
          ) : listings.length === 0 ? (
            <PressableScale onPress={() => router.push('/(tabs)/sell')} haptic="selection">
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.borderStrong ?? colors.border,
                  },
                ]}
              >
                <IconBadge icon="add-circle-outline" size="lg" variant="subtle" />
                <View style={styles.emptyCardText}>
                  <Text style={[typography.bodyMd, { color: colors.text }]}>
                    Snap a photo, list to eBay
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    Tap to start your first listing.
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
              </View>
            </PressableScale>
          ) : (
            <View style={styles.listingsList}>
              {listings.map((listing) => (
                <PressableScale
                  key={listing.id}
                  haptic="selection"
                  onPress={() => {
                    if (listing.ebayListingUrl) {
                      Linking.openURL(listing.ebayListingUrl).catch(() =>
                        Alert.alert('Error', 'Could not open the eBay listing.'),
                      );
                    } else {
                      Alert.alert(
                        listing.name,
                        `$${listing.price.toFixed(2)} · ${listing.category} · ${listing.condition}\n\nSaved locally — no eBay link yet.`,
                        [{ text: 'OK' }],
                      );
                    }
                  }}
                >
                  <View
                    style={[
                      styles.listingCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    {listing.image ? (
                      <Image
                        source={{ uri: typeof listing.image === 'string' ? listing.image : listing.image }}
                        style={styles.listingImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.listingImage,
                          {
                            backgroundColor: colors.surfaceSunk ?? colors.background,
                            alignItems: 'center',
                            justifyContent: 'center',
                          },
                        ]}
                      >
                        <Ionicons name="image-outline" size={22} color={colors.textTertiary ?? colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.listingInfo}>
                      <Text style={[typography.bodyMd, { color: colors.text }]} numberOfLines={2}>
                        {listing.name}
                      </Text>
                      <View style={styles.listingMetaRow}>
                        <Text style={[typography.caption, { color: colors.textTertiary ?? colors.textSecondary }]}>
                          {listing.category}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textTertiary ?? colors.textSecondary }]}>
                          · {listing.condition}
                        </Text>
                      </View>
                      <View style={styles.listingFooter}>
                        <Text style={[typography.priceLg, { color: colors.text }]}>${listing.price.toFixed(2)}</Text>
                        {listing.ebayListingUrl ? (
                          <View style={[styles.liveTag, { backgroundColor: colors.primaryMuted ?? colors.surface }]}>
                            <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                            <Text style={[typography.label, { color: colors.primary }]}>LIVE</Text>
                          </View>
                        ) : (
                          <Text style={[typography.label, { color: colors.textTertiary ?? colors.textSecondary }]}>
                            LOCAL
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons
                      name={listing.ebayListingUrl ? 'arrow-up-circle' : 'chevron-forward'}
                      size={20}
                      color={listing.ebayListingUrl ? colors.primary : colors.textTertiary ?? colors.textSecondary}
                    />
                  </View>
                </PressableScale>
              ))}
            </View>
          )}
        </View>

        {/* Settings menu */}
        <View style={styles.section}>
          <SectionHeader title="Account" eyebrow="PREFERENCES" />
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[
              { label: 'Settings', icon: 'options-outline' as const },
              { label: 'Notifications', icon: 'notifications-outline' as const },
              { label: 'Help & Support', icon: 'help-circle-outline' as const },
              { label: 'About', icon: 'information-circle-outline' as const },
            ].map((item, idx, arr) => (
              <PressableScale key={item.label} haptic="selection" onPress={() => {}}>
                <View
                  style={[
                    styles.menuItem,
                    idx < arr.length - 1
                      ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }
                      : null,
                  ]}
                >
                  <IconBadge icon={item.icon} size="sm" variant="subtle" />
                  <Text style={[typography.bodyMd, { color: colors.text, flex: 1 }]}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary ?? colors.textSecondary} />
                </View>
              </PressableScale>
            ))}
          </View>
        </View>

        {/* Sign out */}
        <PressableScale onPress={handleLogout} disabled={isLoading} haptic="medium">
          <View
            style={[
              styles.signOutBtn,
              { borderColor: colors.borderStrong ?? colors.border, opacity: isLoading ? 0.6 : 1 },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.error} />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color={colors.error} />
                <Text style={[typography.bodyMd, { color: colors.error }]}>Sign out</Text>
              </>
            )}
          </View>
        </PressableScale>
      </ScrollView>
    </View>
  );
}

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
    gap: 16,
  },
  heroText: { flex: 1, minWidth: 0 },

  statRow: {
    flexDirection: 'row',
    gap: 10,
  },

  section: { gap: 12 },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  emptyCardText: { flex: 1, gap: 2 },

  listingsList: { gap: 10 },
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listingImage: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
  },
  listingInfo: { flex: 1, gap: 4 },
  listingMetaRow: { flexDirection: 'row', gap: 4 },
  listingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },

  menuCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
