@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%.venv\Scripts\python.exe"
set "SERVER_PY=%SCRIPT_DIR%server.py"
set "HEALTH_URL=http://127.0.0.1:8765/health"
set "READY_TIMEOUT=35"
set "LOG_DIR=%SCRIPT_DIR%logs"
set "LOG_FILE=%LOG_DIR%\sam2-server.log"
set "LOG_ERR_FILE=%LOG_DIR%\sam2-server.err.log"
if "%SAM2_DEVICE%"=="" set "SAM2_DEVICE=cuda"

if not exist "%PYTHON_EXE%" (
  echo [ERROR] SAM2 venv python not found: %PYTHON_EXE%
  echo [HINT] Run setup first from tools\sam2-local\README.md
  exit /b 1
)

if not exist "%SERVER_PY%" (
  echo [ERROR] server.py not found: %SERVER_PY%
  exit /b 1
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

if defined SAM2_CONFIG (
  if not exist "%SAM2_CONFIG%" (
    echo [WARN] Ignoring invalid SAM2_CONFIG: %SAM2_CONFIG%
    set "SAM2_CONFIG="
  )
)
if defined SAM2_CHECKPOINT (
  if not exist "%SAM2_CHECKPOINT%" (
    echo [WARN] Ignoring invalid SAM2_CHECKPOINT: %SAM2_CHECKPOINT%
    set "SAM2_CHECKPOINT="
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  echo [INFO] Local SAM2 server is already running.
  exit /b 0
)

cd /d "%SCRIPT_DIR%"
echo [INFO] Starting local SAM2 server in background (SAM2_DEVICE=%SAM2_DEVICE%)...
echo [INFO] SAM2 log: %LOG_FILE%
echo [INFO] SAM2 err log: %LOG_ERR_FILE%
echo [%DATE% %TIME%] START SAM2_DEVICE=%SAM2_DEVICE% >> "%LOG_FILE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { " ^
  "  Start-Process -FilePath '%PYTHON_EXE%' -ArgumentList 'server.py' -WorkingDirectory '%SCRIPT_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%LOG_FILE%' -RedirectStandardError '%LOG_ERR_FILE%' | Out-Null; " ^
  "  exit 0 " ^
  "} catch { " ^
  "  Write-Output ('[ERROR] Failed to start SAM2 server: ' + $_.Exception.Message); " ^
  "  exit 1 " ^
  "}"
if errorlevel 1 (
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline = (Get-Date).AddSeconds(%READY_TIMEOUT%); " ^
  "while ((Get-Date) -lt $deadline) { " ^
  "  try { $r = Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; " ^
  "  Start-Sleep -Milliseconds 750; " ^
  "}; exit 1"
if errorlevel 1 (
  echo [WARN] Local SAM2 server did not become ready within %READY_TIMEOUT%s.
  echo [WARN] Check log file: %LOG_FILE%
) else (
  echo [INFO] Local SAM2 server is ready.
)

endlocal
