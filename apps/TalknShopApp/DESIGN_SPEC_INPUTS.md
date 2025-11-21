# Design Spec & Log Book Inputs

## Scope Blurb

**Frontend Ownership**: Complete React Native + Expo mobile application (iOS & Android) with conversational AI shopping interface. Implemented buyer search flow with text/voice/image search capabilities, comprehensive seller product listing flow with minimal friction design (3-tap listing), dark theme UI, Redux state management, and AWS Cognito authentication integration (Hosted UI + PKCE). Currently using Expo SDK 54 with React 19 and React Native 0.81.5.

**Seller Flow**: Fully implemented seller product listing system with category selection (8 categories), multi-image upload (camera/gallery), optional product details form with smart defaults, and streamlined submission process. All fields except category and photo are optional with intelligent auto-generation.

## Seller Rules

### Photo Constraints
- **Max photos**: 5 per listing
- **Max size per image**: 10 MB
- **Allowed types**: JPG, PNG, HEIC
- **Compression target**: 1440px width @ 80% quality (currently using Expo ImagePicker quality: 0.8, aspect: [4, 3])

### Optional Fields Limits
- **Name**: ≤120 characters (currently no enforced limit, but recommended)
- **Brand**: ≤60 characters (currently no enforced limit, but recommended)
- **Description**: ≤2000 characters (currently no enforced limit, but recommended)
- **Price**: USD currency, 0–999,999 range, 2 decimal places (currently accepts any decimal)
- **Quantity**: 1–999 range (currently accepts any positive integer)

### Condition Values
- **Default**: "new"
- **Options**: 
  - `new` - "Brand new, never used"
  - `like-new` - "Used but looks new"
  - `good` - "Used, minor wear"
  - `fair` - "Used, visible wear"

## API Shapes

### POST /media/presign
**Request:**
```json
{
  "fileName": "product-image.jpg",
  "contentType": "image/jpeg",
  "fileSize": 2048576
}
```

**Response:**
```json
{
  "uploadUrl": "https://talknshop-media.s3.amazonaws.com/listings/user123/uuid-here.jpg?X-Amz-Algorithm=...",
  "key": "listings/user123/uuid-here.jpg",
  "expiresIn": 600
}
```

**Error Response:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "File size exceeds maximum allowed size",
    "type": "USER"
  }
}
```

### POST /seller/listings
**Request Payload:**
```json
{
  "category": "electronics",
  "name": "iPhone 13 Pro",
  "brand": "Apple",
  "description": "128GB, Space Gray, excellent condition",
  "price": 699.99,
  "quantity": 1,
  "condition": "like-new",
  "images": [
    "listings/user123/uuid1.jpg",
    "listings/user123/uuid2.jpg"
  ],
  "inStock": true,
  "fastDelivery": false
}
```

**Success Response:**
```json
{
  "id": "listing-12345",
  "status": "active",
  "createdAt": "2024-11-20T12:00:00Z",
  "product": {
    "id": "listing-12345",
    "name": "iPhone 13 Pro",
    "price": 699.99,
    "images": ["https://...", "https://..."],
    "category": "electronics"
  }
}
```

**Error Response:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Category is required",
    "type": "USER",
    "fields": ["category"]
  }
}
```

**Error Codes:**
- `VALIDATION_ERROR` - Invalid input data
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `SERVER_ERROR` - Internal server error

## S3 Details

- **Bucket Name**: `talknshop-media` (placeholder - to be configured)
- **Region**: `us-east-1` (placeholder - to be configured)
- **Key Prefix Convention**: `listings/{userId}/{uuid}.{ext}`
  - Example: `listings/user-abc123/550e8400-e29b-41d4-a716-446655440000.jpg`
- **Metadata Headers**:
  - `x-amz-meta-user-id`: User ID
  - `x-amz-meta-listing-id`: Listing ID (if available)
  - `x-amz-meta-image-index`: Image order (0, 1, 2, etc.)
- **Presigned URL Expiry**: 600 seconds (10 minutes)
- **CORS Configuration**: Allow PUT requests from app domains
- **Content-Type**: Preserved from upload request

