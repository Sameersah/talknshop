# 📱 Setup iOS Simulator

## Quick Setup

### Step 1: Open Xcode
```bash
open -a Xcode
```

### Step 2: Install Simulator
1. Go to **Xcode → Settings (Preferences)**
2. Click **Platforms** tab
3. Click **+** button
4. Download **iOS 17.0** or latest version
5. Wait for download to complete

### Step 3: Open Simulator
```bash
open -a Simulator
```

### Step 4: Create Device
1. In Simulator menu: **File → New → Device**
2. Select **iPhone 15** or any iPhone
3. Click **Create**

### Step 5: Run App
```bash
npm run ios
```

---

## Alternative: Use Command Line

### List available runtimes:
```bash
xcrun simctl list runtimes
```

### Create a device:
```bash
xcrun simctl create "iPhone 15" "iPhone 15" "iOS17.0"
```

### Boot the device:
```bash
xcrun simctl boot "iPhone 15"
```

### Open Simulator:
```bash
open -a Simulator
```

---

## Troubleshooting

### No Simulators Available?
- Install Xcode from App Store
- Open Xcode and accept license
- Install iOS Simulator via Xcode → Settings → Platforms

### Simulator Won't Start?
```bash
# Kill all simulators
killall Simulator

# Restart
open -a Simulator
```

### Xcode Not Installed?
- Install from App Store (large download ~15GB)
- Or use Android emulator instead
- Or use web browser
- Or use physical device
