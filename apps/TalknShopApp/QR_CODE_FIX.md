# 🔧 QR Code Not Showing - Quick Fix

## 🚀 **Immediate Solutions**

### **Solution 1: Get the URL Manually**

When you run `npm start`, look for a line like this:
```
› Metro waiting on exp://192.168.1.100:8081
```

**Copy that URL** and enter it manually in Expo Go app!

### **Solution 2: Use Tunnel Mode**

```bash
# Stop server (Ctrl+C)
npm start -- --tunnel
```

This will generate a proper QR code and URL.

### **Solution 3: Check Terminal Output**

Look for these lines in terminal:
- `Metro waiting on exp://...`
- `QR code:` (should show QR code)
- Any error messages

---

## 🔍 **Troubleshooting Steps**

### **Step 1: Check Server is Running**

Make sure you see:
```
Starting Metro Bundler
Waiting on http://localhost:8081
```

### **Step 2: Look for URL**

Find the line that says:
```
› Metro waiting on exp://192.168.x.x:8081
```

**That's your connection URL!**

### **Step 3: Enter URL Manually**

1. Open **Expo Go** app on your phone
2. Tap **"Enter URL manually"** or the text field
3. Type the URL from terminal (e.g., `exp://192.168.1.100:8081`)
4. Tap **"Connect"**

---

## 🎯 **Alternative Connection Methods**

### **Method 1: Manual URL Entry**

1. **Find the URL** in terminal output
2. **Open Expo Go** app
3. **Enter URL manually**
4. **Connect**

### **Method 2: Tunnel Mode (Always Works)**

```bash
# Stop current server (Ctrl+C)
npm start -- --tunnel
```

This creates a public URL that always works.

### **Method 3: Check Network**

```bash
# Get your computer's IP address
# Mac:
ifconfig | grep "inet " | grep -v 127.0.0.1

# Then manually construct URL:
# exp://YOUR_IP:8081
```

---

## 📱 **Step-by-Step: Manual Connection**

### **Step 1: Find the URL**

When you run `npm start`, look for:
```
› Metro waiting on exp://192.168.1.100:8081
```

**Copy this URL!**

### **Step 2: Open Expo Go**

1. Open **Expo Go** app on your phone
2. Look for **"Enter URL manually"** option
3. Or tap the **text input field** at the top

### **Step 3: Enter URL**

1. **Paste or type** the URL from terminal
2. Example: `exp://192.168.1.100:8081`
3. Tap **"Connect"** or **"Go"**

### **Step 4: Wait for Connection**

- App will start loading
- You'll see "Connecting..." message
- Then your app will appear!

---

## 🔧 **Common Issues & Fixes**

### **Issue: QR Code Not Displaying**

**Fix:**
- Use manual URL entry instead
- Or use tunnel mode: `npm start -- --tunnel`
- QR code is just a convenience - URL works the same!

### **Issue: Can't Find URL**

**Fix:**
- Look for line starting with `exp://`
- Or check `http://localhost:8081` - that's your server
- Try tunnel mode for clearer output

### **Issue: Terminal Output is Messy**

**Fix:**
- Clear terminal: `clear` or `Cmd+K`
- Restart server: Stop (Ctrl+C) and `npm start` again
- Check for error messages

### **Issue: URL Not Working**

**Fix:**
- Ensure phone and computer on same WiFi
- Try tunnel mode: `npm start -- --tunnel`
- Check firewall settings
- Try different network

---

## 🚀 **Recommended: Use Tunnel Mode**

### **Why Tunnel Mode?**
- ✅ Always generates QR code
- ✅ Works from any network
- ✅ Clear URL display
- ✅ More reliable

### **How to Use:**

```bash
# Stop current server (Ctrl+C)
npm start -- --tunnel

# Wait 30-60 seconds
# You'll see:
# › Tunnel ready
# › QR code (will display properly)
# › URL: exp://...
```

**Note:** Requires free Expo account (signup at expo.dev)

---

## 📋 **Quick Checklist**

- [ ] Server is running (`npm start`)
- [ ] Found URL in terminal (`exp://...`)
- [ ] Expo Go app installed on phone
- [ ] Entered URL manually in Expo Go
- [ ] Or using tunnel mode for QR code
- [ ] Phone and computer on same WiFi (for LAN)
- [ ] Or using tunnel mode (works anywhere)

---

## ✅ **Quick Fix - Try This Now**

### **Option 1: Manual URL (Fastest)**

1. Run `npm start`
2. Look for `exp://192.168.x.x:8081` in terminal
3. Copy that URL
4. Open Expo Go → Enter URL manually → Paste → Connect

### **Option 2: Tunnel Mode (Most Reliable)**

```bash
npm start -- --tunnel
```

Wait for tunnel, then scan QR code or use URL.

---

## 🎯 **What to Look For**

### **In Terminal:**
```
Starting Metro Bundler
Waiting on http://localhost:8081

› Metro waiting on exp://192.168.1.100:8081  ← THIS IS YOUR URL!
› Scan the QR code above with Expo Go
```

### **If QR Code is Blank:**
- That's OK! Just use the URL instead
- QR code is just a shortcut to the URL
- Manual entry works exactly the same

---

## 💡 **Pro Tip**

**QR code is optional!** The URL is what matters:
- QR code = visual representation of URL
- Manual entry = same result
- Both connect to your app the same way

**Just use the URL from terminal!**

---

## 🎉 **Success!**

Once connected via URL:
- ✅ App loads in Expo Go
- ✅ You see your Login screen
- ✅ Hot reload works
- ✅ All features work

**The URL method works just as well as QR code!**
