@echo off
cd /d "%~dp0\..\.."
node scripts\install-postgres.mjs
if errorlevel 1 (
 pause
 exit /b 1
)
echo PostgreSQL setup complete. Open START-LOCAL-DEV.cmd or START-SERVER.cmd.
pause
