@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0scripts\windows\ENABLE-SERVER-ACCESS.ps1"
if errorlevel 1 echo Run this file as administrator. If script policy blocks it, contact IT; see README-SERVER.md.
pause
