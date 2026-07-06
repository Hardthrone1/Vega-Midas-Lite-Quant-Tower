Dim shell, fso, scriptPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd.exe /c """ & scriptPath & "\launch_vega_suite_prod.bat"" hidden prod", 0, False
