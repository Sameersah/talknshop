# 📱 How to Enter URL in Expo Go App

## 🎯 **Step-by-Step Guide**

### **Method 1: Using the Search/Scan Bar (Most Common)**

#### **Step 1: Open Expo Go App**
- Open **Expo Go** app on your phone
- You'll see the home screen

#### **Step 2: Find the Text Input Field**
- Look at the **top of the screen**
- You should see a **search bar** or **text input field**
- It might say "Enter URL" or "Paste a project URL"
- Or it might be a **camera/scan icon** with a text field next to it

#### **Step 3: Tap the Text Field**
- **Tap on the text input field** at the top
- A keyboard will appear
- You can now type or paste the URL

#### **Step 4: Enter the URL**
- Type or paste: `exp://192.168.1.100:8081`
- (Replace with your actual URL from terminal)
- Tap **"Connect"** or **"Go"** button

---

### **Method 2: Using the Menu (Alternative)**

#### **Step 1: Look for Menu Button**
- Look for a **menu icon** (three lines ☰ or dots ⋯)
- Usually in top-left or top-right corner
- Tap it

#### **Step 2: Find "Enter URL" Option**
- Look for options like:
  - **"Enter URL manually"**
  - **"Paste URL"**
  - **"Connect to server"**
  - **"Enter project URL"**
- Tap that option

#### **Step 3: Enter URL**
- Text field will appear
- Enter your URL: `exp://192.168.1.100:8081`
- Tap **"Connect"**

---

### **Method 3: Using the Camera/Scan Button**

#### **Step 1: Find Scan Button**
- Look for a **camera icon** or **"Scan QR code"** button
- Usually prominent on the home screen

#### **Step 2: Tap and Look for Manual Entry**
- Tap the scan button
- Sometimes there's an option: **"Enter URL manually"** or **"Type URL"**
- Tap that option

#### **Step 3: Enter URL**
- Text field appears
- Enter URL: `exp://192.168.1.100:8081`
- Tap **"Connect"**

---

## 📱 **What Expo Go Home Screen Looks Like**

### **iOS Version:**
```
┌─────────────────────────────┐
│  Expo Go                    │
├─────────────────────────────┤
│  [Text Input Field]         │  ← Tap here!
│  "Enter URL or scan QR"     │
├─────────────────────────────┤
│  [Camera Icon] Scan QR Code │
│                             │
│  Recent Projects            │
│  (if any)                   │
└─────────────────────────────┘
```

### **Android Version:**
```
┌─────────────────────────────┐
│  ☰ Menu    Expo Go          │
├─────────────────────────────┤
│  [Text Input]               │  ← Tap here!
│  "Paste project URL here"   │
├─────────────────────────────┤
│  [📷] Scan QR Code          │
│                             │
│  Recent Projects            │
└─────────────────────────────┘
```

---

## 🔍 **Where to Look**

### **Common Locations:**

1. **Top of Screen:**
   - Text input field at the very top
   - Might be labeled "Enter URL" or "Paste URL"

2. **Below Header:**
   - Search bar or input field
   - Usually has placeholder text like "Enter project URL"

3. **Scan Button Area:**
   - Near the camera/scan QR code button
   - Sometimes has "or enter URL manually" link

4. **Menu/Settings:**
   - Tap menu icon (☰)
   - Look for "Enter URL" option

---

## 🎯 **Quick Steps (Try These in Order)**

### **Step 1: Look at Top of Screen**
- Open Expo Go
- Look at the **very top** of the screen
- You should see a **text input field**
- Tap it!

### **Step 2: If Not Visible, Tap Scan Button**
- Tap the **"Scan QR code"** or camera button
- Look for **"Enter URL manually"** link
- Tap it

### **Step 3: If Still Not Found, Check Menu**
- Look for **menu icon** (☰ or ⋯)
- Tap it
- Look for **"Enter URL"** or **"Manual Entry"** option

### **Step 4: Try Swiping**
- Some versions have the URL field hidden
- Try **swiping down** from the top
- Or **swiping up** from the bottom

---

## 💡 **Alternative: Use Tunnel Mode (Easier)**

