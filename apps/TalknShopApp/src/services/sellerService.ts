import { config, API_ENDPOINTS, SERVICE_URLS, LOCAL_IP } from '@/constants/config';
import { storage } from '@/utils/storage';
import { STORAGE_KEYS } from '@/constants/config';
import { Platform } from 'react-native';
import { SellerProduct } from '@/data/sellerProducts';

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

    // Use Mac IP for physical iOS device, localhost for simulator/web
    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.SELLER.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.SELLER;

    const response = await fetch(
      `${baseUrl}/api/${config.API_VERSION}${API_ENDPOINTS.SELLER.CREATE_LISTING}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(listing),
      }
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

    // Use Mac IP for physical iOS device
    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.SELLER.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.SELLER;

    const response = await fetch(
      `${baseUrl}/api/${config.API_VERSION}${API_ENDPOINTS.SELLER.LISTINGS}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch listings');
    }

    const data = await response.json();
    // API returns listings with nested product object, extract products
    const listings = data.listings || [];
    return listings.map((listing: any) => ({
      ...listing.product,
      status: listing.status,
      createdAt: listing.createdAt,
    })) as SellerProduct[];
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
    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.SELLER.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.SELLER;
    const response = await fetch(
      `${baseUrl}/api/${config.API_VERSION}${endpoint}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(updates),
      }
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
    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.SELLER.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.SELLER;
    const response = await fetch(
      `${baseUrl}/api/${config.API_VERSION}${endpoint}`,
      {
        method: 'DELETE',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete listing');
    }
  }
}

export const sellerService = new SellerService();

