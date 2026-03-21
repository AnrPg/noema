param(
  [Parameter(Mandatory = $true)]
  [string]$ScriptPath,

  [Parameter(Mandatory = $true)]
  [string]$LogName
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root ".dev-services"

New-Item -ItemType Directory -Force $logDir | Out-Null

$resolvedScript = Join-Path $root $ScriptPath
$outLog = Join-Path $logDir ($LogName + ".launcher.out.log")
$errLog = Join-Path $logDir ($LogName + ".launcher.err.log")

$process = Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $resolvedScript
) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

Write-Host "Launched $LogName startup in background (PID $($process.Id))"
Write-Host "Launcher logs: $outLog and $errLog"
