@echo off
title Sprite Animator - Dev Server
echo.
echo ========================================
echo   Starting Sprite Animator...
echo ========================================
echo.

set "SAM2_HEALTH_URL=http://127.0.0.1:8765/health"

:: Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
)

:: Ensure local SAM2 server is running
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing %SAM2_HEALTH_URL% -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
    echo [INFO] Local SAM2 server is not running. Starting it in background...
    if exist "tools\sam2-local\start-server-background.bat" (
        call "tools\sam2-local\start-server-background.bat"
        if errorlevel 1 (
            echo [WARN] Local SAM2 server startup script reported an issue.
            if exist "tools\sam2-local\logs\sam2-server.log" echo [INFO] SAM2 log: tools\sam2-local\logs\sam2-server.log
        ) else (
            echo [INFO] Local SAM2 server is ready.
        )
    ) else (
        echo [WARN] tools\sam2-local\start-server-background.bat not found.
    )
) else (
    echo [INFO] Local SAM2 server already running.
)

:: Open the browser (Vite default is 5173)
echo [INFO] Launching browser...
start http://localhost:5173

:: Start the dev server
echo [INFO] Starting Vite dev server...
call npm run dev

pause
