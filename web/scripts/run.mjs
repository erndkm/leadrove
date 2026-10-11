import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, chmodSync, lstatSync } from 'node:fs';
import { dirname, resolve, parse, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portable = resolve(root, '.runtime/node-v22.23.3-win-x64/node.exe');
const [major, minor, patch] = process.versions.node.split('.').map(Number);
const current = major === 22 && (minor > 23 || minor === 23 && patch >= 3) || major === 24 && minor >= 21;
const runtime = current ? process.execPath : process.platform === 'win32' && existsSync(portable) ? portable : '';
const [mode, ...args] = process.argv.slice(2);
if (!runtime) {
  console.error('Use patched Node.js LTS 22.23.3+ or 24.21.0+. See SECURITY.md before starting Leadrove.');
  process.exit(1);
}
const entry = mode === 'start' ? ['server/start.mjs'] : mode === 'dev' ? ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'] : mode === 'preview' ? ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'] : null;
if (!entry) { console.error('Choose start, dev or preview.'); process.exit(1); }
const data = resolve(process.env.CLIENTFINDER_DATA_DIR || resolve(root, '.clientfinder'));
const same = path => process.platform === 'win32' ? path.toLowerCase() : path;
if ([parse(data).root, root, homedir()].some(path => same(path) === same(data)) || same(root).startsWith(same(data + sep)) || ['public', 'dist', 'node_modules', '.git', '.runtime'].some(name => same(data) === same(resolve(root, name)) || same(data).startsWith(same(resolve(root, name) + sep)))) {
  console.error('Choose a dedicated private Leadrove data directory outside public assets and tooling.'); process.exit(1);
}
mkdirSync(data, { recursive: true, mode: 0o700 });
if (lstatSync(data).isSymbolicLink()) { console.error('The data directory must not be a symbolic link.'); process.exit(1); }
if (process.platform === 'win32') {
  const result = spawnSync(resolve(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'scripts/protect-data.ps1'), '-DataPath', data], { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
  if (result.status !== 0) { console.error('Could not protect the local data directory. Check its permissions before starting Leadrove.'); process.exit(1); }
} else chmodSync(data, 0o700);
const child = spawn(runtime, [...entry, ...args], { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
child.on('error', () => { console.error('Could not launch the local runtime. Check your Node.js installation.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
