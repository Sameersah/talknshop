import { ConfigContext, ExpoConfig } from 'expo/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// __dirname = apps/TalknShopApp (where this file lives). Load env in merge order:
// 1) monorepo root .env  2) apps/TalknShopApp/.env  3) process.cwd()/.env (later overrides earlier)
const appDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
const monorepoRootEnv = path.resolve(appDir, '../../.env');
const appEnv = path.resolve(appDir, '.env');
const cwdEnv = path.resolve(process.cwd(), '.env');

const loadedEnvFiles: string[] = [];
if (fs.existsSync(monorepoRootEnv)) {
  dotenv.config({ path: monorepoRootEnv });
  loadedEnvFiles.push(monorepoRootEnv);
}
if (fs.existsSync(appEnv)) {
  dotenv.config({ path: appEnv, override: true });
  loadedEnvFiles.push(`${appEnv} (overrides)`);
}
if (fs.existsSync(cwdEnv) && cwdEnv !== appEnv) {
  dotenv.config({ path: cwdEnv, override: true });
  loadedEnvFiles.push(`${cwdEnv} (overrides)`);
}

if (loadedEnvFiles.length > 0) {
  console.log(`✅ Loaded env: ${loadedEnvFiles.join(' → ')}`);
} else {
  console.warn(
    `⚠️  No .env found. Create one: cp apps/TalknShopApp/env.example apps/TalknShopApp/.env ` +
      `(and set EXPO_PUBLIC_COGNITO_DOMAIN, etc.), or add talknshop/.env at monorepo root.`
  );
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
