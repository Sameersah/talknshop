# 🚀 Quick Start Guide - Running TalknShopApp

## Prerequisites

### 1. **Node.js Installation**
   - **Required**: Node.js version 18.0 or higher
   - **Download**: https://nodejs.org/ (Download LTS version)
   - **Verify Installation**:
     ```bash
     node --version
     npm --version
     ```
   - Should show: `v18.x.x` or higher

### 2. **Expo CLI** (Optional but Recommended)
   - Expo CLI comes with the project, but you can install globally:
     ```bash
     npm install -g expo-cli
     ```

### 3. **Mobile Device or Emulator**
   - **Option A**: Physical device with Expo Go app
     - iOS: Download "Expo Go" from App Store
     - Android: Download "Expo Go" from Google Play Store
   - **Option B**: iOS Simulator (macOS only)
     - Requires Xcode from App Store
   - **Option C**: Android Emulator
     - Requires Android Studio

---

## 📦 Installation Steps

### Step 1: Navigate to Project Directory
```bash
cd "/Users/spartan/Documents/Master Project /talknshop/apps/TalknShopApp"
```

### Step 2: Install Dependencies
```bash
npm install
```

**Expected Output:**
- Dependencies will be installed
- You may see some warnings (these are normal)
- Installation should complete successfully

**If you encounter errors:**
- Make sure Node.js is installed correctly
- Try deleting `node_modules` and `package-lock.json` and run `npm install` again
- Check that you have internet connection

### Step 3: Verify Installation
```bash
# Check if Expo is available
npx expo --version

# Check if all dependencies are installed
npm list --depth=0
```

---

## 🏃 Running the App

### Option 1: Run with Expo Go (Recommended for Development)

#### Step 1: Start the Development Server
```bash
npx expo start
```

**What you'll see:**
```
Starting Metro Bundler
Waiting on http://localhost:8081
Logs for your project will appear below.

› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or Camera (iOS)

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
› Press ? │ show all commands
```

#### Step 2: Connect Your Device

**For iOS:**
1. Open Camera app on your iPhone
2. Scan the QR code from terminal
3. Tap the notification to open in Expo Go

**For Android:**
1. Open Expo Go app
2. Tap "Scan QR code"
3. Scan the QR code from terminal

**For Simulator/Emulator:**
- Press `i` for iOS Simulator (macOS only)
- Press `a` for Android Emulator
- Press `w` for Web browser

### Option 2: Run on Specific Platform

#### iOS Simulator (macOS only)
```bash
npx expo start --ios
```

#### Android Emulator
```bash
npx expo start --android
```

#### Web Browser
```bash
npx expo start --web
```

---

## 🎯 What You'll See

### First Launch
1. **Expo Go** will load the app
2. **Metro Bundler** will compile JavaScript
3. App will display the **Login Screen**

### Available Screens
- ✅ **Login Screen** - Email/password form
- ✅ **Search Screen** - Main search interface (after login)
- ✅ **Chat Screen** - AI chat placeholder
- ✅ **Wishlist Screen** - Saved products placeholder
- ✅ **Orders Screen** - Order history placeholder
- ✅ **Profile Screen** - User profile and settings

---

## 🛠️ Development Commands

### Start Development Server
```bash
npm start
# or
npx expo start
```

### Clear Cache and Start
```bash
npm run start:clear
# or
npx expo start --clear
```

### Run Tests
```bash
npm test
```

### Lint Code
```bash
npm run lint
```

### Format Code
```bash
npm run format
```

### Type Check
```bash
npm run type-check
```

---

## ⚠️ Troubleshooting

### Issue 1: "npm command not found"
**Solution:**
- Install Node.js from https://nodejs.org/
- Restart your terminal after installation
- Verify with: `node --version`

### Issue 2: "Port 8081 already in use"
**Solution:**
```bash
# Kill process on port 8081
lsof -ti:8081 | xargs kill -9

# Or use a different port
npx expo start --port 8082
```

