const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'be', '[BE] RBAC và kiểm tra phân quyền tại server');
const frontend = path.join(root, 'fe');
const backendEnv = path.join(backend, '.env');
const exampleEnv = path.join(backend, '.env.example');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function ensureBackendEnv() {
  const fs = require('node:fs');
  if (!fs.existsSync(backendEnv)) fs.copyFileSync(exampleEnv, backendEnv);
}

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited with code ${code}`)));
  });
}

async function main() {
  if (process.argv[2] === 'setup') {
    ensureBackendEnv();
    await run(['run', 'prisma:generate'], backend);
    await run(['run', 'prisma:push'], backend);
    await run(['run', 'prisma:seed'], backend);
    return;
  }

  ensureBackendEnv();
  await run(['run', 'prisma:generate'], backend);
  await run(['run', 'prisma:push'], backend);
  await run(['run', 'prisma:seed'], backend);

  const children = [
    spawn(npm, ['run', 'dev'], { cwd: backend, stdio: 'inherit', shell: process.platform === 'win32' }),
    spawn(npm, ['run', 'dev'], { cwd: frontend, stdio: 'inherit', shell: process.platform === 'win32' }),
  ];
  const stop = () => children.forEach((child) => child.kill());
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  children.forEach((child) => child.on('exit', (code) => {
    if (code !== 0 && code !== null) process.exitCode = code;
    stop();
  }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
