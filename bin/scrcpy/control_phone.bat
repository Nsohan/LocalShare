@echo off
setlocal enabledelayedexpansion
title scrcpy - Control Mode (UHID)
cd /d "%~dp0"

:: -------------------------------------------------------------------
:: Target device IP and port (Default: 192.168.68.104:5555)
:: You can change this below or pass it as an argument:
::   control_phone.bat 192.168.68.106:5555
:: -------------------------------------------------------------------
set "DEVICE=192.168.68.104:5555"

:: If a device serial/IP was passed as argument, use that instead
if not "%~1"=="" set "DEVICE=%~1"

echo ========================================================
echo  Starting scrcpy in Control Mode (No Video / No Audio)
echo  Device   : %DEVICE%
echo  Controls : Keyboard (UHID) ^& Mouse (UHID)
echo ========================================================
echo.

"%~dp0scrcpy.exe" -s %DEVICE% --no-video --no-audio --keyboard=uhid --mouse=uhid

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] scrcpy exited with error code %ERRORLEVEL%.
    echo.
    echo Troubleshooting:
    echo  1. Make sure your phone has Wireless Debugging enabled.
    echo  2. Verify the IP address (%DEVICE%). Run "adb devices" to check.
    echo  3. To connect to a different IP, run:
    echo        control_phone.bat ^<NEW_IP:PORT^>
    echo.
    pause
)