### Issue 3: "Metro bundler failed to start"
**Solution:**
```bash
# Clear cache
npx expo start --clear

# Reset Metro bundler
npm start -- --reset-cache
```

### Issue 4: "Cannot connect to Expo Go"
**Solution:**
- Make sure your device and computer are on the same WiFi network
- Check firewall settings
- Try using tunnel mode:
  ```bash
  npx expo start --tunnel
  ```

### Issue 5: "Module not found" errors
**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules
rm -rf package-lock.json
npm install
```

### Issue 6: "Husky git hooks error"
**Solution:**
- This is expected if git is not initialized
- The app will still work
- To fix (optional):
  ```bash
  git init
  npm install
  ```

### Issue 7: App shows blank screen
**Solution:**
- Check Metro bundler logs for errors
- Reload app: Press `r` in terminal or shake device
- Clear cache: `npx expo start --clear`

---

## 🔧 Environment Setup (Optional)

### Create Environment File
```bash
# Copy example environment file
cp env.example .env

# Edit .env with your configuration
# For development, you can leave default values
```

### Configure AWS Cognito (For Authentication)
1. Update `src/constants/config.ts` with your:
   - Cognito Domain
   - User Pool ID
   - App Client ID
   - API Base URL

---

## 📱 Testing on Different Devices

### iOS Device
1. Install Expo Go from App Store
2. Connect to same WiFi as your computer
3. Scan QR code from terminal
4. App will load in Expo Go

### Android Device
1. Install Expo Go from Google Play
2. Connect to same WiFi as your computer
3. Open Expo Go and scan QR code
4. App will load in Expo Go

### iOS Simulator (macOS)
1. Install Xcode from App Store
2. Open Simulator: `open -a Simulator`
3. Run: `npx expo start --ios`
4. App will open in simulator

### Android Emulator
1. Install Android Studio
2. Create an Android Virtual Device (AVD)
3. Start emulator
4. Run: `npx expo start --android`
5. App will open in emulator

---

## 🎨 Hot Reload & Development

### Features Available:
- ✅ **Hot Reload**: Changes reflect immediately
- ✅ **Fast Refresh**: React components update without losing state
- ✅ **Error Overlay**: Errors shown in app
- ✅ **Debug Menu**: Shake device or press `Cmd+D` (iOS) / `Cmd+M` (Android)

### Useful Keyboard Shortcuts:
- `r` - Reload app
- `m` - Toggle menu
- `i` - Open iOS simulator
- `a` - Open Android emulator
- `w` - Open web browser
- `j` - Open debugger
- `?` - Show all commands

---

## 🚀 Next Steps

### After Running the App:
1. **Test Navigation**: Try navigating between tabs
2. **Test Login**: Try the login form (will show error without backend)
3. **Explore UI**: Check all screens and components
4. **Check Theme**: Toggle dark/light mode (if implemented)

### To Add Backend Integration:
1. Set up backend APIs
2. Update `src/constants/config.ts` with API URLs
3. Implement API calls in services
4. Connect to AWS Cognito for authentication

### To Build for Production:
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

---

## 📚 Additional Resources

- **Expo Documentation**: https://docs.expo.dev/
- **React Native Documentation**: https://reactnative.dev/
- **Expo Router Documentation**: https://docs.expo.dev/router/introduction/
- **Redux Toolkit**: https://redux-toolkit.js.org/
- **React Query**: https://tanstack.com/query/latest

---

## ✅ Quick Checklist

Before running:
- [ ] Node.js installed (v18+)
- [ ] Navigated to project directory
- [ ] Ran `npm install`
- [ ] Expo Go installed on device (or simulator ready)
- [ ] Device and computer on same WiFi

To run:
- [ ] Run `npx expo start`
- [ ] Scan QR code or press `i`/`a` for simulator
- [ ] App should load in Expo Go/simulator

---

## 🎉 Success!

If you see the app running:
- ✅ Login screen is visible
- ✅ You can navigate between tabs
- ✅ UI is responsive and styled
- ✅ No errors in terminal

**You're ready to start developing!** 🚀

