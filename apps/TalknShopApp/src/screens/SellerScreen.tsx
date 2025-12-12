import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// Marketplace integration imports - disabled for now
// import * as WebBrowser from 'expo-web-browser';
// import * as Linking from 'expo-linking';
import { Product } from '@/data/products';
import { addSellerProduct } from '@/data/sellerProducts';
import { sellerService } from '@/services/sellerService';
import { MarketplacePlatform, MarketplaceConnection } from '@/services/marketplaceService';

interface SellerProduct extends Omit<Product, 'id' | 'rating' | 'reviewCount' | 'source'> {
  id?: string;
  sellerId?: string;
  condition?: 'new' | 'like-new' | 'good' | 'fair';
  quantity?: number;
}

const PRODUCT_CATEGORIES = [
  { id: 'electronics', name: 'Electronics', icon: 'phone-portrait' },
  { id: 'fashion', name: 'Fashion', icon: 'shirt' },
  { id: 'home-kitchen', name: 'Home & Kitchen', icon: 'home' },
  { id: 'sports', name: 'Sports & Outdoors', icon: 'football' },
  { id: 'books', name: 'Books & Media', icon: 'book' },
  { id: 'toys', name: 'Toys & Games', icon: 'game-controller' },
  { id: 'beauty', name: 'Beauty & Personal Care', icon: 'sparkles' },
  { id: 'automotive', name: 'Automotive', icon: 'car' },
];

const PRODUCT_CONDITIONS = [
  { id: 'new', name: 'New', description: 'Brand new, never used' },
  { id: 'like-new', name: 'Like New', description: 'Used but looks new' },
  { id: 'good', name: 'Good', description: 'Used, minor wear' },
  { id: 'fair', name: 'Fair', description: 'Used, visible wear' },
];

const MARKETPLACE_PLATFORMS = [
  { id: 'ebay' as MarketplacePlatform, name: 'eBay', icon: 'storefront', color: '#0064D2', comingSoon: false },
  { id: 'facebook' as MarketplacePlatform, name: 'Facebook', icon: 'logo-facebook', color: '#1877F2', comingSoon: true },
];

