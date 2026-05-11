import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Linking,
  Modal,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { Product } from '@/data/products';
import { addSellerProduct } from '@/data/sellerProducts';
import { ebayListingService, EbayListingResult } from '@/services/ebayListingService';
import {
  AuroraOrb,
  Chip,
  GradientBorder,
  GradientButton,
  IconBadge,
  PressableScale,
  SectionHeader,
  WhisperBackground,
} from '@/components/ui';
import { AURORA_COLORS, AURORA_LOCATIONS } from '@/constants/theme';

interface SellerFormData extends Omit<Product, 'id' | 'rating' | 'reviewCount' | 'source'> {
  id?: string;
  sellerId?: string;
  condition?: 'new' | 'like-new' | 'good' | 'fair';
  quantity?: number;
}

const PRODUCT_CATEGORIES = [
  { id: 'electronics', name: 'Electronics', icon: 'phone-portrait-outline' },
  { id: 'fashion', name: 'Fashion', icon: 'shirt-outline' },
  { id: 'home-kitchen', name: 'Home', icon: 'home-outline' },
  { id: 'sports', name: 'Sports', icon: 'football-outline' },
  { id: 'books', name: 'Books', icon: 'book-outline' },
  { id: 'toys', name: 'Toys', icon: 'game-controller-outline' },
  { id: 'beauty', name: 'Beauty', icon: 'sparkles-outline' },
  { id: 'automotive', name: 'Auto', icon: 'car-outline' },
] as const;

const CONDITIONS = [
  { id: 'new', name: 'New', hint: 'Sealed' },
  { id: 'like-new', name: 'Like new', hint: 'Barely used' },
  { id: 'good', name: 'Good', hint: 'Minor wear' },
  { id: 'fair', name: 'Fair', hint: 'Visible wear' },
] as const;

