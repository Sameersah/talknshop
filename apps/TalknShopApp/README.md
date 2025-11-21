# TalknShopApp - React Native + Expo

A cross-platform React Native application for the TalknShop platform, providing users with an intuitive interface to search, discover, and purchase products through conversational interactions on both iOS and Android.

## Overview

TalknShopApp is the mobile client for the TalknShop ecosystem, enabling users to:
- **Voice Search**: Use natural language to search for products
- **Image Search**: Upload photos to find similar products
- **Conversational Shopping**: Chat with AI to refine product searches
- **Product Discovery**: Browse and compare products across multiple retailers
- **Purchase Management**: Track orders and manage shopping lists
- **Price Alerts**: Set up notifications for price drops

## Features

### Core Functionality
- **Multi-Modal Search**: Voice, text, and image-based product search
- **Real-Time Chat**: Conversational interface with AI assistant
- **Product Comparison**: Side-by-side product comparisons
- **Wishlist Management**: Save and organize favorite products
- **Order Tracking**: Monitor purchase history and order status
- **Push Notifications**: Price alerts and order updates

### User Experience
- **Cross-Platform**: Native iOS and Android support
- **Intuitive Navigation**: Clean, modern interface with Expo Router
- **Accessibility**: Full VoiceOver/TalkBack support and accessibility features
- **Offline Support**: Basic functionality when offline
- **Dark Mode**: System-aware dark mode support
- **Biometric Authentication**: Touch ID and Face ID integration

## Architecture

```
Mobile App (iOS/Android) → API Gateway → Orchestrator Service
                        → Media Service (image/audio processing)
                        → Catalog Service (product search)
```

## Prerequisites

### Development Environment
- **Node.js**: Version 18.0 or later
- **Expo CLI**: Latest version
- **EAS CLI**: For builds and deployments
- **Git**: Version control

### Mobile Requirements
- **iOS**: iOS 13.0 or later
- **Android**: API level 21 (Android 5.0) or later
- **Device**: iPhone 8+ or Android device with 2GB+ RAM

## Installation

### Initial Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd talknshop/apps/TalknShopApp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Setup EAS (for builds)**:
   ```bash
   npx eas login
   npx eas init
   ```

### Environment Variables

```bash
# API Configuration
API_BASE_URL=https://api.talknshop.com
API_VERSION=v1

# Authentication
COGNITO_DOMAIN=talknshop.auth.us-east-1.amazoncognito.com
USER_POOL_ID=us-east-1_xxxxxxxxx
APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
REDIRECT_SCHEME=talknshop
REDIRECT_URI=talknshop://auth

# Features
ENABLE_VOICE_SEARCH=true
ENABLE_IMAGE_SEARCH=true
ENABLE_PUSH_NOTIFICATIONS=true

# Analytics
ANALYTICS_ENABLED=true
ANALYTICS_KEY=your_analytics_key

# Debug
DEBUG_MODE=false
LOG_LEVEL=info
```

## Development

### Running the App

1. **Start development server**:
   ```bash
   npx expo start
   ```

2. **Run on iOS Simulator**:
   ```bash
   npx expo start --ios
   ```

3. **Run on Android Emulator**:
   ```bash
   npx expo start --android
   ```

4. **Run on Physical Device**:
   - Install Expo Go from App Store/Google Play
   - Scan QR code from terminal

### Development Tools

- **Expo Dev Tools**: Debug network requests, logs, and performance
- **React Native Debugger**: Advanced debugging capabilities
- **Flipper**: Network inspection and layout debugging
- **EAS Build**: Cloud builds for testing

## Project Structure

```
TalknShopApp/
├── app/                    # Expo Router routes
│   ├── _layout.tsx        # Root layout with providers
│   ├── (auth)/            # Authentication stack
│   ├── (tabs)/            # Main app tabs
│   └── modal.tsx          # Modal screens
├── src/
│   ├── components/        # Reusable UI components
│   ├── screens/           # Screen containers
│   ├── navigation/        # Navigation helpers
│   ├── services/          # API clients, auth, uploads
│   ├── store/             # Redux Toolkit slices
│   ├── hooks/             # Custom React hooks
│   ├── utils/             # Utility functions
│   ├── constants/         # App constants and config
│   ├── types/             # TypeScript type definitions
│   └── assets/            # Images, fonts, etc.
├── tests/                 # Unit/integration tests
├── e2e/                   # Maestro E2E tests
├── app.config.ts          # Expo configuration
├── eas.json               # EAS Build configuration
└── package.json           # Dependencies and scripts
```

## Key Components

