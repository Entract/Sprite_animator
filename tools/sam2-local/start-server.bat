@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%.venv\Scripts\python.exe"
set "SERVER_PY=%SCRIPT_DIR%server.py"
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

cd /d "%SCRIPT_DIR%"
echo [INFO] Starting local SAM2 server (SAM2_DEVICE=%SAM2_DEVICE%)...
"%PYTHON_EXE%" "%SERVER_PY%"

endlocal
