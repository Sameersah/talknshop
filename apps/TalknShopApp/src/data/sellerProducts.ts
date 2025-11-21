import { Product } from './products';

export interface SellerProduct extends Product {
  sellerId: string;
  sellerName: string;
  condition: 'new' | 'like-new' | 'good' | 'fair';
  quantity: number;
  listedDate: string;
  status: 'active' | 'sold' | 'pending';
}

// This would typically come from an API or database
// For now, we'll use an empty array that gets populated when sellers list products
export let sellerProducts: SellerProduct[] = [];

export const addSellerProduct = (product: Partial<SellerProduct>): SellerProduct => {
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
  };

  sellerProducts.push(newProduct);
  return newProduct;
};

export const getSellerProducts = (sellerId?: string): SellerProduct[] => {
  if (sellerId) {
    return sellerProducts.filter((p) => p.sellerId === sellerId);
  }
  return sellerProducts;
};

export const getSellerProductsByCategory = (category: string): SellerProduct[] => {
  return sellerProducts.filter((p) => p.category.toLowerCase() === category.toLowerCase() && p.status === 'active');
};