export const SellerScreen: React.FC = () => {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postToEbay, setPostToEbay] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalState, setModalState] = useState<'working' | 'success' | 'fail'>('working');
  const [lastListingUrl, setLastListingUrl] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<SellerFormData>>({
    name: '',
    description: '',
    price: 0,
    brand: '',
    condition: 'new',
    quantity: 1,
    inStock: true,
    fastDelivery: false,
  });

  const fade = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (showModal) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]).start();
    } else {
      fade.setValue(0);
      scaleAnim.setValue(0.92);
    }
  }, [showModal, fade, scaleAnim]);

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera needed', 'Allow camera access to take a photo.');
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
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow access to your photos.');
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
      setProductImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const handleRemoveImage = (idx: number) => {
    setProductImages((prev) => prev.filter((_, i) => i !== idx));
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
  };

  const handleSubmit = async () => {
    if (!selectedCategory) {
      Alert.alert('Pick a category', 'Choose what you’re selling first.');
      return;
    }
    if (productImages.length === 0) {
      Alert.alert('Add a photo', 'At least one photo is required.');
      return;
    }

    setIsSubmitting(true);
    setModalState('working');
    setLastListingUrl(null);
    setLastError(null);
    setShowModal(true);

    const productName =
      formData.name || `${PRODUCT_CATEGORIES.find((c) => c.id === selectedCategory)?.name ?? 'Item'} for sale`;
    const productDescription =
      formData.description || `Quality ${productName.toLowerCase()} from a verified seller.`;
    const productPrice = formData.price && formData.price > 0 ? formData.price : 9.99;
    const productBrand = formData.brand || 'Unbranded';
    const productCondition = formData.condition || 'good';

    let ebayResult: EbayListingResult | null = null;

    if (postToEbay) {
      try {
        ebayResult = await ebayListingService.createListing({
          title: productName,
          description: productDescription,
          price: productPrice,
          condition: productCondition as any,
          category: PRODUCT_CATEGORIES.find((c) => c.id === selectedCategory)?.name ?? selectedCategory,
          brand: productBrand,
          quantity: formData.quantity || 1,
          localImageUri: productImages[0],
        });
      } catch (e: any) {
        ebayResult = { success: false, error: e?.message || 'Unknown error' };
      }
    }

    try {
      await addSellerProduct({
        name: productName,
        description: productDescription,
        price: productPrice,
        brand: productBrand,
        category: selectedCategory,
        image: productImages[0],
        sellerId: 'current-user',
        sellerName: 'You',
        condition: productCondition as any,
        quantity: formData.quantity || 1,
        inStock: formData.inStock ?? true,
        fastDelivery: formData.fastDelivery ?? false,
        ebayListingId: ebayResult?.listingId,
        ebayListingUrl: ebayResult?.listingUrl,
      });
    } catch (e: any) {
      // Local save failed — surface but treat as soft error if eBay succeeded
      console.warn('Local save failed', e);
    }

    if (postToEbay && ebayResult?.success && ebayResult.listingUrl) {
      setLastListingUrl(ebayResult.listingUrl);
      setModalState('success');
    } else if (postToEbay && ebayResult && !ebayResult.success) {
      setLastError(ebayResult.error || 'Unknown error');
      setModalState('fail');
    } else {
      // Not posting to eBay — just local save succeeded
      setModalState('success');
    }

    setIsSubmitting(false);
  };

  const closeModalAndReset = () => {
    setShowModal(false);
    setTimeout(() => {
      resetForm();
      setSelectedCategory(null);
    }, 220);
  };

  const formValid = selectedCategory != null && productImages.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WhisperBackground color="#FF7A59" height={360} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 200 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={[typography.label, { color: colors.accent ?? colors.primary }]}>SELL IN 10 SECONDS</Text>
            <Text style={[typography.display, { color: colors.text, marginTop: 6 }]} numberOfLines={2}>
              Snap it.{"\n"}
              <Text style={{ color: colors.accent ?? colors.primary }}>List it.</Text>
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
              One photo, one tap — your item is live on eBay.
            </Text>
          </View>

          {/* Photo capture — the hero */}
          <View style={styles.photoSection}>
            {productImages.length === 0 ? (
              <>
                <PressableScale onPress={handleTakePhoto} haptic="medium">
                  <GradientBorder
                    radius={28}
                    thickness={1.5}
                    innerBackground={colors.surface}
                    innerStyle={{ minHeight: 220 }}
                  >
                    <View style={styles.photoEmpty}>
                      <IconBadge icon="camera" size="lg" variant="gradient" />
                      <Text style={[typography.h2, { color: colors.text, marginTop: 14 }]}>
                        Take a photo
                      </Text>
                      <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, textAlign: 'center' }]}>
                        We'll auto-list it on eBay in one tap.
                      </Text>
                    </View>
                  </GradientBorder>
                </PressableScale>
                <PressableScale onPress={handlePickPhoto} haptic="selection">
                  <View style={styles.photoLibBtn}>
                    <Ionicons name="images-outline" size={16} color={colors.primary} />
                    <Text style={[typography.bodyMd, { color: colors.primary }]}>
                      Or pick from your library
                    </Text>
                  </View>
                </PressableScale>
              </>
            ) : (
              <View style={styles.photoStrip}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStripContent}>
                  {productImages.map((uri, idx) => (
                    <View key={`${uri}_${idx}`} style={styles.photoThumbWrap}>
                      <Image source={{ uri }} style={styles.photoThumb} />
                      <PressableScale
                        onPress={() => handleRemoveImage(idx)}
                        haptic="light"
                        style={styles.removeBtnWrap}
                      >
                        <View style={[styles.removeBtn, { backgroundColor: colors.error }]}>
                          <Ionicons name="close" size={14} color="#fff" />
                        </View>
                      </PressableScale>
                    </View>
                  ))}
                  {productImages.length < 5 ? (
                    <PressableScale onPress={handleTakePhoto} haptic="selection">
                      <View
                        style={[
                          styles.addMorePhoto,
                          { backgroundColor: colors.surface, borderColor: colors.borderStrong ?? colors.border },
                        ]}
                      >
                        <Ionicons name="add" size={28} color={colors.primary} />
                      </View>
                    </PressableScale>
                  ) : null}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Category picker */}
          <View style={styles.section}>
            <SectionHeader title="What is it?" eyebrow="CATEGORY" />
            <View style={styles.chipWrap}>
              {PRODUCT_CATEGORIES.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  icon={c.icon as React.ComponentProps<typeof Ionicons>['name']}
                  active={selectedCategory === c.id}
                  onPress={() => setSelectedCategory(c.id)}
                />
              ))}
            </View>
          </View>

          {/* Price + condition row */}
          <View style={styles.section}>
            <SectionHeader title="Details" eyebrow="QUICK INFO" />
            <View style={styles.row}>
              <View style={[styles.inlineField, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}>
                <Text style={[typography.label, { color: colors.textSecondary }]}>PRICE (USD)</Text>
                <View style={styles.priceInputRow}>
                  <Text style={[typography.priceLg, { color: colors.text }]}>$</Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary ?? colors.textSecondary}
                    keyboardType="decimal-pad"
                    value={formData.price ? String(formData.price) : ''}
                    onChangeText={(t) => {
                      const n = parseFloat(t);
                      setFormData((p) => ({ ...p, price: isNaN(n) ? 0 : n }));
                    }}
                    style={[
                      styles.priceInput,
                      { color: colors.text, fontFamily: 'GeistMono_600SemiBold' },
                    ]}
                  />
                </View>
              </View>
              <View style={[styles.inlineField, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}>
                <Text style={[typography.label, { color: colors.textSecondary }]}>QTY</Text>
                <View style={styles.priceInputRow}>
                  <TextInput
                    placeholder="1"
                    placeholderTextColor={colors.textTertiary ?? colors.textSecondary}
                    keyboardType="number-pad"
                    value={formData.quantity ? String(formData.quantity) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t, 10);
                      setFormData((p) => ({ ...p, quantity: isNaN(n) ? 1 : n }));
                    }}
                    style={[
                      styles.priceInput,
                      { color: colors.text, fontFamily: 'GeistMono_600SemiBold' },
                    ]}
                  />
                </View>
              </View>
            </View>

            <View style={[styles.conditionRow]}>
              {CONDITIONS.map((c) => {
                const isActive = formData.condition === c.id;
                return (
                  <PressableScale
                    key={c.id}
                    onPress={() => setFormData((p) => ({ ...p, condition: c.id }))}
                    haptic="selection"
                    style={styles.conditionTileWrap}
                  >
                    <View
                      style={[
                        styles.conditionTile,
                        {
                          backgroundColor: isActive ? colors.primaryMuted ?? colors.surface : colors.surface,
                          borderColor: isActive ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.bodyMd,
                          { color: isActive ? colors.primary : colors.text },
                        ]}
                      >
                        {c.name}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textTertiary ?? colors.textSecondary }]}>
                        {c.hint}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          {/* Optional title + brand */}
          <View style={styles.section}>
            <SectionHeader title="Title & brand" eyebrow="OPTIONAL" />
            <View style={[styles.textField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                placeholder="e.g. iPhone 14 Pro 256GB"
                placeholderTextColor={colors.textTertiary ?? colors.textSecondary}
                value={formData.name}
                onChangeText={(t) => setFormData((p) => ({ ...p, name: t }))}
                style={[styles.textInput, { color: colors.text, fontFamily: 'Geist_500Medium' }]}
              />
            </View>
            <View style={[styles.textField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                placeholder="Brand (e.g. Apple)"
                placeholderTextColor={colors.textTertiary ?? colors.textSecondary}
                value={formData.brand}
                onChangeText={(t) => setFormData((p) => ({ ...p, brand: t }))}
                style={[styles.textInput, { color: colors.text, fontFamily: 'Geist_500Medium' }]}
              />
            </View>
          </View>

          {/* eBay toggle row */}
          <View style={styles.section}>
            <PressableScale onPress={() => setPostToEbay((v) => !v)} haptic="selection">
              <View
                style={[
                  styles.toggleRow,
                  {
                    backgroundColor: postToEbay ? colors.primaryMuted ?? colors.surface : colors.surface,
                    borderColor: postToEbay ? colors.primary : colors.border,
                  },
                ]}
              >
                <IconBadge icon="globe-outline" size="md" variant={postToEbay ? 'gradient' : 'subtle'} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.bodyMd, { color: colors.text }]}>
                    Also list on eBay Sandbox
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    Real eBay sandbox listing with your photo.
                  </Text>
                </View>
                <View
                  style={[
                    styles.toggle,
                    {
                      backgroundColor: postToEbay ? colors.primary : colors.surfaceSunk ?? colors.surface,
                      borderColor: postToEbay ? colors.primary : colors.borderStrong ?? colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      { transform: [{ translateX: postToEbay ? 14 : 0 }] },
                    ]}
                  />
                </View>
              </View>
            </PressableScale>
          </View>
        </ScrollView>

        {/* Fade-mask so the form doesn't crash into the floating submit button */}
        <LinearGradient
          colors={['rgba(10, 10, 15, 0)', 'rgba(10, 10, 15, 0.92)', 'rgba(10, 10, 15, 1)']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={[styles.submitFadeMask, { bottom: insets.bottom + 92, height: 80 }]}
        />

        {/* Floating submit button — sits above the tab bar */}
        <View
          style={[
            styles.submitWrap,
            { bottom: insets.bottom + 96 },
          ]}
          pointerEvents="box-none"
        >
          {formValid ? (
            <GradientButton
              label={postToEbay ? 'List on eBay' : 'Save listing'}
              icon="arrow-forward-circle"
              size="lg"
              loading={isSubmitting}
              onPress={handleSubmit}
            />
          ) : (
            <View
              style={[
                styles.submitHint,
                { backgroundColor: colors.surface, borderColor: colors.borderStrong ?? colors.border },
              ]}
            >
              <Ionicons name="arrow-up-outline" size={16} color={colors.textSecondary} />
              <Text style={[typography.bodyMd, { color: colors.textSecondary }]}>
                {productImages.length === 0 ? 'Add a photo to continue' : 'Pick a category to continue'}
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Verification / success modal */}
      <Modal visible={showModal} transparent animationType="none" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surfaceRaised ?? colors.surface,
                borderColor: colors.borderStrong ?? colors.border,
                opacity: fade,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {modalState === 'working' ? (
              <>
                <AuroraOrb size={88} state="thinking" />
                <Text style={[typography.h2, { color: colors.text, marginTop: 12, textAlign: 'center' }]}>
                  Listing your item…
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
                  Uploading photo, talking to eBay, publishing.
                </Text>
              </>
            ) : modalState === 'success' ? (
              <>
                <AuroraOrb size={88} state="responding" />
                <Text style={[typography.h1, { color: colors.text, marginTop: 12, textAlign: 'center' }]}>
                  You're live.
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
                  {lastListingUrl ? 'Your eBay sandbox listing is ready to view.' : 'Saved to your listings.'}
                </Text>
                <View style={styles.modalActions}>
                  {lastListingUrl ? (
                    <GradientButton
                      label="View on eBay"
                      icon="open-outline"
                      size="md"
                      onPress={() => {
                        const url = lastListingUrl;
                        setShowModal(false);
                        if (url) {
                          // Use the statically-imported Linking — a dynamic
                          // `import('react-native')` evaluates the entire
                          // barrel and triggers PushNotificationIOS, which
                          // crashes because we cleared the push entitlement.
                          Linking.openURL(url).catch(() => undefined);
                        }
                      }}
                    />
                  ) : null}
                  <PressableScale onPress={closeModalAndReset} haptic="selection">
                    <View
                      style={[
                        styles.modalSecondary,
                        { borderColor: colors.borderStrong ?? colors.border },
                      ]}
                    >
                      <Text style={[typography.bodyMd, { color: colors.text }]}>List another</Text>
                    </View>
                  </PressableScale>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.failIcon, { backgroundColor: `${colors.error}22` }]}>
                  <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
                </View>
                <Text style={[typography.h2, { color: colors.text, marginTop: 12, textAlign: 'center' }]}>
                  Couldn't list on eBay
                </Text>
                <Text
                  style={[typography.caption, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}
                  numberOfLines={3}
                >
                  {lastError || 'Try again, or save locally for now.'}
                </Text>
                <View style={styles.modalActions}>
                  <GradientButton
                    label="Try again"
                    icon="refresh-outline"
                    size="md"
                    onPress={() => {
                      setShowModal(false);
                      setTimeout(handleSubmit, 220);
                    }}
                  />
                  <PressableScale onPress={closeModalAndReset} haptic="selection">
                    <View style={[styles.modalSecondary, { borderColor: colors.borderStrong ?? colors.border }]}>
                      <Text style={[typography.bodyMd, { color: colors.text }]}>Save locally</Text>
                    </View>
                  </PressableScale>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>
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

  hero: { gap: 2 },

  photoSection: { gap: 12 },
  photoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  photoStrip: {},
  photoStripContent: { gap: 12, paddingVertical: 4 },
  photoThumbWrap: {
    position: 'relative',
    width: 110,
    height: 110,
    borderRadius: 18,
    overflow: 'hidden',
  },
  photoThumb: { width: 110, height: 110, borderRadius: 18 },
  removeBtnWrap: { position: 'absolute', top: 4, right: 4 },
  removeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMorePhoto: {
    width: 110,
    height: 110,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { gap: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  row: { flexDirection: 'row', gap: 12 },
  inlineField: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  priceInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  priceInput: {
    flex: 1,
    fontSize: 22,
    paddingVertical: 0,
  },

  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conditionTileWrap: {
    minWidth: '47%',
    flexGrow: 1,
  },
  conditionTile: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },

  photoLibBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: -4,
  },

  textField: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  textInput: {
    fontSize: 15,
    paddingVertical: 12,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggle: {
    width: 36,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    padding: 2,
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
  },

  submitWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  submitFadeMask: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  submitHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 15, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 28,
    alignItems: 'center',
    gap: 4,
  },
  modalActions: {
    width: '100%',
    gap: 10,
    marginTop: 20,
  },
  modalSecondary: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  failIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
