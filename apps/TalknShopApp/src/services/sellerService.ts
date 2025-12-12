import { config, API_ENDPOINTS, SERVICE_URLS, LOCAL_IP } from '@/constants/config';
import { storage } from '@/utils/storage';
import { STORAGE_KEYS } from '@/constants/config';
import { Platform } from 'react-native';
import { SellerProduct } from '@/data/sellerProducts';
import { getSellerProducts } from '@/data/sellerProducts';
import Constants from 'expo-constants';

export interface CreateListingRequest {
  category: string;
  name?: string;
  brand?: string;
  description?: string;
  price?: number;
  quantity?: number;
  condition?: 'new' | 'like-new' | 'good' | 'fair';
  images: string[]; // S3 keys
  inStock?: boolean;
  fastDelivery?: boolean;
}

export interface CreateListingResponse {
  id: string;
  status: 'active' | 'pending' | 'sold';
  createdAt: string;
  product: SellerProduct;
}

export interface ListingError {
  code: string;
  message: string;
  type: 'USER' | 'SYSTEM';
  fields?: string[];
}

class SellerService {
  private getBaseUrl(): string {
    // Simulator can use localhost. Physical iOS devices need Mac IP.
    const base = SERVICE_URLS.SELLER;
    const isIosSimulator = Boolean(Constants.platform?.ios?.simulator);
    if (__DEV__ && Platform.OS === 'ios' && !isIosSimulator) return base.replace('localhost', LOCAL_IP);
    return base;
  }

  private async fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      return await storage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Create a new seller listing
   */
  async createListing(listing: CreateListingRequest): Promise<CreateListingResponse> {
    const token = await this.getAuthToken();

    const baseUrl = this.getBaseUrl();

    const response = await this.fetchWithTimeout(
      `${baseUrl}/api/${config.API_VERSION}${API_ENDPOINTS.SELLER.CREATE_LISTING}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(listing),
      },
      5000
    );

    if (!response.ok) {
      const error: ListingError = await response.json().catch(() => ({
        code: 'SERVER_ERROR',
        message: `HTTP ${response.status}: Failed to create listing`,
        type: 'SYSTEM',
      }));

      throw new Error(error.message || 'Failed to create listing');
    }

    return await response.json();
  }

  /**
   * Get seller's listings
   */
  async getMyListings(): Promise<SellerProduct[]> {
    const token = await this.getAuthToken();

    const baseUrl = this.getBaseUrl();

    try {
      const response = await this.fetchWithTimeout(
        `${baseUrl}/api/${config.API_VERSION}${API_ENDPOINTS.SELLER.LISTINGS}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        },
        1500
      );

      if (!response.ok) {
        // Fall back silently for demo/offline usage
        return getSellerProducts('current-user');
      }

      const data = await response.json();
      // API returns listings with nested product object, extract products
      const listings = data.listings || [];
      return listings.map((listing: any) => ({
        ...listing.product,
        status: listing.status,
        createdAt: listing.createdAt,
      })) as SellerProduct[];
    } catch (e) {
      // Network errors/timeouts are expected when seller backend is not running.
      return getSellerProducts('current-user');
    }
  }

  /**
   * Update a listing
   */
  async updateListing(
    listingId: string,
    updates: Partial<CreateListingRequest>
  ): Promise<CreateListingResponse> {
    const token = await this.getAuthToken();

    const endpoint = API_ENDPOINTS.SELLER.UPDATE_LISTING.replace(':id', listingId);
    const baseUrl = this.getBaseUrl();
    const response = await this.fetchWithTimeout(
      `${baseUrl}/api/${config.API_VERSION}${endpoint}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(updates),
      },
      5000
    );

    if (!response.ok) {
      const error: ListingError = await response.json().catch(() => ({
        code: 'SERVER_ERROR',
        message: `HTTP ${response.status}: Failed to update listing`,
        type: 'SYSTEM',
      }));

      throw new Error(error.message || 'Failed to update listing');
    }

    return await response.json();
  }

  /**
   * Delete a listing
   */
  async deleteListing(listingId: string): Promise<void> {
    const token = await this.getAuthToken();

    const endpoint = API_ENDPOINTS.SELLER.DELETE_LISTING.replace(':id', listingId);
    const baseUrl = this.getBaseUrl();
    const response = await this.fetchWithTimeout(
      `${baseUrl}/api/${config.API_VERSION}${endpoint}`,
      {
        method: 'DELETE',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      },
      5000
    );

    if (!response.ok) {
      throw new Error('Failed to delete listing');
    }
  }
}

export const sellerService = new SellerService();

