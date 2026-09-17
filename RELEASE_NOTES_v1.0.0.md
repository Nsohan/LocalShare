# 🚀 LocalShare v1.0.0 — Fast Local Sharing, Scrcpy Mirroring & Device Pairing

Welcome to the inaugural official release of **LocalShare (v1.0.0)**! 
LocalShare turns your PC into a high-speed, private local network file sharing and device management hub. Share files at lightning-fast LAN speeds, mirror and control your Android devices via Scrcpy, and pair local devices seamlessly with zero cloud dependency.

---

### 🌟 Key Highlights

- **⚡ Lightning-Fast LAN File Sharing**: Transfer files, photos, videos, and documents directly across devices on the same Wi-Fi network with zero cloud or bandwidth limitations.
- **📱 Responsive Mobile Web Client**: Access your shared files from any phone, tablet, or secondary PC via a modern web interface—**no mobile app installation required**.
- **🪞 Integrated Scrcpy Screen Mirroring**: Mirror and control your Android devices in ultra-low latency directly from your desktop dashboard with support for keyboard/mouse input, audio streaming, Wi-Fi TCP/IP mode, and MP4 recording.
- **🔐 PIN-Protected Device Pairing**: Pair local devices using dynamic 6-digit verification keys with 1-second real-time polling and live latency ping monitoring.
- **📷 Instant QR Code Connection**: Scan the auto-generated high-resolution QR code using your smartphone's camera to connect immediately.
- **🪟 Windows Explorer "Send To" Integration**: Right-click any file in Windows File Explorer &rarr; **Send to** &rarr; **Send with LocalShare** to share instantly.
- **📌 Background System Tray**: Runs unobtrusively in the Windows System Tray with instant controls, quick IP/URL copy, and server status.

---

### ✨ What's Included

#### 🔄 Two-Way File Transfer
- **PC &rarr; Mobile**: Drag-and-drop any file into the Desktop Dashboard to instantly make it downloadable on mobile browsers.
- **Mobile &rarr; PC**: Upload photos, videos, and files directly from your smartphone browser into `Downloads/LocalShare` with real-time upload progress.
- **Desktop Notifications**: Automatic Windows desktop alerts when mobile uploads complete.

#### 🪞 Android Screen Mirroring & Control (scrcpy)
- **Zero-Configuration scrcpy Integration**: Bundled standalone Scrcpy and ADB binaries for instant plug-and-play mirroring.
- **High-Performance Controls**: Configurable resolution, bitrate, framerate, and audio streaming options.
- **Screen Recording**: Capture your phone screen directly to MP4 files with a single toggle.
- **Wireless TCP/IP Pairing**: Connect once via USB to switch your device into wireless debugging mode.

#### 📱 Device Management ("Your Devices")
- **Device Pairing Dashboard**: Save and monitor verified local devices.
- **Real-time Status Heartbeat**: 1-second ping polling to verify network reachability and response latency.
- **Developer API Explorer**: Built-in REST API documentation with interactive `curl` examples and schema specifications.

#### 🎨 Modern Glassmorphic Desktop Dashboard
- **Sleek Dark / Light Themes**: Fully customizable UI with adaptive contrast and smooth transitions.
- **Modular Architecture**: Independent section controllers for files, QR connect, devices, scrcpy, settings, and diagnostics.
- **Configurable Port & Autostart**: Customize HTTP server port (default `5199`) and toggle Windows auto-start on login.

---

### 📦 Installation

1. Download **`LocalShare-Setup-v1.0.0.exe`** (or **`LocalShare-Setup.exe`**) from the Assets below.
2. Run the installer on Windows 10/11.
3. Follow the setup wizard to create Desktop and Start Menu shortcuts.
4. Launch **LocalShare** and connect your mobile devices!

---

### 🔒 Privacy & Security
- All transfers happen strictly over your **local Wi-Fi / LAN network**.
- **No external servers, no cloud storage, and no tracking.**
- 6-digit cryptographic PIN authorization prevents unauthorized local network pairing.

---

### 💬 Feedback & Community

Found a bug or have a suggestion?
- **Issues**: [GitHub Issues](https://github.com/Nsohan/LocalShare/issues)
- **Repository**: [Nsohan/LocalShare](https://github.com/Nsohan/LocalShare)
