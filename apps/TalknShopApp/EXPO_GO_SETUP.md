# 📱 Expo Go Setup - Step by Step Guide

## 🎯 Quick Setup (5 Minutes)

### Step 1: Install Expo Go App

#### For iPhone:
1. Open **App Store** on your iPhone
2. Search for **"Expo Go"**
3. Tap **Get** or **Install**
4. Wait for installation to complete

**Download Link:** https://apps.apple.com/app/expo-go/id982107779

#### For Android:
1. Open **Google Play Store** on your Android phone
2. Search for **"Expo Go"**
3. Tap **Install**
4. Wait for installation to complete

**Download Link:** https://play.google.com/store/apps/details?id=host.exp.exponent

---

### Step 2: Start Development Server

```bash
cd "/Users/spartan/Documents/Master Project /talknshop/apps/TalknShopApp"
npm start
```

**What you'll see:**
```
Starting Metro Bundler
Waiting on http://localhost:8081
Logs for your project will appear below.

› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or Camera (iOS)
```

---

### Step 3: Connect Your Phone

#### Option A: Same WiFi Network (Recommended)
1. **Ensure** your phone and computer are on the **same WiFi network**
2. **Open Expo Go** app on your phone
3. **Scan the QR code** from terminal:
   - **iOS**: Use Camera app to scan, then tap the notification
   - **Android**: Open Expo Go app, tap "Scan QR code"
4. App will load automatically!

#### Option B: Different Network (Tunnel Mode)
1. **Stop server** (Press `Ctrl+C`)
2. **Start with tunnel:**
   ```bash
   npm start -- --tunnel
   ```
3. **Wait 30-60 seconds** for tunnel to establish
4. **Scan new QR code** with Expo Go
5. App will load!

---

## 🚀 Detailed Steps

### Step 1: Install Expo Go

#### iPhone Users:
1. Open **App Store**
2. Search: **"Expo Go"**
3. Install the app (by Expo)
4. Open Expo Go app
5. Allow camera permissions when prompted

#### Android Users:
1. Open **Google Play Store**
2. Search: **"Expo Go"**
3. Install the app (by Expo)
4. Open Expo Go app
5. Allow camera permissions when prompted

---

### Step 2: Start Your App

```bash
# Navigate to project
cd "/Users/spartan/Documents/Master Project /talknshop/apps/TalknShopApp"

# Start development server
npm start
```

**Expected Output:**
```
Starting Metro Bundler
› Metro waiting on exp://192.168.1.100:8081
› Scan the QR code above with Expo Go

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press ? │ show all commands
```

---

### Step 3: Connect Phone

#### Method 1: Scan QR Code (Same WiFi)

**For iPhone:**
1. Open **Camera app**
2. Point at QR code in terminal
3. Tap the notification that appears
4. Expo Go will open and load your app

**For Android:**
1. Open **Expo Go app**
2. Tap **"Scan QR code"** button
3. Point camera at QR code in terminal
4. App will load automatically

#### Method 2: Enter URL Manually

1. **Note the URL** from terminal (e.g., `exp://192.168.1.100:8081`)
2. **Open Expo Go** app
3. **Tap "Enter URL manually"** or the text field
4. **Type the URL** from terminal
5. **Tap "Connect"**
6. App will load!

#### Method 3: Tunnel Mode (Any Network)

1. **Stop server**: Press `Ctrl+C`
2. **Start with tunnel:**
   ```bash
   npm start -- --tunnel
   ```
3. **Wait for tunnel** (30-60 seconds)
4. **Scan new QR code** or **enter tunnel URL**
5. App will load!

**Note:** Tunnel mode requires free Expo account (signup at expo.dev)

---

## ✅ Verification

### You'll Know It's Working When:
- ✅ Expo Go app opens
- ✅ Metro bundler shows "Connected"
- ✅ Your app's Login screen appears
- ✅ You can navigate between tabs
- ✅ Changes reflect instantly (hot reload)

---

## 🔧 Troubleshooting

### Issue: "Unable to connect"
**Solutions:**
1. **Check WiFi**: Ensure phone and computer on same network
2. **Try tunnel mode**: `npm start -- --tunnel`
3. **Check firewall**: Allow Node.js through firewall
4. **Try manual URL**: Enter URL directly in Expo Go

### Issue: "Camera can't scan QR code"
**Solutions:**
1. **Check permissions**: Allow camera access for Expo Go/Camera
2. **Try manual URL**: Enter URL directly in Expo Go
3. **Ensure good lighting**: QR code needs to be clear
4. **Try tunnel mode**: `npm start -- --tunnel`

### Issue: "App won't load"
**Solutions:**
1. **Restart server**: Stop (Ctrl+C) and start again
2. **Clear cache**: `npm start -- --clear`
3. **Check Metro bundler**: Look for errors in terminal
4. **Update Expo Go**: Install latest version from store

### Issue: "Not on same WiFi"
**Solutions:**
1. **Use tunnel mode**: `npm start -- --tunnel`
2. **Connect to same WiFi**: Join same network on both devices
3. **Use mobile hotspot**: Create hotspot on phone, connect computer

---

## 🎯 Quick Commands

```bash
# Start server (same WiFi)
npm start

# Start with tunnel (any network)
npm start -- --tunnel

# Start with cache cleared
npm start -- --clear

# Start with LAN mode
npm start -- --lan
```

---

## 📱 Expo Go Features

### Hot Reload
- ✅ Changes reflect instantly
- ✅ No need to reload app
- ✅ State is preserved

### Debugging
- ✅ Shake device to open debug menu
- ✅ View logs in terminal
- ✅ Error overlay in app

### Development Tools
- ✅ Fast Refresh
- ✅ Error reporting
- ✅ Performance monitoring

---

## 🚀 Next Steps

### After App Loads:
1. **Test Navigation**: Try all tabs
2. **Test UI**: Check all screens
3. **Make Changes**: Edit code and see updates
4. **Test Features**: Try login, search, etc.

### Development Workflow:
1. **Make code changes**
2. **Save file**
3. **See updates instantly** in Expo Go
4. **Test on real device**

---

## 💡 Pro Tips

1. **Keep Expo Go open**: App stays connected
2. **Check terminal**: See logs and errors
3. **Use tunnel mode**: For testing away from home
4. **Update Expo Go**: Keep app updated for best experience
5. **Same WiFi**: Faster connection on same network

---

## ✅ Success Checklist

- [ ] Expo Go app installed on phone
- [ ] Development server running (`npm start`)
- [ ] Phone and computer on same WiFi (or using tunnel)
- [ ] QR code scanned or URL entered
- [ ] App loaded in Expo Go
- [ ] Login screen visible
- [ ] Can navigate between tabs
- [ ] Hot reload working (make a change and see it update)

---

## 🎉 You're Ready!

Once connected, you can:
- ✅ See your app on real device
- ✅ Test all features
- ✅ Make changes and see updates instantly
- ✅ Debug on real device
- ✅ Test on both iOS and Android

**Happy coding!** 🚀
