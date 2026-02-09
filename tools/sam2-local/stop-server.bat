@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$conns = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue; " ^
  "if (-not $conns) { Write-Output '[INFO] No process is listening on port 8765.'; exit 0 }; " ^
  "$procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($procId in $procIds) { " ^
  "  try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Output ('[INFO] Stopped PID ' + $procId) } " ^
  "  catch { Write-Output ('[WARN] Could not stop PID ' + $procId + ': ' + $_.Exception.Message) } " ^
  "}; " ^
  "Write-Output '[INFO] SAM2 local server stop command completed.'"

endlocal
