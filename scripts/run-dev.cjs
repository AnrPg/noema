const { spawnSync } = require('node:child_process');

const mode = process.argv[2] ?? 'dev';
const isWindows = process.platform === 'win32';
const repoRoot = process.cwd();
const normalizedRepoRoot = repoRoot.toLowerCase();

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 0);
}

function runPnpm(args) {
  const result = spawnSync(isWindows ? 'pnpm.cmd' : 'pnpm', args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: isWindows,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 0;
}

function prepareSharedInfra(selectedMode) {
  if (selectedMode !== 'dev:web+api') {
    return;
  }

  const result = spawnSync(process.execPath, ['./scripts/ensure-dev-infra.cjs', 'web+api'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requiredPortsFor(selectedMode) {
  switch (selectedMode) {
    case 'dev:web':
      return [3000];
    case 'dev:web-admin':
      return [3100];
    case 'dev:web+api':
      return [3000, 3001, 3002, 3003, 3004, 3006, 3007, 3009, 3012, 3016, 3017];
    case 'dev:admin-stack':
      return [3001, 3002, 3006, 3100];
    default:
      return [];
  }
}

function prepareWindowsDevPorts(selectedMode) {
  const ports = requiredPortsFor(selectedMode);
  if (ports.length === 0) {
    return;
  }

  const script = `
$ErrorActionPreference = 'Stop'
$repoRoot = '${normalizedRepoRoot}'
$ports = @(${ports.join(', ')})

function Get-ProcessTable {
  $table = @{}
  foreach ($process in Get-CimInstance Win32_Process) {
    $table[[int]$process.ProcessId] = $process
  }

  return $table
}

function Test-IsRepoOwnedProcess([int]$processId, $processTable) {
  $visited = New-Object 'System.Collections.Generic.HashSet[int]'
  $currentId = $processId

  while ($currentId -gt 0 -and $visited.Add($currentId)) {
    $process = $processTable[$currentId]
    if ($null -eq $process) {
      return $false
    }

    $commandLine = [string]$process.CommandLine
    if (-not [string]::IsNullOrWhiteSpace($commandLine) -and $commandLine.ToLower().Contains($repoRoot)) {
      return $true
    }

    $currentId = [int]$process.ParentProcessId
  }

  return $false
}

function Test-IsLikelyStaleDevListener([int]$processId, $processTable) {
  if (Test-IsRepoOwnedProcess $processId $processTable) {
    return $true
  }

  $process = $processTable[$processId]
  if ($null -eq $process) {
    return $false
  }

  $name = [string]$process.Name
  $commandLine = [string]$process.CommandLine
  return [string]::IsNullOrWhiteSpace($commandLine) -and ($name -eq 'node.exe' -or $name -eq 'cmd.exe')
}

function Get-PortListeners([int[]]$requestedPorts) {
  $listeners = @()
  foreach ($port in $requestedPorts) {
    $listeners += Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  }

  return $listeners | Sort-Object -Property LocalPort, OwningProcess -Unique
}

function Stop-ProcessTree([int]$processId, $processTable) {
  $toVisit = New-Object 'System.Collections.Generic.Queue[int]'
  $collected = New-Object 'System.Collections.Generic.List[int]'
  $visited = New-Object 'System.Collections.Generic.HashSet[int]'
  $toVisit.Enqueue($processId)

  while ($toVisit.Count -gt 0) {
    $currentId = $toVisit.Dequeue()
    if (-not $visited.Add($currentId)) {
      continue
    }

    $collected.Add($currentId)

    foreach ($candidate in $processTable.Values) {
      if ([int]$candidate.ParentProcessId -eq $currentId) {
        $toVisit.Enqueue([int]$candidate.ProcessId)
      }
    }
  }

  for ($index = $collected.Count - 1; $index -ge 0; $index--) {
    Stop-Process -Id $collected[$index] -Force -ErrorAction SilentlyContinue
  }
}

$processTable = Get-ProcessTable
$listeners = Get-PortListeners $ports

foreach ($listener in $listeners) {
  $listenerPid = [int]$listener.OwningProcess
  if (Test-IsLikelyStaleDevListener $listenerPid $processTable) {
    Write-Host "[run-dev] Releasing stale Noema dev listener on port $($listener.LocalPort) (PID $listenerPid)"
    Stop-ProcessTree $listenerPid $processTable
  }
}

Start-Sleep -Seconds 2
$processTable = Get-ProcessTable
$remainingListeners = Get-PortListeners $ports
$blockingListeners = @()

foreach ($listener in $remainingListeners) {
  $listenerPid = [int]$listener.OwningProcess
  if (-not (Test-IsLikelyStaleDevListener $listenerPid $processTable)) {
    $process = $processTable[$listenerPid]
    $blockingListeners += [PSCustomObject]@{
      Port = [int]$listener.LocalPort
      ProcessId = $listenerPid
      Name = if ($null -ne $process) { [string]$process.Name } else { '' }
      CommandLine = if ($null -ne $process) { [string]$process.CommandLine } else { '' }
    }
  }
}

if ($blockingListeners.Count -gt 0) {
  $message = $blockingListeners | ConvertTo-Json -Compress
  Write-Error "Required dev ports are already in use by non-Noema processes: $message"
}
`;

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
    }
  );

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function turboArgsFor(selectedMode) {
  switch (selectedMode) {
    case 'dev':
      return ['run', 'dev', '--concurrency=20'];
    case 'dev:web':
      return ['run', 'dev', '--filter=@noema/web'];
    case 'dev:web-admin':
      return ['run', 'dev', '--filter=@noema/web-admin'];
    case 'dev:mobile':
      return ['run', 'dev', '--filter=@noema/mobile'];
    case 'dev:services':
      return ['run', 'dev', "--filter=./services/*"];
    case 'dev:content':
      return ['run', 'dev', '--filter=@noema/content-service'];
    case 'dev:session':
      return ['run', 'dev', '--filter=@noema/session-service'];
    case 'dev:scheduler':
      return ['run', 'dev', '--filter=@noema/scheduler-service'];
    case 'dev:user':
      return ['run', 'dev', '--filter=@noema/user-service'];
    case 'dev:kg':
      return ['run', 'dev', '--filter=@noema/knowledge-graph-service'];
    case 'dev:web+api':
      return [
        'run',
        'dev',
        '--concurrency=12',
        '--filter=@noema/web',
        '--filter=@noema/content-service',
        '--filter=@noema/knowledge-graph-service',
        '--filter=@noema/session-service',
        '--filter=@noema/user-service',
        '--filter=@noema/scheduler-service',
        '--filter=@noema/metacognition-service',
        '--filter=@noema/curriculum-service',
        '--filter=@noema/pedagogy-guardian-service',
        '--filter=@noema/ingestion-service',
        '--filter=@noema/vector-service',
      ];
    case 'dev:admin-stack':
      return [
        'run',
        'dev',
        '--filter=@noema/web-admin',
        '--filter=@noema/content-service',
        '--filter=@noema/user-service',
        '--filter=@noema/knowledge-graph-service',
      ];
    case 'dev:all':
      return [
        'run',
        'dev',
        '--filter=@noema/web',
        '--filter=@noema/web-admin',
        "--filter=./services/*",
      ];
    default:
      throw new Error(`Unsupported dev mode: ${selectedMode}`);
  }
}

function windowsArgsFor(selectedMode) {
  switch (selectedMode) {
    case 'dev':
    case 'dev:all':
      return [
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          '.\\scripts\\start-background-script.ps1',
          '-ScriptPath',
          '.\\scripts\\dev-services-no-watch.ps1',
          '-LogName',
          'dev-services-no-watch',
        ],
        [
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            '.\\scripts\\start-background-script.ps1',
            '-ScriptPath',
            '.\\scripts\\dev-apps-no-watch.ps1',
            '-LogName',
            'dev-apps-no-watch',
          ],
        ],
      ];
    case 'dev:services':
      return [
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          '.\\scripts\\start-background-script.ps1',
          '-ScriptPath',
          '.\\scripts\\dev-services-no-watch.ps1',
          '-LogName',
          'dev-services-no-watch',
        ],
      ];
    case 'dev:web+api':
      return ['pnpm', ['exec', 'turbo', ...turboArgsFor(selectedMode)]];
    case 'dev:web':
    case 'dev:web-admin':
      return ['pnpm', ['exec', 'turbo', ...turboArgsFor(selectedMode)]];
    case 'dev:admin-stack':
      return [
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          '.\\scripts\\start-background-script.ps1',
          '-ScriptPath',
          '.\\scripts\\dev-services-no-watch.ps1',
          '-LogName',
          'dev-services-no-watch',
        ],
        [
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            '.\\scripts\\start-background-script.ps1',
            '-ScriptPath',
            '.\\scripts\\dev-apps-no-watch.ps1',
            '-LogName',
            'dev-apps-no-watch',
          ],
        ],
      ];
    default:
      return ['pnpm', ['--filter', modeToPackage(selectedMode), 'dev']];
  }
}

function modeToPackage(selectedMode) {
  switch (selectedMode) {
    case 'dev:content':
      return '@noema/content-service';
    case 'dev:session':
      return '@noema/session-service';
    case 'dev:scheduler':
      return '@noema/scheduler-service';
    case 'dev:user':
      return '@noema/user-service';
    case 'dev:kg':
      return '@noema/knowledge-graph-service';
    default:
      throw new Error(`No Windows package mapping for mode: ${selectedMode}`);
  }
}

if (isWindows) {
  prepareWindowsDevPorts(mode);
  prepareSharedInfra(mode);
  const windowsConfig = windowsArgsFor(mode);
  const [command, args, chained] = windowsConfig;
  if (command === 'pnpm') {
    process.exit(runPnpm(args));
  }

  const firstResult = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });

  if (firstResult.error) {
    throw firstResult.error;
  }

  if ((firstResult.status ?? 0) !== 0) {
    process.exit(firstResult.status ?? 1);
  }

  if (Array.isArray(chained)) {
    const [nextCommand, nextArgs] = chained;
    run(nextCommand, nextArgs);
  }

  process.exit(0);
}

prepareSharedInfra(mode);
process.exit(runPnpm(turboArgsFor(mode)));
