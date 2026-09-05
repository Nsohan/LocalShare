!macro customInit
    nsExec::Exec 'taskkill /F /IM LocalShare.exe'
!macroend

!macro customInstall
    ; Create SendTo shortcut for right-click Explorer integration
    CreateShortCut "$SENDTO\Send with LocalShare.lnk" "$INSTDIR\LocalShare.exe" "" "$INSTDIR\LocalShare.exe" 0
!macroend

!macro customUninstall
    ; Remove SendTo shortcut
    Delete "$SENDTO\Send with LocalShare.lnk"
!macroend
