import React, { useState } from 'react';
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
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Product } from '@/data/products';
import { addSellerProduct } from '@/data/sellerProducts';

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

export const SellerScreen: React.FC = () => {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

    setIsSubmitting(true);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Auto-generate name if not provided
      const productName = formData.name || `${PRODUCT_CATEGORIES.find(c => c.id === selectedCategory)?.name} Item`;
      
      // Auto-generate description if not provided
      const productDescription = formData.description || `Quality ${productName.toLowerCase()} for sale`;
      
      // Default price to 0 if not set (can be updated later)
      const productPrice = formData.price || 0;

      const newProduct = addSellerProduct({
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

      console.log('Product submitted:', newProduct);

      Alert.alert(
        'Listed! 🎉',
        'Your product is now live. You can add more details later.',
        [
          {
            text: 'List Another',
            onPress: () => {
              // Reset form but keep category
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
            },
          },
          {
            text: 'Done',
            onPress: () => {
              // Reset everything
              setSelectedCategory(null);
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
          },
        },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to list product. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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

      {/* Quick Submit Button - Always visible when category and image selected */}
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

      {/* Product Details Form - All Optional */}
      {selectedCategory && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, ...typography.h3 }]}>
            Product Details (Optional)
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Add more details to help buyers find your product
          </Text>

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

      <View style={{ height: 40 }} />
    </ScrollView>
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
    marginBottom: 32,
  },
  sectionTitle: {
    marginBottom: 8,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: 16,
    opacity: 0.7,
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
});

