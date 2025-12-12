import { ConfigContext, ExpoConfig } from 'expo/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env file from project root
// Try multiple possible paths since __dirname might not work in all contexts
const possiblePaths = [
  path.resolve(process.cwd(), '.env'), // From project root
  path.resolve(__dirname || process.cwd(), '../../.env'), // Relative to app.config.ts
  path.resolve(process.cwd(), '../../.env'), // Fallback
];

let envPath: string | null = null;
for (const possiblePath of possiblePaths) {
  if (fs.existsSync(possiblePath)) {
    envPath = possiblePath;
    break;
  }
}

if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`✅ Loaded .env from ${envPath}`);
} else {
  console.warn(`⚠️  .env file not found. Tried: ${possiblePaths.join(', ')}`);
  console.warn(`⚠️  Please create .env file at project root from .env.example`);
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'TalknShop',
  slug: 'talknshop-app',
  version: '1.0.0',
  orientation: 'portrait',
  // icon: './assets/icon.png', // TODO: Add app icon
  userInterfaceStyle: 'automatic',
  // splash: {
  //   image: './assets/splash.png',
  //   resizeMode: 'contain',
  //   backgroundColor: '#ffffff',
  // },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.talknshop.app',
    buildNumber: '1',
    infoPlist: {
      NSCameraUsageDescription: 'This app needs access to camera to capture product images for search.',
      NSMicrophoneUsageDescription: 'This app needs access to microphone for voice search functionality.',
      NSPhotoLibraryUsageDescription: 'This app needs access to photo library to select product images.',
      CFBundleURLTypes: [
        {
          CFBundleURLName: 'talknshop-auth',
          CFBundleURLSchemes: ['talknshop'],
        },
      ],
    },
  },
  android: {
    // adaptiveIcon: {
    //   foregroundImage: './src/assets/adaptive-icon.png',
    //   backgroundColor: '#ffffff',
    // },
    package: 'com.talknshop.app',
    versionCode: 1,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        data: [
          {
            scheme: 'talknshop',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    // favicon: './src/assets/favicon.png', // TODO: Add favicon
    bundler: 'metro',
    // Configure web to use localhost for development
    build: {
      babel: {
        include: ['@expo/vector-icons'],
      },
    },
  },
  plugins: [
    'expo-router',
    'expo-font',
    [
      'expo-notifications',
      {
        // icon: './src/assets/notification-icon.png', // TODO: Add notification icon
        color: '#ffffff',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Allow TalknShop to access your camera to capture product images.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow TalknShop to access your photos to select product images.',
      },
    ],
    [
      'expo-av',
      {
        microphonePermission: 'Allow TalknShop to access your microphone for voice search.',
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: 'talknshop',
        project: 'talknshop-mobile',
      },
    ],
  ],
  extra: {
    router: {
      origin: false,
    },
    // Environment variables loaded from root .env file
    // These are accessible via Constants.expoConfig.extra in the app
    // Prefer EXPO_PUBLIC_ prefix, fallback to non-prefixed version
    COGNITO_DOMAIN: process.env.EXPO_PUBLIC_COGNITO_DOMAIN || process.env.COGNITO_DOMAIN,
    COGNITO_USER_POOL_ID: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID || process.env.COGNITO_USER_POOL_ID,
    COGNITO_APP_CLIENT_ID: process.env.EXPO_PUBLIC_COGNITO_APP_CLIENT_ID || process.env.COGNITO_APP_CLIENT_ID,
    SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
    ANALYTICS_KEY: process.env.EXPO_PUBLIC_ANALYTICS_KEY || process.env.ANALYTICS_KEY,
    // eas: {
    //   projectId: 'your-eas-project-id', // Set this when you create an EAS project
    // },
  },
  scheme: 'talknshop',
  experiments: {
    typedRoutes: true,
  },
});