## Auth Details (AWS Cognito)

### Configuration (Placeholder Values - To Be Configured)
- **Domain**: `talknshop.auth.us-east-1.amazoncognito.com`
- **User Pool ID**: `us-east-1_xxxxxxxxx`
- **App Client ID**: `xxxxxxxxxxxxxxxxxxxxxxxxxx`
- **App Client Secret**: None (using PKCE flow)

### Redirect Schemes
- **iOS**: `talknshop://auth`
- **Android**: `talknshop://auth`
- **Universal Links**: `https://talknshop.com/auth` (for production OAuth)

### Token Lifetimes (Desired)
- **Access Token**: 1 hour (3600 seconds)
- **Refresh Token**: 30 days (2592000 seconds)
- **ID Token**: 1 hour (3600 seconds)

### Scopes
- `openid`
- `email`
- `profile`
- `aws.cognito.signin.user.admin`

## Environments

### Development
- **API Base URL**: `http://localhost:8000`
- **API Version**: `v1`
- **Cognito Domain**: `talknshop-dev.auth.us-east-1.amazoncognito.com`
- **Use for**: Local development, testing

### Staging
- **API Base URL**: `https://api-staging.talknshop.com`
- **API Version**: `v1`
- **Cognito Domain**: `talknshop-staging.auth.us-east-1.amazoncognito.com`
- **Use for**: Pre-production testing, QA

### Production
- **API Base URL**: `https://api.talknshop.com`
- **API Version**: `v1`
- **Cognito Domain**: `talknshop.auth.us-east-1.amazoncognito.com`
- **Use for**: Production deployment

**Documentation Target**: Use **Staging** environment for screenshots and documentation (most representative of production without affecting real users).

## Analytics

### Provider
- **Primary**: Amplitude (placeholder key: `xxxxxxxxxxxxxxxxxxxxxxxxxx`)
- **Fallback**: Segment (if needed for multi-platform)

### Key Events (Beyond Standard)
- `sell_screen_viewed` - Seller screen opened
- `sell_category_selected` - Category selected
- `sell_photo_added` - Photo added (camera/gallery)
- `sell_photo_removed` - Photo removed
- `sell_form_field_filled` - Optional field filled
- `sell_submit_attempted` - Submit button pressed
- `sell_submit_success` - Listing created successfully
- `sell_submit_error` - Submission failed
- `sell_form_abandoned` - User left without submitting
- `search_query_entered` - Text search query
- `search_suggestion_tapped` - Quick suggestion selected
- `search_voice_initiated` - Voice search started
- `search_image_initiated` - Image search started
- `product_viewed` - Product card tapped
- `product_comparison_started` - Comparison initiated

### Event Properties
- `category` - Product category
- `photo_count` - Number of photos added
- `form_completion_percentage` - How much of form was filled
- `error_code` - Error code if submission failed
- `search_query` - Search query text
- `product_id` - Product identifier
- `product_source` - amazon/walmart/seller

## Quality Bars

### Target OS Versions
- **iOS**: 15.0+ (supports ~95% of active devices)
- **Android**: API Level 29+ (Android 10+, supports ~90% of active devices)

### Performance Targets
- **Time to Interactive (TTI)**: <2.5 seconds
- **First Contentful Paint**: <1.5 seconds
- **Upload Progress Feedback**: ≤150ms latency
- **Image Load Time**: <1 second per image
- **Search Response Time**: <500ms
- **Form Submission**: <2 seconds

### Accessibility Target
- **WCAG 2.1 Level AA** compliance
- **VoiceOver/TalkBack** support
- **Dynamic Type** support (iOS)
- **Color Contrast**: Minimum 4.5:1 for text
- **Touch Targets**: Minimum 44x44 points
- **Focus Indicators**: Visible focus states

## Copy & Branding

### Empty States
- **No Search Results**: "No products found. Try adjusting your search or browse our suggestions above!"
- **No Featured Products**: "Start searching to find products. Ask me anything or try the suggestions above!"
- **No Seller Listings**: "You haven't listed any products yet. Tap the button below to get started!"

