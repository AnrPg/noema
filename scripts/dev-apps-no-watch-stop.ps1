$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pidDir = Join-Path $root ".dev-services/pids"
$apps = @(
  @{ Name = "web"; Port = 3000 },
  @{ Name = "web-admin"; Port = 3100 }
)

foreach ($app in $apps) {
  $pidFile = Join-Path $pidDir ($app.Name + ".pid")

  if (-not (Test-Path $pidFile)) {
    $portProcess = Get-NetTCPConnection -State Listen -LocalPort $app.Port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    if ($portProcess) {
      Stop-Process -Id $portProcess -Force
      Write-Host "Stopped $($app.Name) on port $($app.Port) (PID $portProcess)"
    }
    continue
  }

  $pidLine = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  $targetPid = if ($null -eq $pidLine) { "" } else { $pidLine.ToString().Trim() }

  if ($targetPid -and (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $targetPid -Force
    Write-Host "Stopped $($app.Name) (PID $targetPid)"
  } else {
    $portProcess = Get-NetTCPConnection -State Listen -LocalPort $app.Port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    if ($portProcess) {
      Stop-Process -Id $portProcess -Force
      Write-Host "Stopped $($app.Name) on port $($app.Port) (PID $portProcess)"
    }
  }

  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
