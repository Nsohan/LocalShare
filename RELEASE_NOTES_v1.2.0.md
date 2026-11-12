# 🚀 LocalShare v1.2.0 — LAN Auto-Discovery, My Device Actions & Tray Write Text Modal

Welcome to **LocalShare v1.2.0**! This release introduces **LAN Auto-Discovery & Confirm-on-Phone Pairing**, the redesigned **My Device** card with direct **PhoneServer** actions (**Send Clipboard**, **Write Text**, **Send File**), expanded **System Tray** device controls, and a **standalone floating Write Text popup** triggered straight from the tray.

---

### 🌟 What's New in v1.2.0

#### 🔍 LAN Auto-Discovery & Confirm-on-Phone Pairing
- **Subnet Device Scanner**: Automatically discover devices running your mobile server across the local subnet.
- **Confirm-on-Phone Pairing**: Streamlined PIN verification and live pairing progress feedback directly from the desktop dashboard.

#### 📱 My Device & PhoneServer Integration
- **My Device View**: Renamed from *Your Devices* to **My Device**, with a cleaner card layout featuring a top-right icon-only delete button and no redundant card Mirror button.
- **Send Clipboard**: Push text from your PC clipboard straight to your phone clipboard (`GET /command?clip=`).
- **Write Text Modal**: Open an input dialog with **Cancel**, **Paste**, and **Write** actions (plus `Ctrl+Enter` shortcut) to type text directly onto your phone (`GET /command?write=`).
- **Send File**: Pick one or multiple files and upload them sequentially to your phone server (`POST /files`).

#### 📌 System Tray Quick Actions & Standalone Write Text Window
- **Per-Device Tray Submenu**: Access **Send Clipboard**, **Write Text...**, and **Send File...** directly under **My Device** in the tray menu.
- **Standalone Floating Write Text Modal**: Clicking **Write Text...** from the tray opens only a compact, opaque, always-on-top **Write Text** popup window without restoring or opening the main dashboard window.

---

### ✨ Core Features

- **⚡ Lightning-Fast LAN Sharing**: Transfer files across devices with zero cloud dependency and maximum local network speed.
- **📱 Zero-Install Mobile Web Client**: Upload and download files from any smartphone browser without installing an app.
- **🪞 Android Screen Mirroring**: Control and mirror Android devices via ADB/Scrcpy with interactive terminal and quick presets.
- **📷 Instant QR Code Connect**: Quick onboarding by scanning the high-resolution QR code.
- **🪟 Windows Explorer Integration**: Right-click &rarr; "Send to LocalShare" support.

---

### 📦 Installation

1. Download **`LocalShare-Setup-v1.2.0.exe`** (or **`LocalShare-Setup.exe`**) from the Assets below.
2. Run the installer on Windows 10 / 11.
3. Launch **LocalShare** and enjoy high-speed local file sharing and phone control!

---

### 🔒 Privacy & Security

- All transfers, auto-discovery scans, and PhoneServer commands operate strictly over your **local Wi-Fi / LAN network**.
- **100% private**: No external cloud servers, no remote tracking, and no third-party data collection.

---

### 💬 Feedback & Community

Found an issue or want to request a feature?
- **Issues**: [GitHub Issues](https://github.com/Nsohan/LocalShare/issues)
- **Repository**: [Nsohan/LocalShare](https://github.com/Nsohan/LocalShare)

