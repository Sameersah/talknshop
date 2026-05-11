import Constants from 'expo-constants';

// Get environment variables from .env file (loaded via app.config.ts)
// All secrets must be in .env file - no hardcoded fallbacks
const getEnvVar = (key: string, required: boolean = true): string => {
  // Try Expo environment variables first (prefixed with EXPO_PUBLIC_)
  const expoKey = `EXPO_PUBLIC_${key}`;
  if (typeof process !== 'undefined' && process.env[expoKey]) {
    const value = process.env[expoKey];
    if (value && value.trim() !== '') {
      return value;
    }
  }
  // Try Constants.expoConfig.extra (loaded from app.config.ts)
  const extraValue = Constants.expoConfig?.extra?.[key];
  if (extraValue && typeof extraValue === 'string' && extraValue.trim() !== '') {
    return extraValue;
  }
  // If required and not found, throw error
  if (required) {
    const availableKeys = Object.keys(Constants.expoConfig?.extra || {}).join(', ');
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Set EXPO_PUBLIC_${key} (recommended) or ${key} in apps/TalknShopApp/.env ` +
      `(copy from apps/TalknShopApp/env.example), or in talknshop/.env at monorepo root. ` +
      `Restart Expo after editing .env (stop and run npx expo start again). ` +
      `Available extra keys: ${availableKeys || 'none'}`
    );
  }
  return '';
};

// Environment configuration
const ENV = {
  development: {
    API_BASE_URL: 'http://localhost:8000',
    API_VERSION: 'v1',
    // All secrets must come from .env file - no hardcoded values
    COGNITO_DOMAIN: getEnvVar('COGNITO_DOMAIN', true),
    USER_POOL_ID: getEnvVar('COGNITO_USER_POOL_ID', true),
    APP_CLIENT_ID: getEnvVar('COGNITO_APP_CLIENT_ID', true),
    REDIRECT_SCHEME: 'talknshop',
    REDIRECT_URI: 'talknshop://auth', // For mobile deep link
    REDIRECT_URI_WEB: 'http://localhost:8081', // For web/desktop
    SENTRY_DSN: getEnvVar('SENTRY_DSN', false),
    ANALYTICS_KEY: getEnvVar('ANALYTICS_KEY', false),
  },
  staging: {
    API_BASE_URL: 'https://api-staging.talknshop.com',
    API_VERSION: 'v1',
    COGNITO_DOMAIN: 'talknshop-staging.auth.us-east-1.amazoncognito.com',
    USER_POOL_ID: 'us-east-1_xxxxxxxxx',
    APP_CLIENT_ID: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
    REDIRECT_SCHEME: 'talknshop',
    REDIRECT_URI: 'talknshop://auth',
    SENTRY_DSN: 'https://xxxxxxxxx@sentry.io/xxxxxxxxx',
    ANALYTICS_KEY: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  production: {
    API_BASE_URL: 'https://api.talknshop.com',
    API_VERSION: 'v1',
    COGNITO_DOMAIN: 'talknshop.auth.us-east-1.amazoncognito.com',
    USER_POOL_ID: 'us-east-1_xxxxxxxxx',
    APP_CLIENT_ID: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
    REDIRECT_SCHEME: 'talknshop',
    REDIRECT_URI: 'talknshop://auth',
    SENTRY_DSN: 'https://xxxxxxxxx@sentry.io/xxxxxxxxx',
    ANALYTICS_KEY: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
};

// Get current environment
const getEnvironment = (): keyof typeof ENV => {
  const releaseChannel = Constants.expoConfig?.extra?.eas?.channel;
  
  if (__DEV__) return 'development';
  if (releaseChannel === 'staging') return 'staging';
  return 'production';
};

// Export configuration
export const config = ENV[getEnvironment()];

// Get local IP for iOS device access (use your Mac's IP when testing on iPhone).
// Reads EXPO_PUBLIC_LOCAL_IP from .env first (preferred — survives IP changes),
// then falls back to a hardcoded value. Update apps/TalknShopApp/.env when your
// Mac's Wi-Fi IP changes — run `ifconfig | grep "inet " | grep -v 127.0.0.1`.
export const LOCAL_IP =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_LOCAL_IP) ||
  Constants.expoConfig?.extra?.LOCAL_IP ||
  '10.0.0.43';

// Service-specific URLs (for direct service calls, bypassing orchestrator)
// Docker Compose: orchestrator 8000, media 8001, catalog 8002, seller-crosspost 8003, asl 8004
// Replace localhost with LOCAL_IP on a physical iPhone via each service helper.
export const SERVICE_URLS = {
  MEDIA: __DEV__ ? 'http://localhost:8001' : config.API_BASE_URL,
  /** Dev default; seller-crosspost in compose is :8003 — align routes before pointing here. */
  SELLER: __DEV__ ? 'http://localhost:8005' : config.API_BASE_URL,
  /** seller-crosspost-service (marketplace posting / jobs). */
  MARKETPLACE: __DEV__ ? 'http://localhost:8003' : config.API_BASE_URL,
  CATALOG: __DEV__ ? 'http://localhost:8002' : config.API_BASE_URL,
  ASL: __DEV__ ? 'http://localhost:8004' : config.API_BASE_URL,
  ORCHESTRATOR: config.API_BASE_URL, // Port 8000
};

// Feature flags
export const FEATURES = {
  ENABLE_VOICE_SEARCH: true,
  ENABLE_IMAGE_SEARCH: true,
  ENABLE_PUSH_NOTIFICATIONS: true,
  ENABLE_BIOMETRIC_AUTH: true,
  ENABLE_OFFLINE_MODE: true,
  ENABLE_ANALYTICS: !__DEV__,
  ENABLE_CRASH_REPORTING: !__DEV__,
  ENABLE_PERFORMANCE_MONITORING: !__DEV__,
} as const;

// API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
  },
  USER: {
    PROFILE: '/user/profile',
    PREFERENCES: '/user/preferences',
    NOTIFICATIONS: '/user/notifications',
  },
  SEARCH: {
    TEXT: '/search/text',
    IMAGE: '/search/image',
    VOICE: '/search/voice',
    SUGGESTIONS: '/search/suggestions',
  },
  PRODUCTS: {
    LIST: '/products',
    DETAIL: '/products/:id',
    COMPARE: '/products/compare',
    RECOMMENDATIONS: '/products/recommendations',
  },
  CHAT: {
    SESSIONS: '/chat/sessions',
    MESSAGES: '/chat/sessions/:id/messages',
    SEND: '/chat/sessions/:id/send',
  },
  WISHLIST: {
    LIST: '/wishlist',
    ADD: '/wishlist/add',
    REMOVE: '/wishlist/remove/:id',
    UPDATE: '/wishlist/update/:id',
  },
  ORDERS: {
    LIST: '/orders',
    DETAIL: '/orders/:id',
    CREATE: '/orders',
    CANCEL: '/orders/:id/cancel',
  },
  MEDIA: {
    /** Request presigned URL from orchestrator (POST). Then PUT file to returned upload_url. */
    UPLOAD_URL: '/api/v1/media/upload-url',
  },
  NOTIFICATIONS: {
    REGISTER_TOKEN: '/notifications/register',
    UNREGISTER_TOKEN: '/notifications/unregister',
    LIST: '/notifications',
    MARK_READ: '/notifications/:id/read',
  },
  SELLER: {
    LISTINGS: '/seller/listings',
    LISTING_DETAIL: '/seller/listings/:id',
    CREATE_LISTING: '/seller/listings',
    UPDATE_LISTING: '/seller/listings/:id',
    DELETE_LISTING: '/seller/listings/:id',
  },
  MARKETPLACE: {
    CONNECTIONS: '/marketplace/connections',
    CONNECT: '/marketplace/:platform/connect',
    POST: '/marketplace/post',
    LISTING_STATUS: '/marketplace/listings/:id/status',
    UPDATE_LISTING: '/marketplace/listings/:id/:platform',
    DELETE_LISTING: '/marketplace/listings/:id/:platform',
  },
} as const;

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
  USER_PREFERENCES: 'user_preferences',
  SEARCH_HISTORY: 'search_history',
  CART_ITEMS: 'cart_items',
  OFFLINE_DATA: 'offline_data',
} as const;

// Animation durations
export const ANIMATIONS = {
  FAST: 200,
  NORMAL: 300,
  SLOW: 500,
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// File upload limits
export const UPLOAD_LIMITS = {
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_AUDIO_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_VIDEO_SIZE: 100 * 1024 * 1024, // 100MB
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  SUPPORTED_AUDIO_TYPES: ['audio/mp3', 'audio/wav', 'audio/m4a'],
} as const;

// Deep link patterns
export const DEEP_LINKS = {
  AUTH_CALLBACK: 'talknshop://auth',
  PRODUCT_DETAIL: 'talknshop://product/:id',
  ORDER_DETAIL: 'talknshop://order/:id',
  CHAT_SESSION: 'talknshop://chat/:id',
} as const;

// Error codes
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// Notification channels (Android)
export const NOTIFICATION_CHANNELS = {
  DEFAULT: 'default',
  PRICE_ALERTS: 'price_alerts',
  ORDER_UPDATES: 'order_updates',
  GENERAL: 'general',
} as const;
