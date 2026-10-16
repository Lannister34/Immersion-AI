@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"
if %errorlevel% neq 0 (
    echo  [ERROR] Cannot open the folder that holds start.bat
    pause
    exit /b 1
)
title Immersion AI

echo.
echo  ██╗███╗   ███╗███╗   ███╗███████╗██████╗ ███████╗██╗ ██████╗ ███╗   ██╗
echo  ██║████╗ ████║████╗ ████║██╔════╝██╔══██╗██╔════╝██║██╔═══██╗████╗  ██║
echo  ██║██╔████╔██║██╔████╔██║█████╗  ██████╔╝███████╗██║██║   ██║██╔██╗ ██║
echo  ██║██║╚██╔╝██║██║╚██╔╝██║██╔══╝  ██╔══██╗╚════██║██║██║   ██║██║╚██╗██║
echo  ██║██║ ╚═╝ ██║██║ ╚═╝ ██║███████╗██║  ██║███████║██║╚██████╔╝██║ ╚████║
echo  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found. Install it from https://nodejs.org/
    echo.
    pause
    set "launch_status=1"
    goto leave_folder
)

echo  [1/2] Installing dependencies...
call corepack pnpm install --frozen-lockfile
if %errorlevel% neq 0 (
    echo  [ERROR] Install failed
    pause
    set "launch_status=1"
    goto leave_folder
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

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:4788"

echo  [2/2] Starting API and web...
call corepack pnpm --parallel --filter @immersion/api --filter @immersion/web run dev
set "launch_status=%errorlevel%"

:leave_folder
popd
exit /b %launch_status%
