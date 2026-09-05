# LocalShare 🚀

> **Fast, private, two-way local network file sharing between your PC and mobile devices.** No cloud, no size limits, and no third-party accounts required.

LocalShare turns your computer into a lightweight, high-speed local sharing hub. Devices connected to the same Wi-Fi network (smartphones, tablets, and other laptops) can immediately download shared files or send photos, videos, and documents directly to your computer through any standard web browser—**no mobile app installation required**.

---

## ✨ Features

- **⚡ Lightning-Fast LAN Speeds**: Transfers files directly over your local Wi-Fi router with zero internet bandwidth consumption.
- **🔄 Two-Way Transfer**:
  - **PC → Mobile**: Drag & drop files onto the dashboard to make them instantly downloadable on phones and tablets.
  - **Mobile → PC**: Upload photos, videos, or documents directly from your phone into your computer's `Downloads/LocalShare` folder.
- **🖥️ Unified Desktop Dashboard**:
  - **Files & Sharing**: Interactive drag-and-drop zone, file category badges, and quick links.
  - **Connect & QR**: Native high-resolution QR code generator for instant phone camera scan-to-connect.
  - **📱 Your Devices**: Add and manage paired local mobile devices with 6-digit PIN verification, real-time 1-second HTTP polling, and latency ping monitoring.
  - **API Explorer**: Built-in REST API reference with copyable `curl` examples and pairing specifications.
  - **Settings**: Windows autostart toggle, notifications mute, custom port selector, and theme switcher.
  - **About**: Diagnostic runtime versions (Electron, Node.js) and operating system info.
- **📱 Responsive Mobile Web Client**:
  - Clean, touch-friendly dark interface matching the desktop app.
  - **Smart Live Polling**: Automatically reflects new files added on the PC within seconds.
  - Mobile camera capture & gallery upload with an animated progress bar.
- **🪟 Windows Explorer "Send To" Integration**:
  - Right-click any file in Windows Explorer &rarr; **Send to** &rarr; **Send with LocalShare**.
- **📌 Background System Tray Operation**:
  - Minimizes silently to the Windows System Tray with quick controls.

---

## 📋 Prerequisites

