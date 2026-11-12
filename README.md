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
  - **📱 Your Devices**: Auto-discover Tasker/mobile companion servers on your active LAN (`/alive`), pair via 6-digit **Confirm on Phone** (`/pair` with Connect/Cancel), monitor live Online/Checking/Offline status, latency, battery level, and sound mode, and automatically relocate devices when Wi-Fi IPs change.
  - **🪞 Screen Mirror & Control (scrcpy)**: Ultra-low latency Android screen mirroring, mouse/keyboard input, audio streaming, Wi-Fi TCP/IP mode switching, recording to MP4, and customizable resolution/bitrate presets.
  - **API Explorer**: Built-in REST API reference with copyable `curl` examples.
  - **Settings**: Windows autostart toggle, notifications mute, custom server port selector, theme switcher, and device auto-discovery / companion probe settings.
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

### 3. Pairing & Tracking Local Devices ("Your Devices")
1. Open the dashboard and navigate to **"Your Devices"** in the sidebar.
2. Click **"Add Device"** (or press the **+** button).
3. LocalShare scans your active local subnet on port `8000` (`GET /alive`) and lists discovered phones with their model name, IP, battery level, and sound mode.
4. Click your phone in the scan list. LocalShare generates a **6-digit verification code** and sends `GET /pair?key=<code>&pc=<PC-NAME>` every 1 second (up to 60 seconds).
5. On your phone, verify that the 6-digit code matches the PC screen and tap **Connect** (or tap **Cancel** to deny immediately).
6. Once accepted, the device appears in **Your Devices** with live status (`Connected` / `Checking...` / `Offline`), ping latency, battery level, and sound mode. If your phone gets a new IP on another Wi-Fi network or after sleep/wake, LocalShare automatically relocates and updates it.
7. Manual fallback: expand **"Manual IP + PIN (legacy)"** inside the Add Device modal to pair directly by IP and port, or click **"(?) JSON Format"** to view the phone endpoint specification.

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

### 📱 Device Discovery & Pairing Protocol ("Your Devices")

Your phone companion (for example, Tasker HTTP Request profiles on port `8000`) implements two lightweight HTTP GET endpoints:

#### 1. Liveness & Auto-Discovery (`GET /alive`, Port `8000`)
Used by **"Find My Phone"**, background liveness polling, and cross-network IP relocation. Must return a `200 OK` JSON object (max 4 KB, no redirects):
```json
{
  "phoneModel": "CPH2487",
  "batteryLevel": 78,
  "mode": "General",
  "deviceId": "optional-stable-id"
}
```
- `phoneModel` (required): non-empty string (1–64 chars).
- `batteryLevel`, `mode`, `deviceId` (optional): rendered live on the device card and used for stable device matching across IP changes.

#### 2. Confirm-on-Phone Pairing (`GET /pair?key=482910&pc=SOHAN-PC`, Port `8000`)
LocalShare sends `key` and `pc` query parameters (plus headers `X-Pairing-Key` and `X-Device-Type: desktop`) every 1 second for up to 60 seconds:

- **Waiting for user tap (`202 Accepted`)**:
  ```json
  { "status": "pending", "message": "Waiting for confirmation on phone" }
  ```
- **User tapped Connect (`200 OK`)**:
  ```json
  {
    "success": true,
    "paired": true,
    "status": "accepted",
    "phoneModel": "CPH2487",
    "batteryLevel": 78,
    "mode": "General",
    "deviceId": "optional-stable-id",
    "token": "optional-shared-token"
  }
  ```
- **User tapped Cancel (`403 Forbidden`)**:
  ```json
  { "status": "denied", "message": "Pairing denied on phone" }
  ```

> **Optional `X-LocalShare-Token` header:** If `/pair` returns a non-empty `token` string on acceptance, LocalShare saves it with the device record and includes `X-LocalShare-Token: <token>` on background fast-path `/alive` checks to that paired phone's origin. Discovery and cross-network relocation scans omit the token so it is never sent to unknown LAN hosts.

