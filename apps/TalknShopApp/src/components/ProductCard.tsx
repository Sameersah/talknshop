import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Product } from '@/data/products';

interface ProductCardProps {
  product: Product;
  onPress?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onPress }) => {
  const { colors, spacing, typography } = useTheme();

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Ionicons key={i} name="star" size={12} color="#FFB800" />
      );
    }

    if (hasHalfStar) {
      stars.push(
        <Ionicons key="half" name="star-half" size={12} color="#FFB800" />
      );
    }

    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <Ionicons key={`empty-${i}`} name="star-outline" size={12} color={colors.textSecondary} />
      );
    }

    return stars;
  };

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  const formatReviewCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'amazon':
        return '#FF9900';
      case 'walmart':
        return '#0071CE';
      case 'target':
        return '#CC0000';
      case 'seller':
        return colors.success;
      default:
        return colors.primary;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'seller':
        return 'SELLER';
      default:
        return source.toUpperCase();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onPress?.(product)}
      activeOpacity={0.7}
    >
      {/* Product Image */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: product.image }}
          style={styles.image}
          resizeMode="cover"
        />
        {product.discount && (
          <View style={[styles.discountBadge, { backgroundColor: colors.error }]}>
            <Text style={styles.discountText}>-{product.discount}%</Text>
          </View>
        )}
        <View style={[styles.sourceBadge, { backgroundColor: getSourceColor(product.source) }]}>
          <Text style={styles.sourceText}>{getSourceLabel(product.source)}</Text>
        </View>
      </View>

      {/* Product Info */}
      <View style={styles.infoContainer}>
        <Text
          style={[styles.brand, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {product.brand}
        </Text>
        <Text
          style={[styles.name, { color: colors.text }]}
          numberOfLines={2}
        >
          {product.name}
        </Text>

        {/* Rating */}
        <View style={styles.ratingContainer}>
          <View style={styles.stars}>
            {renderStars(product.rating)}
          </View>
          <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
            {product.rating} ({formatReviewCount(product.reviewCount)})
          </Text>
        </View>

        {/* Price */}
        <View style={styles.priceContainer}>
          <Text style={[styles.price, { color: colors.text }]}>
            {formatPrice(product.price)}
          </Text>
          {product.originalPrice && (
            <Text style={[styles.originalPrice, { color: colors.textSecondary }]}>
              {formatPrice(product.originalPrice)}
            </Text>
          )}
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
          {product.fastDelivery && (
            <View style={[styles.featureBadge, { backgroundColor: colors.success + '20' }]}>
              <Ionicons name="flash" size={12} color={colors.success} />
              <Text style={[styles.featureText, { color: colors.success }]}>Fast Delivery</Text>
            </View>
          )}
          {product.inStock && (
            <View style={[styles.featureBadge, { backgroundColor: colors.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.success} />
              <Text style={[styles.featureText, { color: colors.success }]}>In Stock</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
    backgroundColor: '#F5F5F5',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sourceBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sourceText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  infoContainer: {
    padding: 16,
  },
  brand: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 22,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stars: {
    flexDirection: 'row',
    marginRight: 6,
  },
  ratingText: {
    fontSize: 12,
    marginLeft: 4,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    marginRight: 8,
  },
  originalPrice: {
    fontSize: 14,
    textDecorationLine: 'line-through',
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  featureText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

