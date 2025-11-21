import { ConfigContext, ExpoConfig } from 'expo/config';

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
    // eas: {
    //   projectId: 'your-eas-project-id', // Set this when you create an EAS project
    // },
  },
  scheme: 'talknshop',
  experiments: {
    typedRoutes: true,
  },
});
