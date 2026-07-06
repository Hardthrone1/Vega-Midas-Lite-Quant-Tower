@echo off
:: Production preview launcher — builds once, serves optimized bundle (no React dev validation).
:: Use this for Lighthouse / performance traces.
start "" wscript.exe //nologo "%~dp0launch_vega_suite_prod.vbs"
exit /b 0
