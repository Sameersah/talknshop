import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from './products';

export interface SellerProduct extends Product {
  sellerId: string;
  sellerName: string;
  condition: 'new' | 'like-new' | 'good' | 'fair';
  quantity: number;
  listedDate: string;
  status: 'active' | 'sold' | 'pending';
  ebayListingId?: string;
  ebayListingUrl?: string;
}

const STORAGE_KEY = 'talknshop:seller_products';

// In-memory cache — populated from AsyncStorage on first load
let sellerProducts: SellerProduct[] = [];
let _loaded = false;

// ── Persistence helpers ───────────────────────────────────────────────────────

async function _save(products: SellerProduct[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (e) {
    console.warn('[sellerProducts] Failed to save to AsyncStorage:', e);
  }
}

/** Load from AsyncStorage into memory. Call this once at app start. */
export async function loadSellerProducts(): Promise<SellerProduct[]> {
  if (_loaded) return sellerProducts;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      sellerProducts = JSON.parse(raw) as SellerProduct[];
    }
  } catch (e) {
    console.warn('[sellerProducts] Failed to load from AsyncStorage:', e);
    sellerProducts = [];
  }
  _loaded = true;
  return sellerProducts;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const addSellerProduct = async (
  product: Partial<SellerProduct>
): Promise<SellerProduct> => {
  // Make sure we have the latest data before adding
  await loadSellerProducts();

  const newProduct: SellerProduct = {
    id: `seller-${Date.now()}`,
    name: product.name || '',
    description: product.description || '',
    price: product.price || 0,
    image: product.image || '',
    rating: 0,
    reviewCount: 0,
    brand: product.brand || '',
    category: product.category || '',
    inStock: product.inStock ?? true,
    fastDelivery: product.fastDelivery ?? false,
    sellerId: product.sellerId || 'current-user',
    sellerName: product.sellerName || 'You',
    condition: product.condition || 'new',
    quantity: product.quantity || 1,
    listedDate: new Date().toISOString(),
    status: 'active',
    source: 'seller',
    ebayListingId: product.ebayListingId,
    ebayListingUrl: product.ebayListingUrl,
  };

  sellerProducts = [newProduct, ...sellerProducts]; // newest first
  await _save(sellerProducts);
  return newProduct;
};

export const getSellerProducts = (sellerId?: string): SellerProduct[] => {
  if (sellerId) {
    return sellerProducts.filter((p) => p.sellerId === sellerId);
  }
  return sellerProducts;
};

export const getSellerProductsByCategory = (category: string): SellerProduct[] => {
  return sellerProducts.filter(
    (p) => p.category.toLowerCase() === category.toLowerCase() && p.status === 'active'
  );
};

/** Clear all listings (useful for testing). */
export const clearSellerProducts = async (): Promise<void> => {
  sellerProducts = [];
  _loaded = false;
  await AsyncStorage.removeItem(STORAGE_KEY);
};
