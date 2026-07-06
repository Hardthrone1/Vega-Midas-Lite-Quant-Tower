' Double-click this file (or stop_vega_suite.bat) to stop Vega with no CMD windows.
Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & root & "\Vega-kill.ps1""", 0, True