### Navigation
- **Expo Router**: File-based routing system
- **Stack Navigator**: Modal and overlay screens
- **Tab Navigator**: Bottom tab navigation

### State Management
- **Redux Toolkit**: Global state management
- **React Query**: Server state management
- **Redux Persist**: State persistence
- **AsyncStorage**: Local data storage

### UI Components
- **React Native Elements**: Base UI components
- **React Native Vector Icons**: Icon library
- **React Native Reanimated**: Smooth animations
- **React Native Gesture Handler**: Touch interactions
- **FlashList**: High-performance lists

## API Integration

### Authentication
- **AWS Cognito**: Hosted UI + PKCE flow
- **JWT Tokens**: Secure session management
- **Biometric Auth**: Touch ID/Face ID integration
- **SecureStore**: Credential storage

### Core APIs
- **Search API**: Product search and discovery
- **Media API**: Image and audio processing
- **User API**: User profile and preferences
- **Order API**: Purchase history and tracking
- **Chat API**: Real-time messaging

## Testing

### Unit Tests
```bash
npm test
# or
npm run test:watch
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e
```

### Testing Tools
- **Jest**: Unit testing framework
- **React Native Testing Library**: Component testing
- **Maestro**: End-to-end testing
- **Expo Dev Tools**: Debugging and testing

## Building and Deployment

### Development Build
```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

### Preview Build
```bash
npx eas build --profile preview --platform all
```

### Production Build
```bash
npx eas build --profile production --platform all
```

### App Store Deployment
```bash
npx eas submit --platform ios
npx eas submit --platform android
```

## Performance Optimization

### Bundle Optimization
- **Code Splitting**: Lazy load screens and components
- **Tree Shaking**: Remove unused code
- **Image Optimization**: Compress and optimize images
- **Hermes Engine**: Improved JavaScript performance

### Runtime Performance
- **FlashList**: Efficient list rendering
- **Memoization**: Prevent unnecessary re-renders
- **Background Processing**: Offload heavy operations
- **Memory Management**: Optimize memory usage

## Security

### Data Protection
- **SecureStore**: Secure credential storage
- **JWT Tokens**: Secure authentication
- **Certificate Pinning**: Secure API communication (Dev Client)
- **Data Encryption**: Encrypt sensitive data

### Privacy
- **Permission Management**: Request only necessary permissions
- **Data Minimization**: Collect only required data
- **User Consent**: Clear privacy policies
- **GDPR Compliance**: Data protection compliance

## Accessibility

### VoiceOver/TalkBack Support
- **Screen Reader**: Full compatibility
- **Accessibility Labels**: Descriptive labels for UI elements
- **Navigation**: Keyboard navigation support
- **Focus Management**: Proper focus order

### Visual Accessibility
- **Dynamic Type**: Support for larger text sizes
- **High Contrast**: High contrast mode support
- **Color Blindness**: Color-blind friendly design
- **Reduced Motion**: Respect user preferences

## Analytics and Monitoring

### User Analytics
- **User Behavior**: Track user interactions
- **Feature Usage**: Monitor feature adoption
- **Performance Metrics**: App performance monitoring
- **Crash Reporting**: Error tracking and analysis

### Monitoring Tools
- **Sentry**: Crash reporting and performance monitoring
- **Expo Analytics**: Built-in analytics
- **Custom Analytics**: Amplitude/Segment integration

## Contributing

### Development Workflow
1. **Create feature branch**
2. **Implement changes**
3. **Add tests**
4. **Update documentation**
5. **Submit pull request**

### Code Standards
- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **TypeScript**: Type safety
- **Conventional Commits**: Commit message format
- **Husky**: Pre-commit hooks

## Troubleshooting

### Common Issues

1. **Metro bundler issues**:
   ```bash
   npx expo start --clear
   ```

2. **Dependencies issues**:
   ```bash
   rm -rf node_modules && npm install
   ```

3. **EAS build issues**:
   ```bash
   npx eas build --clear-cache
   ```

4. **iOS simulator issues**:
   ```bash
   npx expo run:ios --clear
   ```

### Debug Mode
```bash
# Enable debug logging
export DEBUG_MODE=true
export LOG_LEVEL=debug
npx expo start
```

## Migration from React Native CLI

This app has been migrated from React Native CLI to Expo managed workflow. See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed migration information.

## License

This project is part of the TalknShop application.

## Support

For technical support and questions:
- **Documentation**: Check the main project documentation
- **Issues**: Report bugs and feature requests
- **Community**: Join our developer community
- **Expo Docs**: https://docs.expo.dev/