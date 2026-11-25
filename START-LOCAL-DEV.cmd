@echo off
cd /d "%~dp0"
title COMPOUND QA Local Development
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 24 LTS.
 pause
 exit /b 1
)
node -e "for (const name of ['vite', '@tailwindcss/vite', 'tailwindcss']) { try { require.resolve(name) } catch { process.exit(1) } }"
if errorlevel 1 (
 call npm install
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
call npm run dev
pause
