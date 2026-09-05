!macro customInstall
    CreateDirectory "$SMPROGRAMS\LocalShare"
    CreateShortCut "$SMPROGRAMS\LocalShare\LocalShare.lnk" "$INSTDIR\LocalShare.exe" "" "$INSTDIR\LocalShare.exe" 0

    ; Create SendTo shortcut
    CreateShortCut "$SENDTO\Send with LocalShare.lnk" "$INSTDIR\LocalShare.exe" "" "$INSTDIR\LocalShare.exe" 0
!macroend

!macro customUninstall
    Delete "$SMPROGRAMS\LocalShare\LocalShare.lnk"
    RMDir "$SMPROGRAMS\LocalShare"

    ; Remove SendTo shortcut
    Delete "$SENDTO\Send with LocalShare.lnk"
!macroend
