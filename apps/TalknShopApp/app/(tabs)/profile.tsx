import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/components/AuthProvider';
import { sellerService } from '@/services/sellerService';
import { SellerProduct } from '@/data/sellerProducts';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { colors, typography } = useTheme();
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const [listings, setListings] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadListings();
  }, []);

  const loadListings = async () => {
    try {
      setLoading(true);
      const myListings = await sellerService.getMyListings();
      setListings(myListings);
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text, ...typography.h1 }]}>
          Profile
        </Text>
        
        <View style={[styles.userInfo, { backgroundColor: colors.surface }]}>
          <Text style={[styles.userName, { color: colors.text, ...typography.h3 }]}>
            {user?.name || 'Guest User'}
          </Text>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
            {user?.email || 'guest@example.com'}
          </Text>
        </View>

        {/* My Listings Section */}
        <View style={styles.listingsSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, ...typography.h3 }]}>
              My Listings
            </Text>
            <TouchableOpacity onPress={loadListings}>
              <Ionicons name="refresh" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Loading listings...
              </Text>
            </View>
          ) : listings.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: colors.surface }]}>
              <Ionicons name="cube-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No listings yet
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Start selling by creating your first listing
              </Text>
            </View>
          ) : (
            <View style={styles.listingsList}>
              {listings.map((listing) => (
                <TouchableOpacity
                  key={listing.id}
                  style={[styles.listingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  {listing.image && (
                    <Image
                      source={{ uri: typeof listing.image === 'string' ? listing.image : listing.image }}
                      style={styles.listingImage}
                      resizeMode="cover"
                    />
                  )}
                  <View style={styles.listingInfo}>
                    <Text style={[styles.listingName, { color: colors.text }]} numberOfLines={2}>
                      {listing.name}
                    </Text>
                    <Text style={[styles.listingPrice, { color: colors.primary }]}>
                      ${listing.price.toFixed(2)}
                    </Text>
                    <View style={styles.listingMeta}>
                      <Text style={[styles.listingMetaText, { color: colors.textSecondary }]}>
                        {listing.category}
                      </Text>
                      <Text style={[styles.listingMetaText, { color: colors.textSecondary }]}>
                        • {listing.condition}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.menu}>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>Notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>Help & Support</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>About</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.logoutButton, 
            { 
              backgroundColor: colors.error,
              opacity: isLoading ? 0.6 : 1,
            }
          ]}
          onPress={handleLogout}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.logoutText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
  },
  userInfo: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  userName: {
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
  },
  listingsSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  listingsList: {
    gap: 12,
  },
  listingCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  listingImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  listingInfo: {
    flex: 1,
    gap: 4,
  },
  listingName: {
    fontSize: 16,
    fontWeight: '600',
  },
  listingPrice: {
    fontSize: 18,
    fontWeight: '700',
  },
  listingMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  listingMetaText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  menu: {
    marginTop: 8,
  },
  menuItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  menuText: {
    fontSize: 16,
  },
  logoutButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
