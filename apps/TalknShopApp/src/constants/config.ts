import Constants from 'expo-constants';

// Environment configuration
const ENV = {
  development: {
    API_BASE_URL: 'http://localhost:8000',
    API_VERSION: 'v1',
    COGNITO_DOMAIN: 'talknshop-dev.auth.us-east-1.amazoncognito.com',
    USER_POOL_ID: 'us-east-1_xxxxxxxxx',
    APP_CLIENT_ID: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
    REDIRECT_SCHEME: 'talknshop',
    REDIRECT_URI: 'talknshop://auth',
    SENTRY_DSN: '',
    ANALYTICS_KEY: '',
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
    UPLOAD: '/media/upload',
    PRESIGNED_URL: '/media/presigned-url',
  },
  NOTIFICATIONS: {
    REGISTER_TOKEN: '/notifications/register',
    UNREGISTER_TOKEN: '/notifications/unregister',
    LIST: '/notifications',
    MARK_READ: '/notifications/:id/read',
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
