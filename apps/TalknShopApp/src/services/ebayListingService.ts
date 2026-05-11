/**
 * ebayListingService.ts
 *
 * Handles the full eBay Sandbox listing flow from the mobile app:
 *   1. Upload image to seller-crosspost-service
 *   2. POST /api/v1/ebay/list  → returns listingId + URL
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { LOCAL_IP } from '@/constants/config';

// Crosspost service base URL — swap localhost → Mac IP on physical device
const CROSSPOST_PORT = 8003;

// Fetch timeouts (ms). If the crosspost service is unreachable, fail fast
// instead of hanging the UI's verification modal forever.
const UPLOAD_TIMEOUT_MS = 20_000;   // image upload — generous for slow networks
const LISTING_TIMEOUT_MS = 30_000;  // eBay listing — 3 round-trips + ngrok image fetch

function getCrosspostBaseUrl(): string {
  const isSimulator = Boolean(Constants.platform?.ios?.simulator);
  if (__DEV__ && Platform.OS === 'ios' && !isSimulator) {
    return `http://${LOCAL_IP}:${CROSSPOST_PORT}`;
  }
  return `http://localhost:${CROSSPOST_PORT}`;
}

/**
 * fetch() with an automatic abort after `timeoutMs`. Throws a clear error
 * instead of hanging if the server is unreachable / very slow.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `Request to ${url} timed out after ${timeoutMs / 1000}s. ` +
        `Make sure the crosspost service is running and your Mac's IP ` +
        `(LOCAL_IP) is reachable from this device.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface EbayListingInput {
  title: string;
  description?: string;
  price: number;
  condition?: 'new' | 'like-new' | 'good' | 'fair' | 'poor';
  category?: string;
  brand?: string;
  quantity?: number;
  /** Local file URI of the photo taken on the device (e.g. file:///...) */
  localImageUri?: string;
}

export interface EbayListingResult {
  success: boolean;
  listingId?: string;
  listingUrl?: string;
  sku?: string;
  imageUsed?: string;
  postedAt?: string;
  error?: string;
}

class EbayListingService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getCrosspostBaseUrl();
  }

  /** Re-resolve URL in case LOCAL_IP changes after construction. */
  private url(path: string): string {
    return `${getCrosspostBaseUrl()}${path}`;
  }

  /**
   * Upload a local image file to the crosspost service.
   * Returns the saved filename (and optional public URL if ngrok is configured).
   */
  async uploadImage(localUri: string): Promise<{ filename: string; publicUrl?: string }> {
    const formData = new FormData();

    // React Native FormData accepts { uri, name, type } for file uploads
    const filename = localUri.split('/').pop() || 'photo.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    formData.append('file', {
      uri: localUri,
      name: filename,
      type: mimeType,
    } as any);

    const resp = await fetchWithTimeout(
      this.url('/api/v1/upload-image'),
      {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type manually — React Native sets it with boundary automatically
      },
      UPLOAD_TIMEOUT_MS,
    );

    if (!resp.ok) {
      throw new Error(`Image upload failed: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json();
    return { filename: data.filename, publicUrl: data.public_url };
  }

  /**
   * Create a real eBay Sandbox listing.
   * Optionally uploads the user's photo first (if localImageUri is provided).
   */
  async createListing(input: EbayListingInput): Promise<EbayListingResult> {
    let imageFilename: string | undefined;

    // Step 1: Upload photo if we have one
    if (input.localImageUri) {
      try {
        const { filename } = await this.uploadImage(input.localImageUri);
        imageFilename = filename;
        console.log('[eBay] Image uploaded:', filename);
      } catch (err) {
        console.warn('[eBay] Image upload failed, will use placeholder:', err);
        // Non-fatal — the service falls back to a category-appropriate Unsplash image
      }
    }

    // Step 2: Create eBay listing
    const payload = {
      title: input.title,
      description: input.description || input.title,
      price: input.price,
      condition: input.condition || 'good',
      category: input.category || 'Electronics',
      brand: input.brand || 'Unbranded',
      quantity: input.quantity || 1,
      image_filename: imageFilename,   // basename; service builds the full URL
      image_urls: [],                  // empty → service resolves from image_filename or category
    };

    const resp = await fetchWithTimeout(
      this.url('/api/v1/ebay/list'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      LISTING_TIMEOUT_MS,
    );

    const data = await resp.json();

    if (!resp.ok || !data.success) {
      return {
        success: false,
        error: data.error || data.detail || `HTTP ${resp.status}`,
      };
    }

    return {
      success: true,
      listingId: data.listing_id,
      listingUrl: data.listing_url,
      sku: data.sku,
      imageUsed: data.image_used,
      postedAt: data.posted_at,
    };
  }

  /** Quick health check — resolves true if the service is reachable. */
  async isServiceReachable(): Promise<boolean> {
    try {
      const resp = await fetch(this.url('/health'), { signal: AbortSignal.timeout(3000) });
      return resp.ok;
    } catch {
      return false;
    }
  }
}

export const ebayListingService = new EbayListingService();
