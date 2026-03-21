const { spawnSync } = require('node:child_process');

const mode = process.argv[2] ?? 'dev';
const isWindows = process.platform === 'win32';

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
        '--filter=@noema/web',
        '--filter=@noema/content-service',
        '--filter=@noema/session-service',
        '--filter=@noema/user-service',
        '--filter=@noema/scheduler-service',
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
    case 'dev:web+api':
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
    case 'dev:web':
    case 'dev:web-admin':
      return [
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

process.exit(runPnpm(turboArgsFor(mode)));
