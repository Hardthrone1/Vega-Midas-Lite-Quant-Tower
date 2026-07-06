' Double-click launch_vega_suite.bat (dev) or launch_vega_suite_prod.bat (production preview).
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

Dim modeArg
modeArg = ""
If WScript.Arguments.Count > 0 Then
  modeArg = " " & WScript.Arguments(0)
End If

shell.Run "cmd /c """ & shell.CurrentDirectory & "\launch_vega_suite.bat"" hidden" & modeArg, 0, False