### Error States
- **Network Error**: "Unable to connect. Please check your internet connection and try again."
- **Validation Error**: "Please check your input and try again."
- **Server Error**: "Something went wrong. Please try again in a moment."
- **Permission Denied**: "Permission required. Please enable [permission] in Settings to continue."

### Brand Colors (Dark Theme)
- **Primary**: #007AFF (iOS Blue)
- **Secondary**: #5856D6 (iOS Purple)
- **Background**: #000000 (Pure Black)
- **Surface**: #1C1C1E (iOS Dark Gray)
- **Text**: #FFFFFF (Pure White)
- **Text Secondary**: #98989D (Light Gray)
- **Success**: #34C759 (iOS Green)
- **Error**: #FF3B30 (iOS Red)
- **Warning**: #FF9500 (iOS Orange)

### Typography
- **H1**: 32px, Bold
- **H2**: 24px, Bold
- **H3**: 20px, Semi-Bold (600)
- **Body**: 16px, Regular
- **Caption**: 12px, Regular

## Artifacts

### Mockups/Screenshots
- Search Screen (Buyer Flow) - AI Assistant, search input, suggestions
- Seller Screen - Category selection, photo upload, form
- Product Cards - Product display with ratings, prices, badges
- Tab Navigation - Bottom navigation bar

### Architecture
- Project structure diagram
- Component hierarchy
- State management flow (Redux)
- Navigation structure (Expo Router)

---

# Log Book Inputs

## Date Range
**Project Duration**: November 2024 (Weeks 1-4)

## Week 1: Project Setup & Migration
**Hours**: ~20 hours

**Tasks Completed**:
- Converted existing project to React Native + Expo managed workflow
- Set up Expo Router for file-based navigation
- Configured Redux Toolkit with Redux Persist
- Integrated React Query (TanStack Query) for server state
- Set up TypeScript throughout project
- Configured ESLint and Prettier
- Created project structure and folder organization
- Set up Expo configuration (app.config.ts)
- Configured Babel with module resolver

**Decisions Made**:
- Chose Expo Managed workflow over Dev Client (simpler, faster development)
- Selected Redux Toolkit over Context API (better for complex state)
- Used Expo Router over React Navigation directly (file-based routing)
- Decided on TypeScript for type safety

**Demos/Artifacts**:
- Initial project structure
- Basic navigation working
- Redux store configured

**Blocked By/Risks**:
- None significant

**Next Week Plan**:
- Upgrade Expo SDK
- Implement theme system
- Build search screen UI

---

## Week 2: SDK Upgrade & Theme Implementation
**Hours**: ~15 hours

**Tasks Completed**:
- Upgraded Expo SDK from 50.0.0 to 54.0.0
- Updated React from 18.2.0 to 19.1.0
- Updated React Native from 0.73.6 to 0.81.5
- Updated 30+ Expo packages to SDK 54 compatible versions
- Fixed react-native-worklets dependency for Reanimated 4.x
- Resolved package version conflicts
- Implemented comprehensive theme system
- Created dark theme as default
- Built ThemeProvider with Redux integration
- Created useTheme hook

**Decisions Made**:
- Upgraded to latest SDK for better features and performance
- Chose dark theme as default (modern, better UX)
- Used Redux for theme state (consistent with app architecture)
- Followed iOS/Material Design color standards

**Demos/Artifacts**:
- SDK 54 upgrade complete
- Dark theme working throughout app
- Theme switching capability

**Blocked By/Risks**:
- Package version conflicts resolved with --legacy-peer-deps
- react-native-worklets missing - installed separately

**Next Week Plan**:
- Build buyer search screen
- Implement product display
- Add dummy product data

---

## Week 3: Buyer Search Screen & Product Display
**Hours**: ~25 hours

**Tasks Completed**:
- Designed and implemented conversational AI search interface
- Created AI assistant card with avatar and message bubble
- Built search input with chat-style UI
- Implemented quick suggestion chips (6 suggestions)
- Added conversation starter cards (4 examples)
- Created ProductCard component with full product details
- Implemented product search functionality
- Added dummy product data (12 products)
- Built real-time search as user types
- Created product detail modal
- Implemented featured products display
- Added search results filtering
- Fixed white strip above tab bar
- Improved safe area handling

