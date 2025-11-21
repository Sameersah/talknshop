# 📱 Connect Your App - Quick Guide

## 🎯 Easiest Methods (No QR Code Needed)

### Method 1: iOS Simulator (Mac Only)
```bash
npm run ios
```
✅ Opens directly in simulator - no QR code needed!

### Method 2: Android Emulator
```bash
npm run android
```
✅ Opens directly in emulator - no QR code needed!

### Method 3: Web Browser
```bash
npm run web
```
✅ Opens in browser - no QR code needed!

---

## 📲 Connect to Physical Device

### Option A: Tunnel Mode (Best - Works Anywhere)

1. **Stop current server:** Press `Ctrl+C`

2. **Start with tunnel:**
   ```bash
   npm start -- --tunnel
   ```

3. **Wait 30-60 seconds** for tunnel to establish

4. **Scan QR code** or **enter URL manually** in Expo Go

**Note:** Requires free Expo account (signup at expo.dev)

---

### Option B: Manual URL Entry

1. **Start server:**
   ```bash
   npm start
   ```

2. **Look for URL in terminal:**
   ```
   Metro waiting on exp://192.168.1.100:8081
   ```

3. **Open Expo Go app** on phone

4. **Tap "Enter URL manually"**

5. **Type the URL:** `exp://192.168.1.100:8081`

6. **Tap "Connect"**

---

### Option C: Same WiFi Network

1. **Ensure same WiFi:**
   - Phone and computer on same network
   - Disable mobile data

2. **Start with LAN:**
   ```bash
   npm start -- --lan
   ```

3. **Scan QR code** with Expo Go

---

## ✅ Quick Commands

```bash
# Tunnel mode (works anywhere)
npm start -- --tunnel

# LAN mode (same WiFi)
npm start -- --lan

# iOS Simulator (no QR needed)
npm run ios

# Android Emulator (no QR needed)
npm run android

# Web Browser (no QR needed)
npm run web
```

---

## 🔧 Troubleshooting

### QR Code Not Scanning?
- Use tunnel mode: `npm start -- --tunnel`
- Or use simulator: `npm run ios` or `npm run android`
- Or enter URL manually in Expo Go

### Not on Same WiFi?
- Use tunnel mode (works anywhere)
- Or use simulator/emulator

### Expo Go Not Connecting?
- Update Expo Go app
- Check camera permissions
- Try manual URL entry
- Use tunnel mode

---

## 🎉 Recommended: Use Simulator

**Easiest option - no setup needed:**
```bash
npm run ios      # Mac only
npm run android  # Requires Android Studio
npm run web      # Works everywhere
```

**No QR code, no network issues, instant connection!**

