const fs = require('node:fs');
const path = require('node:path');

const appRootArg = process.argv[2];
const appRoot = appRootArg ? path.resolve(process.cwd(), appRootArg) : process.cwd();
const serverDir = path.join(appRoot, '.next', 'server');
const manifestPath = path.join(serverDir, 'middleware-manifest.json');

if (!fs.existsSync(manifestPath)) {
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: 3,
        middleware: {},
        functions: {},
        sortedMiddleware: [],
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[ensure-next-middleware-manifest] created ${manifestPath}`);
}
