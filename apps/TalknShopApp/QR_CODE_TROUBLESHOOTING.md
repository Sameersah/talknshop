# 🔧 QR Code Scanning Troubleshooting

## 🚀 Quick Solutions

### Solution 1: Use Tunnel Mode (Recommended)
```bash
npm start -- --tunnel
```
This creates a public URL that works even if you're on different networks.

### Solution 2: Use Manual Connection in Expo Go
1. Open Expo Go app on your phone
2. Tap "Enter URL manually"
3. Type the URL from terminal (e.g., `exp://192.168.1.100:8081`)
4. Tap "Connect"

### Solution 3: Use LAN Connection
```bash
npm start -- --lan
```
This uses your local network IP address.

---

## 📱 Step-by-Step Fix

### Option A: Tunnel Mode (Works Anywhere)

1. **Stop the current server** (Press `Ctrl+C` in terminal)

2. **Start with tunnel mode:**
   ```bash
   npm start -- --tunnel
   ```
   
3. **Wait for tunnel to establish** (may take 30-60 seconds)

4. **You'll see a new QR code** with a tunnel URL

5. **Scan the QR code** with Expo Go app

**Note:** Tunnel mode requires an Expo account (free signup)

---

### Option B: Manual URL Entry

1. **Check the terminal output** - you'll see something like:
   ```
   Metro waiting on exp://192.168.1.100:8081
   ```

2. **Open Expo Go app** on your phone

3. **Tap "Enter URL manually"** or the text input field

4. **Enter the URL** from terminal:
   ```
   exp://192.168.1.100:8081
   ```
   (Replace with your actual IP address)

5. **Tap "Connect"**

---

### Option C: Same WiFi Network

1. **Ensure same WiFi:**
   - Phone and computer must be on the same WiFi network
   - Disable mobile data on phone
   - Check WiFi connection on both devices

2. **Check firewall:**
   - Allow Node.js/Expo through firewall
   - Port 8081 should be open

3. **Try LAN mode:**
   ```bash
   npm start -- --lan
   ```

---

### Option D: Use Development Build URL

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Press `s` in terminal** to switch connection mode

3. **Select "Tunnel"** when prompted

4. **Wait for tunnel URL**

5. **Scan new QR code**

---

## 🔍 Troubleshooting Steps

### Check 1: Are you on the same network?
```bash
# On your computer, check your IP:
# Mac:
ifconfig | grep "inet " | grep -v 127.0.0.1

# The IP should match the one in Expo output
```

### Check 2: Is port 8081 accessible?
```bash
# Check if port is in use
lsof -i :8081

# If something is using it, kill it:
lsof -ti:8081 | xargs kill -9
```

### Check 3: Is Expo Go app updated?
- Update Expo Go app to latest version
- iOS: App Store → Updates
- Android: Google Play → Updates

### Check 4: Camera permissions
- Make sure Expo Go has camera permissions
- iOS: Settings → Expo Go → Camera
- Android: Settings → Apps → Expo Go → Permissions → Camera

---

## 📲 Alternative: Use Simulator/Emulator

### iOS Simulator (Mac only)
```bash
npm run ios
```
This opens directly in iOS Simulator - no QR code needed!

### Android Emulator
```bash
npm run android
```
This opens directly in Android Emulator - no QR code needed!

### Web Browser
```bash
npm run web
```
This opens in your web browser - no QR code needed!

---

## 🌐 Network Connection Modes

### Local (localhost)
- Only works on same machine
- Use for simulator/emulator
```bash
npm start -- --localhost
```

### LAN (Local Network)
- Works on same WiFi network
- Faster than tunnel
```bash
npm start -- --lan
```

### Tunnel (Public URL)
- Works anywhere
- Slower but more reliable
- Requires Expo account
```bash
npm start -- --tunnel
```

---

## 🔑 Expo Account Setup (for Tunnel)

1. **Create free Expo account:**
   - Go to https://expo.dev/
   - Sign up (free)

2. **Login in terminal:**
   ```bash
   npx expo login
   ```

3. **Use tunnel mode:**
   ```bash
   npm start -- --tunnel
   ```

---

## ✅ Quick Checklist

- [ ] Phone and computer on same WiFi (for LAN mode)
- [ ] Expo Go app installed and updated
- [ ] Camera permissions enabled for Expo Go
- [ ] Port 8081 not blocked by firewall
- [ ] Expo account created (for tunnel mode)
- [ ] Terminal shows QR code clearly

---

## 🎯 Recommended Solution

**For best results, use tunnel mode:**
```bash
npm start -- --tunnel
```

**Or use simulator/emulator:**
```bash
npm run ios      # iOS Simulator
npm run android  # Android Emulator
```

---

## 📞 Still Not Working?

Try these in order:

1. **Restart everything:**
   ```bash
   # Stop server (Ctrl+C)
   # Clear cache
   npm start -- --clear --tunnel
   ```

2. **Check Expo Go app logs:**
   - Open Expo Go
   - Check for error messages
   - Try connecting manually with URL

3. **Use development build:**
   - Build app locally
   - Install on device
   - No QR code needed

4. **Check network settings:**
   - Disable VPN
   - Check firewall rules
   - Try different WiFi network

---

## 🚀 Success!

Once connected, you should see:
- App loads in Expo Go
- Login screen appears
- You can navigate between tabs
- Hot reload works when you make changes

