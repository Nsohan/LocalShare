@echo off
setlocal enabledelayedexpansion
title scrcpy Master Control Panel
cd /d "%~dp0"

:: -------------------------------------------------------------------
:: Check Connected ADB Devices on Startup
:: -------------------------------------------------------------------
cls
echo ================================================================
echo  Checking connected ADB devices...
echo ================================================================
echo.

set "DEVICE="
for /f "tokens=1,2" %%A in ('adb.exe devices ^| findstr /v /i "List of devices"') do (
    if "%%B"=="device" (
        if not defined DEVICE set "DEVICE=%%A"
    )
)

if defined DEVICE (
    echo [OK] Active device found: !DEVICE!
    ping 127.0.0.1 -n 2 >nul 2>&1
    goto MENU
)

:: If no device found, prompt for IP with pre-typed 192.168.
echo [!] No connected ADB device found.
echo.
call :PROMPT_IP
goto MENU

:MENU
cls
echo ================================================================
echo                    SCRCPY MASTER TOOLBOX
echo ================================================================
echo  Active Target Device : %DEVICE%
echo ================================================================
echo.
echo   [1] Control Phone        (UHID Keyboard ^& Mouse, No Screen)
echo   [2] Take Screenshot      (Save to Downloads + Copy to Clipboard)
echo   [3] Live Screen Mode     (Full Screen Mirroring + Audio + Control)
echo   [4] Screen Mode (Stealth)(Mirror on PC, Turn Phone Screen OFF)
echo   [5] Record Screen to MP4 (Direct save to Downloads)
echo   [6] Camera Mode          (Use Phone as HD Webcam)
echo   [7] Connect / Change IP  (Switch IP or reconnect device)
echo   [8] Device Info ^& Status (Check adb devices and phone battery)
echo.
echo   [9] Exit
echo ================================================================
set "CHOICE="
set /p "CHOICE=Enter option [1-9] and press Enter: "
if defined CHOICE set "CHOICE=!CHOICE: =!"

if "%CHOICE%"=="1" goto OP_CONTROL
if "%CHOICE%"=="2" goto OP_SCREENSHOT
if "%CHOICE%"=="3" goto OP_LIVE
if "%CHOICE%"=="4" goto OP_STEALTH
if "%CHOICE%"=="5" goto OP_RECORD
if "%CHOICE%"=="6" goto OP_CAMERA
if "%CHOICE%"=="7" goto OP_CONNECT
if "%CHOICE%"=="8" goto OP_STATUS
if "%CHOICE%"=="9" goto OP_EXIT

echo.
echo [!] Invalid option. Please enter a number from 1 to 9 and press Enter.
ping 127.0.0.1 -n 2 >nul 2>&1
goto MENU

:OP_CONTROL
cls
echo ================================================================
echo  Starting Control Mode (UHID Keyboard ^& Mouse)
echo  Device: %DEVICE%
echo ================================================================
echo.
"%~dp0scrcpy.exe" -s %DEVICE% --no-video --no-audio --keyboard=uhid --mouse=uhid
echo.
pause
goto MENU

:OP_SCREENSHOT
cls
echo ================================================================
echo  Taking Screenshot
echo  Device: %DEVICE%
echo ================================================================
echo.
call "%~dp0take_screenshot.bat" "%DEVICE%"
echo.
pause
goto MENU

:OP_LIVE
cls
echo ================================================================
echo  Starting Live Screen Mirroring
echo  Device: %DEVICE%
echo ================================================================
echo.
"%~dp0scrcpy.exe" -s %DEVICE%
echo.
pause
goto MENU

:OP_STEALTH
cls
echo ================================================================
echo  Starting Live Screen Mirroring (Phone Screen OFF)
echo  Device: %DEVICE%
echo  Note  : Phone physical display turns off to save battery
echo ================================================================
echo.
"%~dp0scrcpy.exe" -s %DEVICE% --turn-screen-off --stay-awake
echo.
pause
goto MENU

:OP_RECORD
cls
echo ================================================================
echo  Record Screen to MP4
echo  Device: %DEVICE%
echo ================================================================
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"`) do set "RECTIME=%%T"
set "REC_FILE=%USERPROFILE%\Downloads\phone_recording_!RECTIME!.mp4"
echo Saving to: !REC_FILE!
echo (Mirroring will start now. Close the window to save the recording.)
echo.
"%~dp0scrcpy.exe" -s %DEVICE% --record="!REC_FILE!"
echo.
if exist "!REC_FILE!" (
    echo [OK] Screen recording saved successfully to:
    echo      !REC_FILE!
)
echo.
pause
goto MENU

:OP_CAMERA
cls
echo ================================================================
echo  Starting Camera Mode (Webcam)
echo  Device: %DEVICE%
echo ================================================================
echo.
"%~dp0scrcpy.exe" -s %DEVICE% --video-source=camera
echo.
pause
goto MENU

:OP_CONNECT
cls
echo ================================================================
echo  Connect / Change Device IP
echo ================================================================
echo  Current Device : %DEVICE%
echo.
call :PROMPT_IP
goto MENU

:OP_STATUS
cls
echo ================================================================
echo  ADB Device List ^& Status
echo ================================================================
echo.
"%~dp0adb.exe" devices -l
echo.
echo ----------------------------------------------------------------
echo  Battery Info for %DEVICE%:
echo ----------------------------------------------------------------
"%~dp0adb.exe" -s %DEVICE% shell dumpsys battery 2>nul | findstr /i "level status scale voltage temperature health"
echo.
pause
goto MENU

:OP_EXIT
cls
echo.
echo Exiting scrcpy Master Toolbox. Goodbye!
ping 127.0.0.1 -n 2 >nul 2>&1
exit /b 0

:: -------------------------------------------------------------------
:: Subroutine: Prompt IP with pre-typed 192.168.
:: -------------------------------------------------------------------
:PROMPT_IP
echo Please enter your phone's Wi-Fi IP address:
echo (Pre-filled with 192.168. - finish typing and press Enter)
echo.

> "%TEMP%\prefill_ip.vbs" echo Set WshShell = CreateObject("WScript.Shell")
>> "%TEMP%\prefill_ip.vbs" echo WScript.Sleep 50
>> "%TEMP%\prefill_ip.vbs" echo WshShell.SendKeys "192.168."
start "" /b wscript "%TEMP%\prefill_ip.vbs"

set "USER_IP="
set /p "USER_IP=Device IP: "
if exist "%TEMP%\prefill_ip.vbs" del "%TEMP%\prefill_ip.vbs" >nul 2>&1

:: If user pressed Enter without input, use default
if "!USER_IP!"=="" set "USER_IP=192.168.68.104:5555"

:: If user typed without 192.168. prefix, add it
set "PREFIX=!USER_IP:~0,8!"
if not "!PREFIX!"=="192.168." (
    set "USER_IP=192.168.!USER_IP!"
)

:: Ensure port (:5555) is present
echo !USER_IP! | findstr ":" >nul 2>&1
if !ERRORLEVEL! neq 0 (
    set "USER_IP=!USER_IP!:5555"
)

set "DEVICE=!USER_IP!"
echo.
echo Connecting to !DEVICE! via ADB...
"%~dp0adb.exe" connect !DEVICE!
echo.
ping 127.0.0.1 -n 2 >nul 2>&1
exit /b 0