**Decisions Made**:
- Chose conversational UI over traditional search (aligns with AI shopping concept)
- Used FlatList for efficient product rendering
- Implemented auto-search for better UX
- Created comprehensive product data structure

**Demos/Artifacts**:
- Search screen with AI assistant
- Product cards displaying
- Search functionality working
- Screenshots of buyer flow

**Blocked By/Risks**:
- White strip issue - resolved with safe area insets
- None other

**Next Week Plan**:
- Build seller screen
- Implement product listing flow
- Add image upload functionality

---

## Week 4: Seller Flow Implementation
**Hours**: ~30 hours

**Tasks Completed**:
- Designed minimal-friction seller flow (3-tap listing)
- Implemented category selection (8 categories with icons)
- Built multi-image upload (camera + gallery)
- Created product details form (all optional)
- Implemented smart defaults and auto-generation
- Added form validation (only category + photo required)
- Built quick submit button
- Created seller products data structure
- Integrated seller products with search
- Fixed notification subscription cleanup
- Resolved push token errors
- Increased top padding on seller screen
- Fixed tab bar styling

**Decisions Made**:
- Minimal required fields (category + photo only) for speed
- Smart defaults for all optional fields
- Auto-generation of name/description if empty
- Card-based category selection for better UX
- Multiple image support (up to 5)

**Demos/Artifacts**:
- Seller screen fully functional
- Product listing working
- Images uploading successfully
- Screenshots of seller flow

**Blocked By/Risks**:
- Push notification errors - resolved with graceful error handling
- Notification subscription cleanup - fixed API usage
- None other

**Next Week Plan**:
- Backend API integration
- Real image upload to S3
- User authentication flow
- Chat functionality

---

## Summary

### Current Status
**Completed**:
- ✅ Complete React Native + Expo app structure
- ✅ Expo SDK 54 upgrade
- ✅ Dark theme system
- ✅ Buyer search screen with conversational AI interface
- ✅ Product display and search functionality
- ✅ Seller product listing flow (minimal friction)
- ✅ Image upload (camera/gallery)
- ✅ Redux state management
- ✅ React Query integration
- ✅ Navigation structure
- ✅ Error handling
- ✅ Safe area handling

**In Progress**:
- 🔄 Backend API integration (ready but not connected)
- 🔄 User authentication (Cognito configured but not fully integrated)
- 🔄 Real image upload to S3 (UI ready, backend pending)

**Remaining Work**:
- Backend API endpoints implementation
- S3 presigned URL generation
- AWS Cognito authentication flow
- Chat functionality
- Wishlist functionality
- Order management
- Push notifications backend
- Analytics integration
- Performance optimization
- Accessibility improvements
- Testing (unit, integration, E2E)

### Lessons Learned
1. **Expo SDK upgrades require careful dependency management** - Use `expo install --fix` and `--legacy-peer-deps` when needed
2. **Minimal friction design works** - Seller flow with only 2 required fields significantly improves UX
3. **Smart defaults are crucial** - Auto-generation prevents empty/incomplete listings
4. **Safe area handling is essential** - Proper insets prevent UI issues on different devices
5. **Error handling should be graceful** - Silent failures for optional features (like push notifications) improve UX
6. **TypeScript catches errors early** - Strong typing prevents runtime issues
7. **File-based routing simplifies navigation** - Expo Router makes navigation intuitive

### Technical Debt
- Push notifications require valid EAS projectId (currently disabled)
- Image compression not yet implemented (using Expo defaults)
- Form validation limits not enforced (recommended limits documented)
- Backend API integration pending
- Real authentication flow pending
- Analytics events not yet tracked

### Performance Notes
- FlatList used for efficient product rendering
- Images using Unsplash placeholders (to be replaced with real uploads)
- Lazy loading implemented where possible
- Memoization used for computed values

