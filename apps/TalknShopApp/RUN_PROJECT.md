# 🚀 Run TalknShopApp - Quick Steps

## ⚡ Quick Start (3 Steps)

### 1. Install Dependencies
```bash
cd "/Users/spartan/Documents/Master Project /talknshop/apps/TalknShopApp"
npm install
```

### 2. Start the App
```bash
npx expo start
```

### 3. Open on Device
- **Physical Device**: Scan QR code with Expo Go app
- **iOS Simulator**: Press `i` in terminal
- **Android Emulator**: Press `a` in terminal
- **Web Browser**: Press `w` in terminal

---

## 📋 Detailed Steps

### Prerequisites Check
```bash
# Check Node.js version (should be 18+)
node --version

# Check npm version
npm --version
```

### Installation
```bash
# Navigate to project
cd "/Users/spartan/Documents/Master Project /talknshop/apps/TalknShopApp"

# Install all dependencies
npm install

# Wait for installation to complete
```

### Running the App
```bash
# Start Expo development server
npx expo start

# You'll see:
# - QR code in terminal
# - Metro bundler starting
# - Options to open on different platforms
```

### Connecting Your Device

#### Option A: Physical Device (Recommended)
1. Install **Expo Go** app on your phone:
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
2. Make sure your phone and computer are on the same WiFi
3. Scan the QR code from terminal:
   - iOS: Use Camera app
   - Android: Use Expo Go app's scan feature

#### Option B: Simulator/Emulator
- **iOS Simulator** (macOS only):
  ```bash
  npx expo start --ios
  ```
- **Android Emulator**:
  ```bash
  npx expo start --android
  ```
- **Web Browser**:
  ```bash
  npx expo start --web
  ```

---

## 🎯 What You'll See

1. **Metro Bundler** starts and compiles JavaScript
2. **QR Code** appears in terminal
3. **App loads** showing Login Screen
4. **Navigation** works between tabs

---

## 🛠️ Useful Commands

```bash
# Start with cache cleared
npx expo start --clear

# Start on specific platform
npx expo start --ios
npx expo start --android
npx expo start --web

# Run tests
npm test

# Check code quality
npm run lint

# Format code
npm run format
```

---

## ⚠️ Common Issues & Solutions

### Issue: "npm command not found"
**Fix**: Install Node.js from https://nodejs.org/

### Issue: "Port 8081 already in use"
**Fix**: 
```bash
lsof -ti:8081 | xargs kill -9
npx expo start
```

### Issue: "Cannot connect to device"
**Fix**: 
- Ensure same WiFi network
- Try tunnel mode: `npx expo start --tunnel`

### Issue: "Module not found"
**Fix**:
```bash
rm -rf node_modules
npm install
```

---

## ✅ Success Indicators

You'll know it's working when:
- ✅ Metro bundler shows "Metro waiting on..."
- ✅ QR code is displayed
- ✅ App opens in Expo Go/simulator
- ✅ Login screen is visible
- ✅ No errors in terminal

---

## 🎉 You're Ready!

Once the app is running, you can:
- Navigate between tabs
- Test the UI components
- See the theme system
- Check navigation flow

**For backend integration, see the full documentation in QUICK_START.md**

