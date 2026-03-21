$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root ".dev-services"
$pidDir = Join-Path $logDir "pids"
$services = @(
  @{ Name = "content-service"; Path = "services/content-service"; Package = "@noema/content-service"; Port = 3002 },
  @{ Name = "knowledge-graph-service"; Path = "services/knowledge-graph-service"; Package = "@noema/knowledge-graph-service"; Port = 3006 },
  @{ Name = "scheduler-service"; Path = "services/scheduler-service"; Package = "@noema/scheduler-service"; Port = 3003 },
  @{ Name = "session-service"; Path = "services/session-service"; Package = "@noema/session-service"; Port = 3004 },
  @{ Name = "user-service"; Path = "services/user-service"; Package = "@noema/user-service"; Port = 3001 }
)
$requiredInfraPorts = @(5434, 6380, 7687, 9002)
$dockerExe = (Get-Command docker -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
if (-not $dockerExe) {
  $fallbackDocker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  if (Test-Path $fallbackDocker) {
    $dockerExe = $fallbackDocker
  }
}

New-Item -ItemType Directory -Force $logDir | Out-Null
New-Item -ItemType Directory -Force $pidDir | Out-Null

function Get-PidFromFile([string]$pidFile) {
  if (-not (Test-Path $pidFile)) {
    return $null
  }

  $rawValue = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($rawValue)) {
    return $null
  }

  return $rawValue.Trim()
}

function Test-ListeningPort([int]$port) {
  return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Wait-ForPorts([int[]]$ports, [int]$timeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $missing = $ports | Where-Object { -not (Test-ListeningPort $_) }
    if ($missing.Count -eq 0) {
      return
    }

    Start-Sleep -Seconds 2
  }

  $missingPorts = $ports | Where-Object { -not (Test-ListeningPort $_) }
  if ($missingPorts.Count -gt 0) {
    throw "Required infrastructure ports are not available: $($missingPorts -join ', ')"
  }
}

function Invoke-LoggedCommand([string]$workingDirectory, [string[]]$arguments, [string]$logPrefix) {
  $stdout = Join-Path $logDir ($logPrefix + ".out.log")
  $stderr = Join-Path $logDir ($logPrefix + ".err.log")
  Push-Location $workingDirectory
  try {
    $joinedArgs = $arguments | ForEach-Object { $_.Replace('"', '\"') }
    $commandLine = 'pnpm.cmd ' + ($joinedArgs -join ' ') + " 1>`"$stdout`" 2>`"$stderr`""
    & cmd.exe /c $commandLine
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed for $logPrefix. See $stdout and $stderr"
    }
  }
  finally {
    Pop-Location
  }
}

function Invoke-DockerComposeUp() {
  if (-not $dockerExe) {
    throw "Docker CLI was not found on PATH or in the default Docker Desktop location."
  }

  $stdout = Join-Path $logDir "docker-up.out.log"
  $stderr = Join-Path $logDir "docker-up.err.log"
  Push-Location $root
  try {
    & $dockerExe compose -f docker-compose.yml -f docker-compose.local.yml up -d 1> $stdout 2> $stderr
    if ($LASTEXITCODE -ne 0) {
      throw "Docker compose up failed. See $stdout and $stderr"
    }
  }
  finally {
    Pop-Location
  }
}

Push-Location $root
try {
  $missingInfraPorts = $requiredInfraPorts | Where-Object { -not (Test-ListeningPort $_) }
  if ($missingInfraPorts.Count -gt 0) {
    try {
      Invoke-DockerComposeUp
    }
    catch {
      Write-Warning "docker:up reported a failure; continuing to wait for infrastructure ports."
    }
  }

  Wait-ForPorts $requiredInfraPorts

  Invoke-LoggedCommand $root @("run", "build:packages") "build-packages"

  foreach ($service in $services) {
    Invoke-LoggedCommand $root @("--filter", $service.Package, "build") ($service.Name + ".build")
  }

  foreach ($service in $services) {
    $pidFile = Join-Path $pidDir ($service.Name + ".pid")

    if (Test-ListeningPort $service.Port) {
      Write-Host "$($service.Name) is already listening on port $($service.Port)"
      continue
    }

    $existingPid = Get-PidFromFile $pidFile
    if ($existingPid) {
      if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
        Write-Host "$($service.Name) is already running (PID $existingPid)"
        continue
      } 

      Remove-Item $pidFile -ErrorAction SilentlyContinue
    }

    $outLog = Join-Path $logDir ($service.Name + ".out.log")
    $errLog = Join-Path $logDir ($service.Name + ".err.log")
    $servicePath = Join-Path $root $service.Path
    $process = Start-Process -FilePath "node.exe" -ArgumentList @("--env-file=.env", "dist/index.js") -WorkingDirectory $servicePath -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru

    if (-not $process -or -not $process.Id) {
      throw "Failed to start $($service.Name)"
    }

    $startupDeadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $startupDeadline) {
      if (Test-ListeningPort $service.Port) {
        break
      }

      if ($process.HasExited) {
        throw "$($service.Name) exited during startup. See $outLog and $errLog"
      }

      Start-Sleep -Milliseconds 500
    }

    if (-not (Test-ListeningPort $service.Port)) {
      throw "$($service.Name) did not open port $($service.Port). See $outLog and $errLog"
    }

    Set-Content -Path $pidFile -Value $process.Id
    Write-Host "Started $($service.Name) (PID $($process.Id))"
  }
}
finally {
  Pop-Location
}
