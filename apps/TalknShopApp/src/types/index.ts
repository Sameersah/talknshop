// User & Authentication Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: NotificationSettings;
  search: SearchPreferences;
  language: string;
}

export interface NotificationSettings {
  push: boolean;
  email: boolean;
  priceAlerts: boolean;
  orderUpdates: boolean;
}

export interface SearchPreferences {
  voiceEnabled: boolean;
  imageEnabled: boolean;
  defaultRetailer: string;
  maxResults: number;
}

// Product Types
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image: string;
  images: string[];
  retailer: Retailer;
  category: string;
  brand: string;
  rating: number;
  reviewCount: number;
  availability: ProductAvailability;
  specifications: ProductSpecification[];
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface Retailer {
  id: string;
  name: string;
  logo: string;
  website: string;
  rating: number;
}

export interface ProductAvailability {
  inStock: boolean;
  quantity?: number;
  estimatedDelivery?: string;
  shippingCost: number;
}

export interface ProductSpecification {
  name: string;
  value: string;
  category: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  image: string;
  specifications: Record<string, string>;
}

// Search Types
export interface SearchQuery {
  id: string;
  text?: string;
  image?: string;
  audio?: string;
  filters: SearchFilters;
  results: Product[];
  createdAt: string;
}

export interface SearchFilters {
  category?: string;
  brand?: string;
  priceRange?: {
    min: number;
    max: number;
  };
  retailer?: string;
  rating?: number;
  availability?: boolean;
}

export interface SearchResult {
  products: Product[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

// Chat Types
export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    searchQuery?: SearchQuery;
    products?: Product[];
    suggestions?: string[];
  };
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// Wishlist Types
export interface WishlistItem {
  id: string;
  product: Product;
  addedAt: string;
  notes?: string;
  priceAlert?: PriceAlert;
}

export interface PriceAlert {
  id: string;
  targetPrice: number;
  isActive: boolean;
  createdAt: string;
}

// Order Types
export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  currency: string;
  shippingAddress: Address;
  billingAddress: Address;
  paymentMethod: PaymentMethod;
  tracking?: TrackingInfo;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  product: Product;
  quantity: number;
  price: number;
  total: number;
}

export interface Address {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone?: string;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'apple_pay' | 'google_pay';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
}

export interface TrackingInfo {
  carrier: string;
  trackingNumber: string;
  status: string;
  estimatedDelivery: string;
  events: TrackingEvent[];
}

export interface TrackingEvent {
  status: string;
  description: string;
  timestamp: string;
  location?: string;
}

export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

// API Types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Navigation Types
export type RootStackParamList = {
  '(auth)': undefined;
  '(tabs)': undefined;
  modal: { screen: string; params?: any };
};

export type AuthStackParamList = {
  login: undefined;
  register: undefined;
  'forgot-password': undefined;
};

export type TabParamList = {
  index: undefined;
  chat: undefined;
  wishlist: undefined;
  orders: undefined;
  profile: undefined;
};

// Theme Types
export interface Theme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    warning: string;
    success: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  typography: {
    h1: TextStyle;
    h2: TextStyle;
    h3: TextStyle;
    body: TextStyle;
    caption: TextStyle;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}

// Error Types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

// Helper function to create AppError
export function createAppError(code: string, message: string, details?: any): AppError {
  return {
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
}

// Notification Types
export interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'price_alert' | 'order_update' | 'general';
  data?: any;
  read: boolean;
  createdAt: string;
}

// Media Types
export interface MediaFile {
  uri: string;
  type: 'image' | 'audio' | 'video';
  name: string;
  size: number;
  mimeType: string;
}

// Import React Native types
import { TextStyle } from 'react-native';
