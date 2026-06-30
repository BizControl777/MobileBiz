const { execSync } = require('child_process');

const shouldSkip = process.env.SKIP_ELECTRON_POSTINSTALL === 'true' || process.env.RENDER === 'true';

if (shouldSkip) {
  console.log('[postinstall] SKIPPING electron-builder install-app-deps (render/server environment detected)');
  process.exit(0);
}

console.log('[postinstall] Running electron-builder install-app-deps...');
execSync('electron-builder install-app-deps', { stdio: 'inherit' });
