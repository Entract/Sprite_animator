@echo off
title Sprite Animator - Dev Server
echo.
echo ========================================
echo   Starting Sprite Animator...
echo ========================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
)

:: Open the browser (Vite default is 5173)
echo [INFO] Launching browser...
start http://localhost:5173

:: Start the dev server
echo [INFO] Starting Vite dev server...
call npm run dev

pause
