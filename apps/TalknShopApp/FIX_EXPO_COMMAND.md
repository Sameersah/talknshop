# Fix: "Unknown command: expo" Error

## ✅ Solution

Expo CLI is installed locally in the project. Use one of these methods:

### **Method 1: Use npm scripts (Recommended)**
```bash
npm start
```
This uses the script defined in `package.json` and will work correctly.

### **Method 2: Use npx**
```bash
npx expo start
```
This will use the locally installed Expo CLI from `node_modules`.

### **Method 3: Use full path**
```bash
./node_modules/.bin/expo start
```
This directly calls the Expo binary.

---

## ❌ What NOT to do

**Don't run:**
```bash
expo start  # This won't work unless Expo is installed globally
```

**Why it fails:**
- `expo` command is only available globally if you install it with `npm install -g expo-cli`
- Our project uses local Expo CLI from `node_modules`
- You need to use `npx` or `npm start` to access it

---

## 🚀 Quick Start Commands

### Start Development Server
```bash
# Option 1: Use npm (easiest)
npm start

# Option 2: Use npx
npx expo start

# Option 3: With cache cleared
npm run start:clear
```

### Start on Specific Platform
```bash
# iOS
npm run ios
# or
npx expo start --ios

# Android
npm run android
# or
npx expo start --android

# Web
npm run web
# or
npx expo start --web
```

---

## 📋 All Available npm Scripts

```bash
npm start          # Start Expo dev server
npm run ios        # Start on iOS simulator
npm run android    # Start on Android emulator
npm run web        # Start on web browser
npm run start:clear # Start with cache cleared
npm test           # Run tests
npm run lint       # Lint code
npm run format     # Format code
npm run type-check # TypeScript type checking
```

---

## 🔧 If You Still Get Errors

### Check if dependencies are installed:
```bash
cd "/Users/spartan/Documents/Master Project /talknshop/apps/TalknShopApp"
npm install
```

### Verify Expo is installed:
```bash
ls node_modules/.bin/expo
```
Should show: `node_modules/.bin/expo -> ../expo/bin/cli`

### Clear cache and reinstall:
```bash
rm -rf node_modules
rm -rf package-lock.json
npm install
```

---

## ✅ Success!

When you run `npm start`, you should see:
```
Starting Metro Bundler
Waiting on http://localhost:8081
Logs for your project will appear below.

› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go
```

**Then you can:**
- Scan QR code with Expo Go app
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `w` for web browser

