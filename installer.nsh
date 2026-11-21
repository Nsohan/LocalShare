!macro customCheckAppRunning
    nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
    Sleep 1500
!macroend

!macro customInit
    nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
    Sleep 1000
!macroend

!macro customUnInit
    unLoop:
        nsExec::Exec `cmd.exe /c tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO csv | find.exe "${APP_EXECUTABLE_FILENAME}"`
        Pop $0
        ${If} $0 == 0
            MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME} is currently running.$\r$\nPlease exit ${PRODUCT_NAME} from the system tray (right-click the tray icon and select Exit) and try again." IDRETRY unLoop
            Abort
        ${EndIf}
!macroend

!macro customInstall
    ; Create SendTo shortcut for right-click Explorer integration
    CreateShortCut "$SENDTO\Send with LocalShare.lnk" "$INSTDIR\LocalShare.exe" "" "$INSTDIR\LocalShare.exe" 0
!macroend

!macro customUninstall
    ; Remove SendTo shortcut
    Delete "$SENDTO\Send with LocalShare.lnk"
!macroend