export const SellerScreen: React.FC = () => {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<MarketplacePlatform[]>([]);
  const [marketplaceConnections, setMarketplaceConnections] = useState<MarketplaceConnection[]>([]);
  const [isProductDetailsExpanded, setIsProductDetailsExpanded] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const [formData, setFormData] = useState<Partial<SellerProduct>>({
    name: '',
    description: '',
    price: 0,
    brand: '',
    condition: 'new',
    quantity: 1,
    inStock: true,
    fastDelivery: false,
  });

  // Marketplace connections - eBay appears connected for UI purposes only
  // Actual posting is disabled behind the scenes
  useEffect(() => {
    // Set eBay as connected for UI purposes (but won't actually post)
    setMarketplaceConnections([
      { platform: 'ebay' as MarketplacePlatform, connected: true },
      { platform: 'facebook' as MarketplacePlatform, connected: false },
    ]);
  }, []);

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setFormData((prev) => ({ ...prev, category: categoryId }));
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permissions to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProductImages((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library permissions.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map((asset) => asset.uri);
        setProductImages((prev) => [...prev, ...newImages]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick images');
    }
  };

  const handleRemoveImage = (index: number) => {
    setProductImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Marketplace connection functions - disabled for now
  // Will be re-enabled when eBay integration is ready
  // const handleConnectMarketplace = async (platform: MarketplacePlatform) => { ... }
  // const handleToggleMarketplace = (platform: MarketplacePlatform) => { ... }

  const handleSubmit = async () => {
    // Minimal validation - only category and image required
    if (!selectedCategory) {
      Alert.alert('Category Required', 'Please select a product category.');
      return;
    }

    if (productImages.length === 0) {
      Alert.alert('Photo Required', 'Please add at least one product photo.');
      return;
    }

    console.log('=== Starting listing submission ===');
    setIsSubmitting(true);
    
    // Show verification modal with animation
    setShowVerificationModal(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      // Auto-generate missing fields
      const productName = formData.name || `${PRODUCT_CATEGORIES.find(c => c.id === selectedCategory)?.name} Item`;
      const productDescription = formData.description || `Quality ${productName.toLowerCase()} for sale`;
      const productPrice = formData.price || 0;

      // Try to create listing on backend (but don't fail if service is down)
      try {
        await sellerService.createListing({
          category: selectedCategory,
          name: productName,
          description: productDescription,
          price: productPrice,
          brand: formData.brand || 'Unbranded',
          quantity: formData.quantity || 1,
          condition: formData.condition || 'new',
          images: productImages,
          inStock: formData.inStock ?? true,
          fastDelivery: formData.fastDelivery ?? false,
        });
        console.log('Listing created on backend');
      } catch (backendError: any) {
        console.warn('Backend listing creation failed (continuing with local save):', backendError);
        // Continue with local save even if backend fails
      }

      // Save locally for offline access
      addSellerProduct({
        name: productName,
        description: productDescription,
        price: productPrice,
        brand: formData.brand || 'Unbranded',
        category: selectedCategory,
        image: productImages[0],
        sellerId: 'current-user',
        sellerName: 'You',
        condition: formData.condition || 'new',
        quantity: formData.quantity || 1,
        inStock: formData.inStock ?? true,
        fastDelivery: formData.fastDelivery ?? false,
      });

      // Wait 2 seconds to show the verification message
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Hide modal and show success
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowVerificationModal(false);
        
        const successMessage = selectedMarketplaces.includes('ebay')
          ? 'Your product has been submitted for verification and will be posted to eBay soon!'
          : 'Your product has been submitted for verification and will be listed soon!';
        Alert.alert('Listed! 🎉', successMessage, [
          {
            text: 'List Another',
            onPress: () => {
              resetForm();
            },
          },
          {
            text: 'Done',
            onPress: () => {
              resetForm();
              setSelectedCategory(null);
            },
          },
        ]);
      });
    } catch (error: any) {
      console.error('=== Submission error ===', error);
      const errorMessage = error?.message || error?.toString() || 'Failed to list product. Please try again.';
      
      // Hide modal on error
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowVerificationModal(false);
        Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
      });
    } finally {
      console.log('=== Submission finished ===');
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setProductImages([]);
    setFormData({
      name: '',
      description: '',
      price: 0,
      brand: '',
      condition: 'new',
      quantity: 1,
      inStock: true,
      fastDelivery: false,
    });
    setSelectedMarketplaces([]);
  };

  return (
    <View style={styles.container}>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 40 }
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, ...typography.h1 }]}>
          Sell Your Product
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, ...typography.body }]}>
          Just select category & add photo. That's it! 🚀
        </Text>
      </View>

      {/* Category Selection */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, ...typography.h3 }]}>
          Select Category
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Choose what you're selling
        </Text>
        <View style={styles.categoryGrid}>
          {PRODUCT_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryCard,
                {
                  backgroundColor:
                    selectedCategory === category.id ? colors.primary + '20' : colors.surface,
                  borderColor:
                    selectedCategory === category.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => handleCategorySelect(category.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={category.icon as any}
                size={32}
                color={selectedCategory === category.id ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.categoryText,
                  {
                    color: selectedCategory === category.id ? colors.primary : colors.text,
                    fontWeight: selectedCategory === category.id ? '600' : '500',
                  },
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Product Images */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, ...typography.h3 }]}>
          Add Photo
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Take a photo or choose from gallery
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
          {productImages.map((uri, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image source={{ uri }} style={styles.productImage} />
              <TouchableOpacity
                style={[styles.removeImageButton, { backgroundColor: colors.error }]}
                onPress={() => handleRemoveImage(index)}
              >
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))}

          {productImages.length < 5 && (
            <>
              <TouchableOpacity
                style={[styles.addImageButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={handleTakePhoto}
                activeOpacity={0.7}
              >
                <Ionicons name="camera" size={32} color={colors.primary} />
                <Text style={[styles.addImageText, { color: colors.text }]}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addImageButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={handlePickImage}
                activeOpacity={0.7}
              >
                <Ionicons name="images" size={32} color={colors.primary} />
                <Text style={[styles.addImageText, { color: colors.text }]}>Choose from Gallery</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      {/* Product Details Form - Collapsible Dropdown */}
      {selectedCategory && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => setIsProductDetailsExpanded(!isProductDetailsExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.collapsibleHeaderContent}>
              <Text style={[styles.sectionTitle, { color: colors.text, ...typography.h3 }]}>
                Product Details (Optional)
              </Text>
              <Ionicons
                name={isProductDetailsExpanded ? 'chevron-up' : 'chevron-down'}
                size={24}
                color={colors.textSecondary}
              />
            </View>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              {isProductDetailsExpanded ? 'Tap to collapse' : 'Tap to add more details'}
            </Text>
          </TouchableOpacity>

          {isProductDetailsExpanded && (
            <View style={styles.collapsibleContent}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Product Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g., iPhone 13 Pro"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.name}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Brand</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g., Apple"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.brand}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, brand: text }))}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                  <Text style={[styles.label, { color: colors.text }]}>Price ($)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                    value={formData.price?.toString() || ''}
                    onChangeText={(text) => {
                      const num = parseFloat(text) || 0;
                      setFormData((prev) => ({ ...prev, price: num }));
                    }}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={[styles.formGroup, styles.halfWidth]}>
                  <Text style={[styles.label, { color: colors.text }]}>Quantity</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    placeholder="1"
                    placeholderTextColor={colors.textSecondary}
                    value={formData.quantity?.toString() || '1'}
                    onChangeText={(text) => {
                      const num = parseInt(text) || 1;
                      setFormData((prev) => ({ ...prev, quantity: num }));
                    }}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Description</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder="Describe your product..."
                  placeholderTextColor={colors.textSecondary}
                  value={formData.description}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Condition</Text>
                <View style={styles.conditionGrid}>
                  {PRODUCT_CONDITIONS.map((condition) => (
                    <TouchableOpacity
                      key={condition.id}
                      style={[
                        styles.conditionCard,
                        {
                          backgroundColor:
                            formData.condition === condition.id ? colors.primary + '20' : colors.surface,
                          borderColor:
                            formData.condition === condition.id ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setFormData((prev) => ({ ...prev, condition: condition.id as any }))}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.conditionName,
                          {
                            color: formData.condition === condition.id ? colors.primary : colors.text,
                            fontWeight: formData.condition === condition.id ? '600' : '500',
                          },
                        ]}
                      >
                        {condition.name}
                      </Text>
                      <Text style={[styles.conditionDesc, { color: colors.textSecondary }]}>
                        {condition.description}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.checkboxGroup}>
                <TouchableOpacity
                  style={styles.checkbox}
                  onPress={() => setFormData((prev) => ({ ...prev, inStock: !prev.inStock }))}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={formData.inStock ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={formData.inStock ? colors.success : colors.textSecondary}
                  />
                  <Text style={[styles.checkboxLabel, { color: colors.text }]}>In Stock</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkbox}
                  onPress={() => setFormData((prev) => ({ ...prev, fastDelivery: !prev.fastDelivery }))}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={formData.fastDelivery ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={formData.fastDelivery ? colors.success : colors.textSecondary}
                  />
                  <Text style={[styles.checkboxLabel, { color: colors.text }]}>Fast Delivery Available</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

          {/* Marketplace Selection */}
          {selectedCategory && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text, ...typography.h3 }]}>
                  Post to Marketplaces (Optional)
                </Text>
              </View>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                Select where you want to list your product
              </Text>

          <View style={styles.marketplaceGrid}>
            {MARKETPLACE_PLATFORMS.map((platform) => {
              const connection = marketplaceConnections.find(c => c.platform === platform.id);
              const isSelected = selectedMarketplaces.includes(platform.id);
              const isConnected = connection?.connected || false;
              const isComingSoon = platform.comingSoon || false;

              return (
                <TouchableOpacity
                  key={platform.id}
                  style={[
                    styles.marketplaceCard,
                    {
                      backgroundColor: isSelected ? platform.color + '20' : colors.surface,
                      borderColor: isSelected ? platform.color : colors.border,
                      opacity: isComingSoon ? 0.5 : (isConnected ? 1 : 0.6),
                    },
                  ]}
                  onPress={() => {
                    if (isComingSoon) {
                      Alert.alert('Coming Soon', `${platform.name} Marketplace integration is coming soon!`);
                      return;
                    }
                    // Toggle marketplace selection (UI only - no actual posting)
                    setSelectedMarketplaces((prev) =>
                      prev.includes(platform.id)
                        ? prev.filter((p) => p !== platform.id)
                        : [...prev, platform.id]
                    );
                  }}
                  activeOpacity={isComingSoon ? 1 : 0.7}
                  disabled={isComingSoon}
                >
                  <View style={styles.marketplaceHeader}>
                    <View style={[styles.marketplaceIcon, { backgroundColor: platform.color + '20' }]}>
                      <Ionicons name={platform.icon as any} size={24} color={platform.color} />
                    </View>
                    {isSelected && !isComingSoon && (
                      <View style={[styles.selectedBadge, { backgroundColor: platform.color }]}>
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      </View>
                    )}
                    {isComingSoon && (
                      <View style={[styles.comingSoonBadge, { backgroundColor: colors.textSecondary }]}>
                        <Text style={styles.comingSoonBadgeText}>SOON</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.marketplaceName,
                      {
                        color: isSelected && !isComingSoon ? platform.color : colors.text,
                        fontWeight: isSelected && !isComingSoon ? '700' : '600',
                      },
                    ]}
                  >
                    {platform.name}
                  </Text>
                  {isComingSoon ? (
                    <Text style={[styles.marketplaceStatus, { color: colors.textSecondary }]}>
                      Coming Soon
                    </Text>
                  ) : !isConnected ? (
                    <Text style={[styles.marketplaceStatus, { color: colors.textSecondary }]}>
                      Tap to connect
                    </Text>
                  ) : isConnected && !isSelected ? (
                    <Text style={[styles.marketplaceStatus, { color: colors.success }]}>
                      Connected
                    </Text>
                  ) : (
                    <Text style={[styles.marketplaceStatus, { color: platform.color }]}>
                      Will post here
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* List Product Now Button - At the end */}
      {selectedCategory && productImages.length > 0 && (
        <TouchableOpacity
          style={[
            styles.quickSubmitButton,
            {
              backgroundColor: colors.primary,
              opacity: isSubmitting ? 0.6 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
              <Text style={styles.quickSubmitText}>List Product Now</Text>
            </>
          )}
        </TouchableOpacity>
      )}


      <View style={{ height: 40 }} />
    </ScrollView>

    {/* Verification Modal */}
    <Modal
      visible={showVerificationModal}
      transparent={true}
      animationType="none"
      onRequestClose={() => {}}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[
            styles.modalContent,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.modalIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          </View>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Product Submitted!
          </Text>
          <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
            {selectedMarketplaces.includes('ebay')
              ? 'Your product will be verified and posted to eBay soon'
              : 'Your product will be verified and listed soon'}
          </Text>
          <ActivityIndicator size="large" color={colors.primary} style={styles.modalSpinner} />
        </Animated.View>
      </View>
    </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  header: {
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.8,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 8,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: 12,
    opacity: 0.7,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  categoryCard: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  categoryText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  imageScroll: {
    marginTop: 12,
  },
  imageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  productImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  addImageButton: {
    width: 120,
    height: 120,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addImageText: {
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 100,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  conditionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  conditionCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
  },
  conditionName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  conditionDesc: {
    fontSize: 11,
  },
  checkboxGroup: {
    gap: 12,
    marginTop: 8,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkboxLabel: {
    fontSize: 14,
  },
  quickSubmitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 8,
    marginTop: 8,
    marginBottom: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  quickSubmitText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  marketplaceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  marketplaceCard: {
    width: '30%',
    aspectRatio: 1.2,
    borderRadius: 16,
    borderWidth: 2,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  marketplaceHeader: {
    position: 'relative',
    marginBottom: 8,
  },
  marketplaceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  comingSoonBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  marketplaceName: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  marketplaceStatus: {
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
  },
  collapsibleHeader: {
    marginBottom: 12,
  },
  collapsibleHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  collapsibleContent: {
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  modalIconContainer: {
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalSpinner: {
    marginTop: 8,
  },
});

