import { promises as fs } from 'fs';
import path from 'path';

const root = process.cwd();
const webDir = path.join(root, 'www');
const items = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css',
  'js',
  'icon'
];

async function copyItem(name) {
  const src = path.join(root, name);
  const dest = path.join(webDir, name);
  const stats = await fs.stat(src);
  if (stats.isDirectory()) {
    await fs.rm(dest, { recursive: true, force: true });
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    await Promise.all(entries.map(entry => copyItem(path.join(name, entry))));
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

async function main() {
  await fs.rm(webDir, { recursive: true, force: true });
  await fs.mkdir(webDir, { recursive: true });
  for (const item of items) {
    await copyItem(item);
  }
  console.log('✓ Web assets copied to www/');
}

main().catch(error => {
  console.error('Failed to copy web assets:', error);
  process.exit(1);
});
