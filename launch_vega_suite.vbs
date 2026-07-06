Dim shell, fso, scriptPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd.exe /c """ & scriptPath & "\launch_vega_suite.bat"" hidden", 0, False
