@echo off
:: Production preview launcher — builds once, serves optimized bundle (no React dev validation).
:: Use this for Lighthouse / performance traces.
start "" wscript.exe //nologo "%~dp0launch_Vega_suite.vbs" prod
exit /b 0
