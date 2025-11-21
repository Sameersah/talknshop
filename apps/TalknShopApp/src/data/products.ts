export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  reviewCount: number;
  brand: string;
  category: string;
  inStock: boolean;
  fastDelivery: boolean;
  discount?: number;
  source: 'amazon' | 'walmart' | 'target' | 'seller';
  url?: string;
}

export const dummyProducts: Product[] = [
  {
    id: '1',
    name: 'Apple AirPods Pro (2nd Generation)',
    description: 'Active Noise Cancellation, Adaptive Transparency, Spatial Audio, MagSafe Charging Case',
    price: 249.99,
    originalPrice: 279.99,
    image: 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=400',
    rating: 4.7,
    reviewCount: 45230,
    brand: 'Apple',
    category: 'Electronics',
    inStock: true,
    fastDelivery: true,
    discount: 11,
    source: 'amazon',
  },
  {
    id: '2',
    name: 'Samsung 55" QLED 4K Smart TV',
    description: 'Quantum Dot Technology, HDR10+, Alexa Built-in, Gaming Mode',
    price: 699.99,
    originalPrice: 899.99,
    image: 'https://images.unsplash.com/photo-1593359677879-a4b92a0a07c2?w=400',
    rating: 4.6,
    reviewCount: 12890,
    brand: 'Samsung',
    category: 'Electronics',
    inStock: true,
    fastDelivery: true,
    discount: 22,
    source: 'walmart',
  },
  {
    id: '3',
    name: 'Nike Air Max 270 Running Shoes',
    description: 'Men\'s Athletic Running Shoes, Comfortable Cushioning, Breathable Mesh',
    price: 129.99,
    originalPrice: 150.00,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
    rating: 4.5,
    reviewCount: 8765,
    brand: 'Nike',
    category: 'Fashion',
    inStock: true,
    fastDelivery: true,
    discount: 13,
    source: 'amazon',
  },
  {
    id: '4',
    name: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker',
    description: '7-in-1 Multi-Use Programmable Pressure Cooker, Slow Cooker, Rice Cooker',
    price: 89.99,
    originalPrice: 119.99,
    image: 'https://images.unsplash.com/photo-1556910096-6f5e72db6803?w=400',
    rating: 4.8,
    reviewCount: 23456,
    brand: 'Instant Pot',
    category: 'Home & Kitchen',
    inStock: true,
    fastDelivery: true,
    discount: 25,
    source: 'amazon',
  },
  {
    id: '5',
    name: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
    description: 'Industry-leading noise canceling with Dual Noise Sensor technology',
    price: 399.99,
    originalPrice: 449.99,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
    rating: 4.9,
    reviewCount: 15678,
    brand: 'Sony',
    category: 'Electronics',
    inStock: true,
    fastDelivery: true,
    discount: 11,
    source: 'walmart',
  },
  {
    id: '6',
    name: 'Dyson V15 Detect Cordless Vacuum Cleaner',
    description: 'Laser technology reveals microscopic dust, Powerful suction',
    price: 749.99,
    originalPrice: 849.99,
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
    rating: 4.7,
    reviewCount: 9876,
    brand: 'Dyson',
    category: 'Home & Kitchen',
    inStock: true,
    fastDelivery: false,
    discount: 12,
    source: 'amazon',
  },
  {
    id: '7',
    name: 'Levi\'s 511 Slim Fit Jeans',
    description: 'Men\'s Classic Fit Jeans, Stretch Denim, Multiple Washes Available',
    price: 59.99,
    originalPrice: 69.99,
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400',
    rating: 4.4,
    reviewCount: 12345,
    brand: 'Levi\'s',
    category: 'Fashion',
    inStock: true,
    fastDelivery: true,
    discount: 14,
    source: 'walmart',
  },
  {
    id: '8',
    name: 'KitchenAid Stand Mixer 5.5 Qt',
    description: 'Artisan Series, 10 Speeds, Multiple Attachments Included',
    price: 379.99,
    originalPrice: 449.99,
    image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=400',
    rating: 4.8,
    reviewCount: 18923,
    brand: 'KitchenAid',
    category: 'Home & Kitchen',
    inStock: true,
    fastDelivery: true,
    discount: 16,
    source: 'amazon',
  },
  {
    id: '9',
    name: 'Canon EOS R6 Mark II Mirrorless Camera',
    description: '24.2MP Full-Frame CMOS Sensor, 4K Video Recording, Image Stabilization',
    price: 2499.99,
    originalPrice: 2799.99,
    image: 'https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=400',
    rating: 4.9,
    reviewCount: 3456,
    brand: 'Canon',
    category: 'Electronics',
    inStock: true,
    fastDelivery: false,
    discount: 11,
    source: 'amazon',
  },
  {
    id: '10',
    name: 'Adidas Ultraboost 22 Running Shoes',
    description: 'Men\'s Primeknit Upper, Boost Midsole, Continental Rubber Outsole',
    price: 179.99,
    originalPrice: 200.00,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
    rating: 4.6,
    reviewCount: 11234,
    brand: 'Adidas',
    category: 'Fashion',
    inStock: true,
    fastDelivery: true,
    discount: 10,
    source: 'walmart',
  },
  {
    id: '11',
    name: 'iPhone 15 Pro Max 256GB',
    description: 'Titanium Design, A17 Pro Chip, Action Button, 48MP Camera System',
    price: 1199.99,
    originalPrice: 1299.99,
    image: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
    rating: 4.8,
    reviewCount: 45678,
    brand: 'Apple',
    category: 'Electronics',
    inStock: true,
    fastDelivery: true,
    discount: 8,
    source: 'amazon',
  },
  {
    id: '12',
    name: 'Nespresso Vertuo Next Coffee Machine',
    description: 'Single-Serve Coffee Maker, 5 Cup Sizes, Milk Frother Included',
    price: 199.99,
    originalPrice: 249.99,
    image: 'https://images.unsplash.com/photo-1517668808823-f6c0ffc84d0e?w=400',
    rating: 4.5,
    reviewCount: 9876,
    brand: 'Nespresso',
    category: 'Home & Kitchen',
    inStock: true,
    fastDelivery: true,
    discount: 20,
    source: 'walmart',
  },
];

export const getFeaturedProducts = (): Product[] => {
  return dummyProducts.slice(0, 6);
};

export const getProductsByCategory = (category: string): Product[] => {
  return dummyProducts.filter(p => p.category.toLowerCase() === category.toLowerCase());
};

export const searchProducts = (query: string): Product[] => {
  const lowerQuery = query.toLowerCase();
  return dummyProducts.filter(
    p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.brand.toLowerCase().includes(lowerQuery) ||
      p.category.toLowerCase().includes(lowerQuery)
  );
};

export const getProductById = (id: string): Product | undefined => {
  return dummyProducts.find(p => p.id === id);
};

