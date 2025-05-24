!macro customInstall
    CreateDirectory "$SMPROGRAMS\LocalShare"
    CreateShortCut "$SMPROGRAMS\LocalShare\LocalShare.lnk" "$INSTDIR\LocalShare.exe" "" "$INSTDIR\icon.ico"

    ; Create SendTo shortcut
    CreateShortCut "$SENDTO\Send with LocalShare.lnk" "$INSTDIR\LocalShare.exe" "" "$INSTDIR\icon.ico"
!macroend

!macro customUninstall
    Delete "$SMPROGRAMS\LocalShare\LocalShare.lnk"
    RMDir "$SMPROGRAMS\LocalShare"

    ; Remove SendTo shortcut
    Delete "$SENDTO\Send with LocalShare.lnk"
!macroend