- **[Node.js](https://nodejs.org/)** (v18 or newer recommended)
- **npm** (included with Node.js)
- Both your PC and mobile devices must be connected to the **same Wi-Fi or Local Network**.

---

## 🚀 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Nsohan/LocalShare.git
   cd LocalShare
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

---

## 💻 Running the App

### Development Mode (with Live Hot-Reloading)
Watches both main process files and UI frontend files, automatically reloading on change:
```bash
npm run dev
```

### Standard Start
Launches the app using standard Electron:
```bash
npm start
```

### Package for Windows (Installer `.exe`)
Creates an NSIS setup installer in the `dist/` directory:
```bash
npm run package
```

---

## 📖 How to Use

### 1. Sharing Files from PC &rarr; Mobile
1. Launch **LocalShare**. The dashboard will open and display your local network IP and port (e.g., `192.168.1.15:5199`).
2. Drag and drop any file into the dashboard's drop zone, or click **"Browse Files"**.
3. On your phone:
   - Click **"Connect & QR"** in the PC dashboard sidebar.
   - Scan the displayed QR code with your phone's camera (or type `http://<your-pc-ip>:5199` in your mobile browser).
4. Tap **Download** on any shared file.

### 2. Sending Files from Mobile &rarr; PC
1. Open the LocalShare web client on your mobile browser.
2. Switch to the **"Send to PC"** tab.
3. Tap **"Choose Files"** or **"Take Photo"**.
4. Watch the progress bar upload the file.
5. On your PC:
   - A Windows desktop notification will notify you.
   - Files are saved directly to `Downloads\LocalShare\` and listed under the dashboard's **"Received from Mobile"** tab.

### 3. Pairing Local Devices ("Your Devices")
1. Open the dashboard and navigate to **"Your Devices"** in the sidebar.
2. Click **"Add Device"** (or press the **+** button).
3. Enter your mobile or target device's local address (e.g., `192.168.1.4:8000`).
4. Note the generated **6-digit pairing key** (or click to refresh a new one).
5. Enter the 6-digit key into your phone / device server.
6. The dashboard automatically polls your device every 1 second (`GET /pair?key=...` or `/status`).
7. Once verified, the device is instantly paired, displaying connection status, real-time ping latency, and quick browser open links.
8. Click **"(?) JSON Format"** in the pairing dialog anytime to view the expected JSON API format and sample curl commands.

### 4. Sharing Directly from Windows Explorer
1. In Windows File Explorer, right-click any file.
2. Select **"Send to"** &rarr; **"Send with LocalShare"** *(requires packaging/installing or running the NSIS shortcut script)*.
3. The running instance will automatically add the file and update the server.

### 5. Windows System Tray
- Closing the dashboard window minimizes the app to the Windows notification tray (near the clock).
- Right-click the tray icon to:
  - Quickly view active shared files or open their folder locations.
  - Jump directly to **Settings**, **QR Code**, or **Dashboard**.
  - **Delete All Shared Files** in one click.
  - **Exit LocalShare** completely.

---

## ⚡ REST API Reference

LocalShare exposes standard HTTP endpoints on port `5199` (configurable in Settings):

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/shared-file` | Returns a JSON array of all files currently shared by the PC. |
| `POST` | `/api/upload` | Uploads multipart files from clients into `Downloads/LocalShare`. |
| `GET` | `/download/:id` | Streams a shared file to the browser by its ID. |
| `GET` | `/api/server-info` | Returns host computer name, platform, and active port. |

#### Example: Upload a file using `curl`
```bash
curl -F "files=@my-document.pdf" http://<PC-IP>:5199/api/upload
```

#### Example: Fetch list of shared files
```bash
curl http://<PC-IP>:5199/api/shared-file
```

### 📱 Device Pairing Protocol ("Your Devices")

When pairing with external mobile or local device servers (e.g., `http://192.168.1.4:8000`), LocalShare automatically polls the device's endpoint every 1 second:

```http
GET http://192.168.1.4:8000/pair?key=482910
GET http://192.168.1.4:8000/status?pairingKey=482910
```

#### Expected Success Response (`200 OK`):
```json
{
  "success": true,
  "paired": true,
  "deviceName": "Galaxy S24 Ultra",
  "deviceType": "mobile",
  "ip": "192.168.1.4",
  "port": 8000
}
```

---

## 🛠️ Project Structure

```
LocalShare/
├── build/
│   └── icon.ico             # Application icon for packaging & tray
├── public/
│   ├── favicon.ico
│   └── index.html           # Web client redirect
├── src/
│   ├── config/
│   │   ├── config.js        # Persistent JSON config management
│   │   └── logger.js        # Daily rotating logger
│   ├── main/
│   │   ├── main.js          # Main Electron process, IPC hub, server supervisor
│   │   ├── tray.js          # Windows System Tray menu manager
│   │   ├── utils.js         # Local IPv4 network discovery & sanitization
│   │   └── windows/
│   │       ├── dashboard.js # Unified dashboard window manager
│   │       ├── qrcode.js    # QR Code modal
│   │       └── settings.js  # Settings window manager
│   ├── pages/
│   │   ├── dashboard/       # Decentralized Desktop Dashboard
│   │   │   ├── views/       # HTML section partials (files, connect, devices, modals...)
│   │   │   ├── css/         # Modular section stylesheets (base, layout, devices...)
│   │   │   ├── js/          # Section controller scripts (state, files, modals...)
│   │   │   ├── index.html   # Main dashboard layout skeleton
│   │   │   ├── style.css    # Unified stylesheet aggregator
│   │   │   └── script.js    # Section orchestrator & IPC coordinator
│   │   └── home/            # Mobile & Web Client interface (HTML/CSS/JS)
│   └── server/
│       ├── server.js        # Express HTTP server process (runs in child process)
│       ├── routes.js        # Express routes
│       └── controllers/
│           ├── fileController.js # Multer upload & download streaming
│           └── apiController.js  # API data handlers
├── installer.nsh            # NSIS installer config (SendTo context menu setup)
└── package.json
```

---

## ⚙️ Configuration

Application settings are stored in your user profile:
- **Windows**: `%APPDATA%\LocalShare\config.json`
- **Logs**: `%APPDATA%\LocalShare\logs\localshare-YYYY-MM-DD.log`

Configurable options include:
- `autostart`: Start LocalShare automatically on Windows login.
- `openDashboardAtStart`: Show the dashboard window on launch or start silently in the tray.
- `notifications`: Enable or mute Windows desktop alerts.
- `port`: Port used by the HTTP server (default: `5199`).
- `theme`: UI theme (`dark`, `light`, `system`).

---

## 👤 Author

**Nasimul Hoque Sohan**
- Email: [nhsohan3@gmail.com](mailto:nhsohan3@gmail.com)

---

## 📄 License

Copyright &copy; 2025-2026 Nasimul Hoque Sohan. All rights reserved.
