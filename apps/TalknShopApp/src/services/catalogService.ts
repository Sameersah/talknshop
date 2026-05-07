/**
 * Catalog service client — POST /api/v1/search (catalog-service :8002).
 */

import { Platform } from 'react-native';
import { LOCAL_IP, SERVICE_URLS } from '@/constants/config';
import { Product } from '@/data/products';

interface CatalogProductJson {
  id: string;
  title: string;
  brand?: string;
  price?: number;
  currency?: string;
  platform: string;
  rating?: number;
  review_count?: number;
  image_url?: string;
  availability?: string;
  description?: string;
  url?: string;
}

interface CatalogSearchResponse {
  query: string;
  products: CatalogProductJson[];
}

function catalogBaseUrl(): string {
  const base = SERVICE_URLS.CATALOG;
  if (__DEV__ && Platform.OS === 'ios' && base.includes('localhost')) {
    return base.replace('localhost', LOCAL_IP);
  }
  return base;
}

function mapToAppProduct(p: CatalogProductJson): Product {
  const source: Product['source'] =
    p.platform === 'walmart' || p.platform === 'target' ? p.platform : 'amazon';
  return {
    id: p.id,
    name: p.title,
    description: p.description ?? '',
    price: typeof p.price === 'number' ? p.price : 0,
    image: p.image_url ?? '',
    rating: typeof p.rating === 'number' ? p.rating : 0,
    reviewCount: typeof p.review_count === 'number' ? p.review_count : 0,
    brand: p.brand ?? '—',
    category: p.platform,
    inStock: !p.availability || /in_stock|in stock/i.test(p.availability),
    fastDelivery: false,
    source,
    url: p.url,
  };
}

/**
 * Returns null if the network fails or the API is unreachable; empty array if API returns no products.
 */
export async function searchCatalog(query: string): Promise<Product[] | null> {
  const q = query.trim();
  if (!q) return [];

  try {
    const res = await fetch(`${catalogBaseUrl()}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: q,
        filters: { platforms: ['amazon'] },
        pagination: { page: 1, size: 20 },
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as CatalogSearchResponse;
    const list = Array.isArray(data.products) ? data.products : [];
    return list.map(mapToAppProduct);
  } catch {
    return null;
  }
}
