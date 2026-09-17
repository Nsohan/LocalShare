# scrcpy & ADB Binaries for LocalShare

LocalShare uses **scrcpy** (by Genymobile) to provide ultra-low latency screen mirroring, remote mouse/keyboard control, and audio streaming for Android devices.

## 📦 How to Bundle Binaries

1. Download the latest Windows release archive from [scrcpy GitHub Releases](https://github.com/genymobile/scrcpy/releases) (e.g. `scrcpy-win64-v3.x.zip`).
2. Extract all contents directly into this folder (`bin/scrcpy/`):
   - `scrcpy.exe`
   - `scrcpy-server`
   - `adb.exe`
   - `AdbWinApi.dll`
   - `AdbWinUsbApi.dll`
   - `avcodec-*.dll`, `avformat-*.dll`, `avutil-*.dll`, `swresample-*.dll`, `swscale-*.dll`
   - `SDL2.dll`
   - `libusb-1.0.dll`

## ⚙️ Fallback Behavior

If this folder does not contain binaries, LocalShare will automatically check the system `PATH` for `scrcpy` and `adb`.
If neither is found, LocalShare will display an informative setup notice with a direct link to download scrcpy.
