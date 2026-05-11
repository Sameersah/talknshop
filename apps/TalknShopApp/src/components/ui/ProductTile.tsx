/**
 * ProductTile — lighter, more confident replacement for ProductCard.
 *
 * 120px square image, mono price, single source caption (no colored pill on
 * the image), one optional discount badge. Designed for 2-column grids.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Product } from '@/data/products';
import { PressableScale } from './PressableScale';

type Props = {
  product: Product;
  onPress?: (product: Product) => void;
};

const formatPrice = (price: number) => `$${price.toFixed(price >= 100 ? 0 : 2)}`;

const sourceLabel = (source: string) => {
  switch (source) {
    case 'seller':
      return 'You';
    case 'amazon':
    case 'walmart':
    case 'target':
    case 'ebay':
      return source.charAt(0).toUpperCase() + source.slice(1);
    default:
      return source;
  }
};

export const ProductTile: React.FC<Props> = ({ product, onPress }) => {
  const { colors, typography } = useTheme();

  return (
    <PressableScale
      onPress={() => onPress?.(product)}
      haptic="selection"
      style={styles.outer}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.imageWrap,
            { backgroundColor: colors.surfaceSunk ?? colors.background },
          ]}
        >
          {product.image ? (
            <Image source={{ uri: product.image }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={28} color={colors.textTertiary ?? colors.textSecondary} />
            </View>
          )}
          {product.discount ? (
            <View style={[styles.discountChip, { backgroundColor: colors.accent ?? colors.primary }]}>
              <Text style={styles.discountText}>−{product.discount}%</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.info}>
          <Text
            numberOfLines={1}
            style={[typography.label, { color: colors.textTertiary ?? colors.textSecondary }]}
          >
            {sourceLabel(product.source)}
          </Text>
          <Text
            numberOfLines={2}
            style={[typography.bodyMd, { color: colors.text }]}
          >
            {product.name}
          </Text>
          <View style={styles.priceRow}>
            <Text style={[typography.priceLg, { color: colors.text }]}>
              {formatPrice(product.price)}
            </Text>
            {product.originalPrice ? (
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.textTertiary ?? colors.textSecondary,
                    textDecorationLine: 'line-through',
                  },
                ]}
              >
                {formatPrice(product.originalPrice)}
              </Text>
            ) : null}
          </View>
          {product.fastDelivery ? (
            <View style={styles.metaRow}>
              <Ionicons name="flash" size={11} color={colors.success} />
              <Text style={[typography.caption, { color: colors.success }]}>Fast</Text>
            </View>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountChip: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  discountText: {
    color: '#0A0A0F',
    fontFamily: 'GeistMono_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  info: {
    padding: 12,
    gap: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
});
