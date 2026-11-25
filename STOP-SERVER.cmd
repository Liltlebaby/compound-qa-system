@echo off
setlocal
cd /d "%~dp0"
set "QA_NODE=%~dp0runtime\node.exe"
if not exist "%QA_NODE%" set "QA_NODE=node.exe"
"%QA_NODE%" "%~dp0dist\server-tools.mjs" stop
if errorlevel 1 (
 echo.
 echo Operation failed. See README-SERVER.md and data\logs\server.log
 pause
 exit /b 1
)
echo.
pause
