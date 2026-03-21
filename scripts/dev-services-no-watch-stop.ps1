$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pidDir = Join-Path $root ".dev-services/pids"
$services = @(
  @{ Name = "content-service"; Port = 3002 },
  @{ Name = "knowledge-graph-service"; Port = 3006 },
  @{ Name = "scheduler-service"; Port = 3003 },
  @{ Name = "session-service"; Port = 3004 },
  @{ Name = "user-service"; Port = 3001 }
)

foreach ($service in $services) {
  $pidFile = Join-Path $pidDir ($service.Name + ".pid")

  if (-not (Test-Path $pidFile)) {
    $portProcess = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    if ($portProcess) {
      Stop-Process -Id $portProcess -Force
      Write-Host "Stopped $($service.Name) on port $($service.Port) (PID $portProcess)"
    }
    continue
  }

  $pidLine = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  $targetPid = if ($null -eq $pidLine) { "" } else { $pidLine.ToString().Trim() }

  if ($targetPid -and (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $targetPid -Force
    Write-Host "Stopped $($service.Name) (PID $targetPid)"
  } else {
    $portProcess = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    if ($portProcess) {
      Stop-Process -Id $portProcess -Force
      Write-Host "Stopped $($service.Name) on port $($service.Port) (PID $portProcess)"
    }
  }

  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