If you can't find the URL entry, use **tunnel mode** which provides a clearer QR code:

```bash
# Stop server (Ctrl+C)
npm start -- --tunnel
```

Then:
1. **Wait for tunnel** (30-60 seconds)
2. **QR code will appear** in terminal
3. **Scan with Expo Go** camera
4. Or **look for the URL** in terminal and enter it

---

## 🔧 **Troubleshooting**

### **Issue: Can't Find Text Field**

**Solution 1: Update Expo Go**
- Go to App Store/Google Play
- Update Expo Go to latest version
- Newer versions have clearer UI

**Solution 2: Clear App Data**
- iOS: Delete and reinstall Expo Go
- Android: Clear app data in settings

**Solution 3: Use Tunnel Mode**
```bash
npm start -- --tunnel
```
Tunnel mode often provides better QR codes and URLs.

### **Issue: Text Field Not Clickable**

**Solution:**
- Make sure Expo Go is updated
- Try tapping different areas
- Restart Expo Go app
- Use tunnel mode instead

### **Issue: Keyboard Doesn't Appear**

**Solution:**
- Tap the text field again
- Make sure phone keyboard is enabled
- Try typing in another app first
- Restart Expo Go app

---

## 🚀 **Easiest Method: Tunnel Mode**

### **Why Tunnel Mode is Easier:**
- ✅ Better QR code generation
- ✅ Clearer URL display
- ✅ Works from any network
- ✅ More reliable connection

### **How to Use:**

```bash
# Stop current server (Ctrl+C)
npm start -- --tunnel

# Wait for tunnel (30-60 seconds)
# You'll see:
# - QR code (should be visible)
# - URL: exp://...
# - Clear connection instructions
```

### **Then in Expo Go:**
1. **Scan the QR code** with camera (if visible)
2. **Or enter the URL** manually (from terminal)
3. **App will connect!**

---

## 📋 **Step-by-Step: Finding URL Entry**

### **For iPhone:**

1. **Open Expo Go app**
2. **Look at the top** - there should be a text field
3. **If not visible:**
   - Tap the **camera/scan button**
   - Look for **"Enter URL manually"** link
   - Or tap **menu icon** (three lines)
4. **Tap the text field** that appears
5. **Enter URL**: `exp://192.168.1.100:8081`
6. **Tap "Connect"**

### **For Android:**

1. **Open Expo Go app**
2. **Look for text input** at the top
3. **If not visible:**
   - Tap **"Scan QR code"** button
   - Look for **"Enter URL"** option
   - Or tap **menu icon** (☰)
4. **Tap text field**
5. **Enter URL**: `exp://192.168.1.100:8081`
6. **Tap "Connect"**

---

## ✅ **Quick Checklist**

- [ ] Expo Go app is open
- [ ] Looked at top of screen for text field
- [ ] Tapped text field (if visible)
- [ ] Tried scan button and looked for "Enter URL" option
- [ ] Checked menu for URL entry option
- [ ] Tried tunnel mode for better QR code
- [ ] Updated Expo Go app to latest version

---

## 🎯 **If Still Can't Find It**

### **Use Tunnel Mode Instead:**

```bash
npm start -- --tunnel
```

**Benefits:**
- ✅ Better QR code (more likely to work)
- ✅ Clearer URL display
- ✅ Works from anywhere
- ✅ Easier to connect

**Then:**
1. **Scan QR code** with Expo Go camera (should work)
2. **Or look for URL** in terminal and enter manually
3. **App connects!**

---

## 💡 **Pro Tip**

**The URL entry field is usually:**
- At the **top of the Expo Go home screen**
- In a **text input field** with placeholder text
- Sometimes hidden until you **tap the scan button**
- Or in the **menu** (three lines icon)

**If you can't find it, use tunnel mode - it's easier!**

---

## 🎉 **Success!**

Once you enter the URL:
- ✅ Expo Go will connect to your app
- ✅ You'll see "Connecting..." message
- ✅ Your app will load
- ✅ Login screen will appear
- ✅ You can start testing!

**Keep trying - the URL entry is there, just might be in a slightly different location depending on your Expo Go version!**
