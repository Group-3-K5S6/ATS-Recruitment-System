const { execSync } = require('child_process');
const os = require('os');

const cwd = process.cwd();

if (os.platform() === 'win32' && (cwd.includes('[') || cwd.includes(']'))) {
  let drive = 'X:';
  try {
    execSync(`subst ${drive} "${cwd}"`, { stdio: 'ignore' });
  } catch {
    drive = 'Y:';
    try {
      execSync(`subst ${drive} "${cwd}"`, { stdio: 'ignore' });
    } catch {}
  }
  try {
    execSync(`npx vitest run --root "${drive}/"`, { stdio: 'inherit' });
  } catch (err) {
    process.exit(err.status || 1);
  }
} else {
  try {
    execSync('npx vitest run', { stdio: 'inherit' });
  } catch (err) {
    process.exit(err.status || 1);
  }
}
