@echo off
setlocal enabledelayedexpansion
title Phone Screenshot to Downloads and Clipboard
cd /d "%~dp0"

:: -------------------------------------------------------------------
:: Configuration
:: -------------------------------------------------------------------
set "DEFAULT_DEVICE=192.168.68.104:5555"
set "DOWNLOADS_DIR=%USERPROFILE%\Downloads"
set "ADB_EXE=%~dp0adb.exe"

:: Generate unique timestamp (e.g. 20260916_123301)
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"`) do set "TIMESTAMP=%%T"

set "FILENAME=phone_screenshot_!TIMESTAMP!.png"
set "OUTPUT_FILE=%DOWNLOADS_DIR%\!FILENAME!"

:: Optional device override from argument (%1)
set "DEVICE_ARG="
if not "%~1"=="" (
    set "DEVICE_ARG=-s %~1"
) else (
    set "DEVICE_ARG=-s %DEFAULT_DEVICE%"
)

echo ========================================================
echo  Capturing Screenshot from Phone...
echo ========================================================

if not exist "%ADB_EXE%" (
    echo [ERROR] adb.exe not found in %~dp0
    pause
    exit /b 1
)

:: Try capturing with targeted device
"%ADB_EXE%" %DEVICE_ARG% exec-out screencap -p > "%OUTPUT_FILE%" 2>nul

:: Validate file size (must exist and be > 10KB)
set "FILE_OK=0"
if exist "%OUTPUT_FILE%" (
    for %%F in ("%OUTPUT_FILE%") do (
        if %%~zF GTR 10000 set "FILE_OK=1"
    )
)

:: Fallback: if targeted capture failed and user didn't explicitly pass an argument, try default single device
if "!FILE_OK!"=="0" if "%~1"=="" (
    echo [INFO] Retrying capture with auto-detected connected device...
    "%ADB_EXE%" exec-out screencap -p > "%OUTPUT_FILE%" 2>nul
    if exist "%OUTPUT_FILE%" (
        for %%F in ("%OUTPUT_FILE%") do (
            if %%~zF GTR 10000 set "FILE_OK=1"
        )
    )
)

if "!FILE_OK!"=="0" (
    echo.
    echo [ERROR] Screenshot capture failed or file is invalid/empty.
    echo Please make sure your phone is connected and authorized.
    echo Run "adb devices" to check device status.
    echo.
    pause
    exit /b 1
)

:: Copy to Windows Clipboard (as both raw Bitmap image and File drop)
powershell -NoProfile -STA -ExecutionPolicy Bypass -Command ^
  "$p = [System.IO.Path]::GetFullPath('%OUTPUT_FILE%'); " ^
  "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; " ^
  "if (Test-Path $p) { " ^
  "  $bytes = [System.IO.File]::ReadAllBytes($p); " ^
  "  $ms = New-Object System.IO.MemoryStream(,$bytes); " ^
  "  $img = [System.Drawing.Image]::FromStream($ms); " ^
  "  $d = New-Object System.Windows.Forms.DataObject; " ^
  "  $d.SetImage($img); " ^
  "  $f = New-Object System.Collections.Specialized.StringCollection; " ^
  "  [void]$f.Add($p); " ^
  "  $d.SetFileDropList($f); " ^
  "  [System.Windows.Forms.Clipboard]::SetDataObject($d, $true); " ^
  "  $img.Dispose(); " ^
  "  $ms.Dispose(); " ^
  "}"

if %ERRORLEVEL% neq 0 (
    echo [WARNING] Screenshot saved to Downloads, but clipboard copy encountered an issue.
) else (
    echo [OK] Copied to Clipboard - Ready to paste [Ctrl+V]
)

echo [OK] Saved directly to: %OUTPUT_FILE%
echo ========================================================
echo.

:: 2-second pause before auto-closing (if interactive)
ping 127.0.0.1 -n 3 >nul 2>&1
exit /b 0