#### Quick PowerShell Verification
```powershell
Invoke-WebRequest -Uri "http://<PHONE-IP>:8000/alive" -UseBasicParsing
Invoke-WebRequest -Uri "http://<PHONE-IP>:8000/pair?key=482910&pc=$env:COMPUTERNAME" -UseBasicParsing
```

---

## 🛠️ Project Structure

```
LocalShare/
├── bin/
│   └── scrcpy/              # Bundled scrcpy & adb binaries for Screen Mirror
├── doc/
│   └── RELEASE_GUIDE.md
├── public/
│   ├── favicon.ico
│   ├── icon.png
│   └── index.html           # Web client redirect
├── src/
│   ├── config/
│   │   ├── config.js        # Persistent JSON config management
│   │   └── logger.js        # Daily rotating logger
│   ├── main/
│   │   ├── main.js          # Main Electron process, IPC hub, server supervisor
│   │   ├── lanScanner.js    # Adapter selection, subnet host enumeration, bounded /alive probe
│   │   ├── devicePairing.js # Confirm-on-phone pairing session & device identity/dedup helpers
│   │   ├── deviceWatcher.js # Background liveness state machine & cross-network IP relocation
│   │   ├── scrcpy.js        # Screen Mirror & ADB wireless/USB controller
│   │   ├── tray.js          # Windows System Tray menu manager
│   │   ├── utils.js         # Local IPv4 network discovery & filename sanitization
│   │   └── windows/
│   │       └── dashboard.js # Unified dashboard window manager
│   ├── pages/
│   │   ├── dashboard/       # Desktop Dashboard UI
│   │   │   ├── views/       # HTML section partials (files, connect, devices, mirror, api, settings, about, modals/)
│   │   │   ├── css/         # Modular section stylesheets
│   │   │   ├── js/          # Section controller scripts
│   │   │   ├── index.html   # Main dashboard layout skeleton
│   │   │   ├── style.css    # Unified stylesheet aggregator
│   │   │   └── script.js    # Section orchestrator & IPC coordinator
│   │   └── home/            # Mobile & Web Client interface (HTML/CSS/JS)
│   └── server/
│       ├── server.js        # Express HTTP server process (runs in child process)
│       ├── routes.js        # Express routes
│       ├── utils.js         # Server network helpers
│       └── controllers/
│           ├── fileController.js # Multer upload & download streaming
│           └── apiController.js  # API data handlers
├── icon.png
├── installer.nsh            # NSIS installer config (SendTo context menu setup)
├── package.json
└── release.ps1
```

---

## ⚙️ Configuration

Application settings are stored in your user profile:
- **Windows**: `%APPDATA%\LocalShare\config.json`
- **Logs**: `%APPDATA%\LocalShare\logs\localshare-YYYY-MM-DD.log`

Configurable options include:
- `autostart`: Start LocalShare automatically on Windows login (`true`).
- `openDashboardAtStart`: Show the dashboard window on launch or start silently in the tray (`true`).
- `notifications`: Enable or mute Windows desktop alerts (`true`).
- `port`: Port used by the HTTP file-sharing server (`5199`).
- `theme`: UI theme (`dark`, `light`, `system`).
- `deviceAutoConnect`: Monitor paired phones in the background and relocate them if their IP changes (`true`).
- `deviceAutoScanNewNetworks`: Automatically scan unfamiliar subnets during device relocation; turn off to auto-scan only previously seen networks (`true`).
- `deviceScanPort`: Default port used for phone `/alive` discovery and `/pair` confirmation (`8000`).
- `deviceProbePath`: Default HTTP path probed on phones during discovery and health checks (`/alive`).
- `knownNetworkSignatures`: Adapter/subnet signatures remembered from previous successful connections/pairings.

---

## 👤 Author

**Nasimul Hoque Sohan**
- Email: [nhsohan3@gmail.com](mailto:nhsohan3@gmail.com)

---

## 📄 License

Copyright &copy; 2025-2026 Nasimul Hoque Sohan. All rights reserved.
