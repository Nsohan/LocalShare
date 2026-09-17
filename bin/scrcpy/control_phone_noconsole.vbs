' ========================================================
' Launch scrcpy Control Mode without a command window
' ========================================================
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

device = "192.168.68.104:5555"
If WScript.Arguments.Count > 0 Then
    device = WScript.Arguments(0)
End If

strCommand = """" & strDir & "\scrcpy.exe"" -s " & device & " --no-video --no-audio --keyboard=uhid --mouse=uhid"
objShell.Run strCommand, 0, False
