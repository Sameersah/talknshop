import { config, API_ENDPOINTS, SERVICE_URLS, LOCAL_IP } from '@/constants/config';
import { storage } from '@/utils/storage';
import { STORAGE_KEYS } from '@/constants/config';
import { Platform } from 'react-native';
import { SellerProduct } from '@/data/sellerProducts';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type MarketplacePlatform = 'ebay' | 'facebook' | 'craigslist' | 'offerup' | 'mercari';

export interface MarketplaceConnection {
  platform: MarketplacePlatform;
  connected: boolean;
  accountName?: string;
  lastSync?: string;
}

export interface PostToMarketplaceRequest {
  listingId: string;
  platforms: MarketplacePlatform[];
  product: SellerProduct;
}

export interface MarketplacePostResponse {
  platform: MarketplacePlatform;
  success: boolean;
  listingId?: string;
  listingUrl?: string;
  error?: string;
}

export interface PostToMarketplaceResponse {
  listingId: string;
  results: MarketplacePostResponse[];
}

export interface UploadImageToEbayRequest {
  imageData: string; // Base64 encoded
  fileName: string;
  contentType: string;
}

export interface UploadImageToEbayResponse {
  imageUrl: string;
  imageId?: string;
}

class MarketplaceService {
  private async getAuthToken(): Promise<string | null> {
    try {
      return await storage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Get connected marketplaces for the user
   */
  async getConnectedMarketplaces(): Promise<MarketplaceConnection[]> {
    try {
      const token = await this.getAuthToken();

      // Use Mac IP for physical iOS device
      const baseUrl = Platform.OS === 'ios' 
        ? SERVICE_URLS.MARKETPLACE.replace('localhost', LOCAL_IP)
        : SERVICE_URLS.MARKETPLACE;

      const url = `${baseUrl}/api/${config.API_VERSION}${API_ENDPOINTS.MARKETPLACE.CONNECTIONS}`;
      console.log('Fetching marketplace connections from:', url);

      const response = await fetch(
        url,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Marketplace connections error: ${response.status} ${errorText}`);
        // Return default connections if API fails
        return this.getDefaultConnections();
      }

      const data = await response.json();
      console.log('Marketplace connections:', data);
      return data;
    } catch (error) {
      // Network error or other fetch errors - return default connections silently
      console.error('Marketplace connections network error:', error);
      // This is expected when backend services aren't running
      return this.getDefaultConnections();
    }
  }

  /**
   * Get default marketplace connections (when backend is unavailable)
   */
  private getDefaultConnections(): MarketplaceConnection[] {
    return [
      { platform: 'ebay', connected: false },
      { platform: 'facebook', connected: false },
      { platform: 'craigslist', connected: false },
      { platform: 'offerup', connected: false },
      { platform: 'mercari', connected: false },
    ];
  }

  /**
   * Connect to a marketplace (OAuth flow)
   */
  async connectMarketplace(platform: MarketplacePlatform): Promise<{ authUrl: string; auth_url?: string }> {
    const token = await this.getAuthToken();

    const endpoint = API_ENDPOINTS.MARKETPLACE.CONNECT.replace(':platform', platform);
    
    // For iOS, try to use Mac IP, but fallback to localhost if on simulator
    // Or use tunnel URL if available
    let baseUrl = SERVICE_URLS.MARKETPLACE;
    if (Platform.OS === 'ios') {
      // Check if we're on a physical device (not simulator)
      // Simulator can use localhost, physical device needs Mac IP
      const isSimulator = Platform.isPad || false; // Rough check
      if (!isSimulator) {
        baseUrl = SERVICE_URLS.MARKETPLACE.replace('localhost', LOCAL_IP);
      }
    }
    
    const url = `${baseUrl}/api/${config.API_VERSION}${endpoint}`;
    console.log(`Connecting to marketplace ${platform} at:`, url);
    
    const response = await fetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Marketplace connection error: ${response.status} ${errorText}`);
      throw new Error(`Failed to initiate ${platform} connection: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Marketplace connection response:', data);
    return data;
  }

  /**
   * Post listing to multiple marketplaces
   */
  async postToMarketplaces(
    request: PostToMarketplaceRequest
  ): Promise<PostToMarketplaceResponse> {
    const token = await this.getAuthToken();

    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.MARKETPLACE.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.MARKETPLACE;
    const response = await fetch(
      `${baseUrl}/api/${config.API_VERSION}${API_ENDPOINTS.MARKETPLACE.POST}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: 'Failed to post to marketplaces',
      }));
      throw new Error(error.message || 'Failed to post to marketplaces');
    }

    return await response.json();
  }

  /**
   * Get posting status for a listing
   */
  async getPostingStatus(listingId: string): Promise<MarketplacePostResponse[]> {
    const token = await this.getAuthToken();

    const endpoint = API_ENDPOINTS.MARKETPLACE.LISTING_STATUS.replace(':id', listingId);
    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.MARKETPLACE.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.MARKETPLACE;
    const response = await fetch(
      `${baseUrl}/api/${config.API_VERSION}${endpoint}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get posting status');
    }

    return await response.json();
  }

  /**
   * Update listing on marketplace
   */
  async updateMarketplaceListing(
    listingId: string,
    platform: MarketplacePlatform,
    updates: Partial<SellerProduct>
  ): Promise<void> {
    const token = await this.getAuthToken();

    const endpoint = API_ENDPOINTS.MARKETPLACE.UPDATE_LISTING.replace(':id', listingId).replace(':platform', platform);
    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.MARKETPLACE.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.MARKETPLACE;
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
      throw new Error(`Failed to update listing on ${platform}`);
    }
  }

  /**
   * Delete listing from marketplace
   */
  async deleteMarketplaceListing(
    listingId: string,
    platform: MarketplacePlatform
  ): Promise<void> {
    const token = await this.getAuthToken();

    const endpoint = API_ENDPOINTS.MARKETPLACE.DELETE_LISTING.replace(':id', listingId).replace(':platform', platform);
    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.MARKETPLACE.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.MARKETPLACE;
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
      throw new Error(`Failed to delete listing from ${platform}`);
    }
  }

  /**
   * Upload image directly to eBay
   */
  async uploadImageToEbay(
    imageUri: string,
    fileName: string,
    contentType: string = 'image/jpeg'
  ): Promise<string> {
    const token = await this.getAuthToken();

    // Use Mac IP for physical iOS device, localhost for simulator/web
    const baseUrl = Platform.OS === 'ios' 
      ? SERVICE_URLS.MARKETPLACE.replace('localhost', LOCAL_IP)
      : SERVICE_URLS.MARKETPLACE;

    // Read image file and convert to base64
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64Data = base64String.split(',')[1] || base64String;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const url = `${baseUrl}/api/${config.API_VERSION}/marketplace/ebay/upload-image`;
    console.log('Uploading image to eBay:', url);

    const uploadResponse = await fetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          imageData: base64,
          fileName: fileName,
          contentType: contentType,
        }),
      }
    );

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => ({ message: 'Failed to upload image to eBay' }));
      throw new Error(error.message || `HTTP ${uploadResponse.status}`);
    }

    const result: UploadImageToEbayResponse = await uploadResponse.json();
    return result.imageUrl;
  }
}

export const marketplaceService = new MarketplaceService();

