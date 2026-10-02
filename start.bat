@echo off
chcp 65001 >nul
title Immersion AI

echo.
echo  ██╗███╗   ███╗███╗   ███╗███████╗██████╗ ███████╗██╗ ██████╗ ███╗   ██╗
echo  ██║████╗ ████║████╗ ████║██╔════╝██╔══██╗██╔════╝██║██╔═══██╗████╗  ██║
echo  ██║██╔████╔██║██╔████╔██║█████╗  ██████╔╝███████╗██║██║   ██║██╔██╗ ██║
echo  ██║██║╚██╔╝██║██║╚██╔╝██║██╔══╝  ██╔══██╗╚════██║██║██║   ██║██║╚██╗██║
echo  ██║██║ ╚═╝ ██║██║ ╚═╝ ██║███████╗██║  ██║███████║██║╚██████╔╝██║ ╚████║
echo  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found. Install it from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo  [1/2] Installing dependencies...
call corepack pnpm install
if %errorlevel% neq 0 (
    echo  [ERROR] Install failed
    pause
    exit /b 1
)

if not exist "bin\llama-server.exe" (
    echo  [!] llama-server not found.
    echo      Run setup-llama.bat to install it automatically.
    echo.
)

echo.
echo  ✓ Ready! Opening http://localhost:4788
echo  Press Ctrl+C to stop the app.
echo.

:: Open browser after a short delay
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:4788"

echo  [2/2] Starting API and web...
call npx --yes concurrently --kill-others --names api,web ^
    "corepack pnpm --filter @immersion/api dev" ^
    "corepack pnpm --filter @immersion/web dev"
