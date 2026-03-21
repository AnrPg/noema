$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root ".dev-services"
$pidDir = Join-Path $logDir "pids"
$apps = @(
  @{ Name = "web"; Path = "apps/web"; Port = 3000; StartArgs = @("node_modules/next/dist/bin/next", "start", "--port", "3000") },
  @{ Name = "web-admin"; Path = "apps/web-admin"; Port = 3100; StartArgs = @("node_modules/next/dist/bin/next", "start", "--port", "3100") }
)

New-Item -ItemType Directory -Force $logDir | Out-Null
New-Item -ItemType Directory -Force $pidDir | Out-Null

Push-Location $root
try {
  & pnpm.cmd --filter @noema/web build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & pnpm.cmd --filter @noema/web-admin build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  function Test-ListeningPort([int]$port) {
    return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1)
  }

  foreach ($app in $apps) {
    $pidFile = Join-Path $pidDir ($app.Name + ".pid")

    if (Test-ListeningPort $app.Port) {
      Write-Host "$($app.Name) is already listening on port $($app.Port)"
      continue
    }

    if (Test-Path $pidFile) {
      $existingPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
      if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
        Write-Host "$($app.Name) is already running (PID $existingPid)"
        continue
      }

      Remove-Item $pidFile -ErrorAction SilentlyContinue
    }

    $outLog = Join-Path $logDir ($app.Name + ".out.log")
    $errLog = Join-Path $logDir ($app.Name + ".err.log")
    $appPath = Join-Path $root $app.Path
    $process = Start-Process -FilePath "node.exe" -ArgumentList $app.StartArgs -WorkingDirectory $appPath -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru

    if (-not $process -or -not $process.Id) {
      throw "Failed to start $($app.Name)"
    }

    $startupDeadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $startupDeadline) {
      if (Test-ListeningPort $app.Port) {
        break
      }

      if ($process.HasExited) {
        throw "$($app.Name) exited during startup. See $outLog and $errLog"
      }

      Start-Sleep -Milliseconds 500
    }

    if (-not (Test-ListeningPort $app.Port)) {
      throw "$($app.Name) did not open port $($app.Port). See $outLog and $errLog"
    }

    Set-Content -Path $pidFile -Value $process.Id
    Write-Host "Started $($app.Name) (PID $($process.Id))"
  }
}
finally {
  Pop-Location
}
