const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const roots = ['src', 'tests', 'prisma', 'scripts'];
const files = ['vitest.config.js'];

function collectJavaScript(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScript(fullPath);
    else if (entry.isFile() && fullPath.endsWith('.js') && fullPath !== __filename) files.push(fullPath);
  }
}

for (const root of roots) {
  const fullPath = path.resolve(root);
  if (fs.existsSync(fullPath)) collectJavaScript(fullPath);
}

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Checked syntax for ${files.length} JavaScript files.`);
