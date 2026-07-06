' Double-click this file to launch Vega production build with no CMD windows.
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c """ & shell.CurrentDirectory & "\launch_vega_suite_prod.bat"" hidden prod", 0, False
