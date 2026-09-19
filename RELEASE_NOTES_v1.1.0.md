# 🚀 LocalShare v1.1.0 — Interactive ADB Terminal, Quick Action Presets & Mirroring Enhancements

Welcome to **LocalShare v1.1.0**! This release introduces a powerful **Interactive ADB Command Terminal**, **Quick Action Presets**, enhanced device targeting, and significant improvements to Android screen mirroring and management workflows.

---

### 🌟 What's New in v1.1.0

#### 💻 Interactive ADB Command Terminal
- **Integrated Terminal Console**: Execute custom ADB shell commands directly from the LocalShare desktop dashboard without opening an external command prompt.
- **Quote-Safe Argument Parsing**: Seamlessly handle complex shell commands, parameters, and quoted strings.
- **Command History Navigation**: Use `Up` and `Down` arrow keys to quickly recall, edit, and re-run previous commands.
- **Output Management**: Real-time formatted command output with one-click copy and console clear buttons.
- **Targeted Execution**: Send commands to a specific connected Android device or broadcast across all paired devices simultaneously.

#### ⚡ Quick Action Presets & Controls
- **Power Button Toggle**: Wake or lock the device screen instantly via `shell input keyevent 26`.
- **Navigation Controls**: One-click shortcuts for **Home** (`keyevent 3`) and **Back** (`keyevent 4`).
- **Volume Management**: Instant controls for Volume Up (`keyevent 24`) and Volume Down (`keyevent 25`).
- **System & Battery Diagnostics**: Run `dumpsys battery` to inspect battery levels, temperature, and charging status in real time.
- **Installed Apps Listing**: View all user-installed third-party packages (`pm list packages -3`) with one click.
- **Network & Storage Insights**: Check device routing tables (`ip route`) and internal storage capacity (`df -h /data`).

#### 🪞 Scrcpy Mirroring & Performance Refinements
- Improved process management and graceful cleanup on exit.
- Better error handling and state synchronization across USB and wireless TCP/IP connections.
- UI responsiveness polish in the Phone Mirroring section with status feedback.

---

### ✨ Core Features

- **⚡ Lightning-Fast LAN Sharing**: Transfer files across devices with zero cloud dependency and maximum local network speed.
- **📱 Zero-Install Mobile Web Client**: Upload and download files from any smartphone browser without installing an app.
- **🪞 Android Screen Mirroring**: Control and mirror Android devices with keyboard/mouse support and audio streaming.
- **🔐 PIN-Protected Pairing**: Secure local verification with real-time ping and status heartbeat monitoring.
- **📷 Instant QR Code Connect**: Quick onboarding by scanning the high-resolution QR code.
- **🪟 Windows Explorer Integration**: Right-click &rarr; "Send to LocalShare" support.
- **📌 System Tray Utility**: Quick access from the taskbar notification area.

---

### 📦 Installation

1. Download **`LocalShare-Setup-v1.1.0.exe`** (or **`LocalShare-Setup.exe`**) from the Assets below.
2. Run the installer on Windows 10 / 11.
3. Launch **LocalShare** and enjoy high-speed local file sharing and phone control!

---

### 🔒 Privacy & Security

- All transfers and ADB communications operate strictly over your **local Wi-Fi / LAN network**.
- **100% private**: No external cloud servers, no remote tracking, and no third-party data collection.

---

### 💬 Feedback & Community

Found an issue or want to request a feature?
- **Issues**: [GitHub Issues](https://github.com/Nsohan/LocalShare/issues)
- **Repository**: [Nsohan/LocalShare](https://github.com/Nsohan/LocalShare)
