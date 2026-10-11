import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const count = value => Number.isSafeInteger(value) && value >= 0;

export function parseUsage(provider, stdout) {
  const events = stdout.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const usage = events.findLast(event => provider === 'codex' ? event.type === 'turn.completed' : event.type === 'result')?.usage;
  if (!usage || !count(usage.input_tokens) || !count(usage.output_tokens)) return null;
  const cachedInputTokens = count(usage.cached_input_tokens) ? usage.cached_input_tokens : 0;
  // Claude reports cache reads/writes separately; Codex includes cache reads in input.
  const cacheRead = count(usage.cache_read_input_tokens) ? usage.cache_read_input_tokens : 0;
  const cacheWrite = count(usage.cache_creation_input_tokens) ? usage.cache_creation_input_tokens : 0;
  const inputTokens = usage.input_tokens + (provider === 'claude' ? cacheRead + cacheWrite : 0);
  return { inputTokens, outputTokens: usage.output_tokens, cachedInputTokens: provider === 'claude' ? cacheRead : cachedInputTokens, totalTokens: inputTokens + usage.output_tokens };
}

export function normalizeLimits(result, now = Date.now()) {
  const limits = result?.rateLimitsByLimitId?.codex || result?.rateLimits;
  if (!limits || limits.limitId && limits.limitId !== 'codex') return null;
  const windows = ['primary', 'secondary'].flatMap(key => {
    const value = limits[key];
    if (!value || !Number.isFinite(value.usedPercent) || value.usedPercent < 0 || value.usedPercent > 100) return [];
    return [{ key, remainingPercent: 100 - value.usedPercent,
      windowMinutes: count(value.windowDurationMins) ? value.windowDurationMins : null,
      resetsAt: Number.isFinite(value.resetsAt) ? value.resetsAt * 1000 : null }];
  });
  return windows.length ? { windows, checkedAt: now } : null;
}

// Read account limits only: no thread or model turn is started.
export function readCodexLimits(cli, env, { timeout = 7000 } = {}) {
  return new Promise(resolve => {
    const child = spawn(cli.command, [...cli.prefix, 'app-server', '--listen', 'stdio://'], { env, cwd: tmpdir(), windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', settled = false, initialized = false;
    const finish = value => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      child.stdin.end();
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout);
    const send = value => child.stdin.write(JSON.stringify(value) + '\n');
    child.stdin.on('error', () => finish(null));
    child.stderr.resume();
    child.on('error', () => finish(null));
    child.on('close', () => finish(null));
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      if (buffer.length > 250_000) { finish(null); return; }
      let newline;
      while (!settled && (newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && !initialized) {
          if (message.error) { finish(null); return; }
          initialized = true;
          send({ method: 'initialized' });
          send({ id: 2, method: 'account/rateLimits/read' });
        } else if (message.id === 2) finish(normalizeLimits(message.result));
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'leadrove_usage', version: '1.0.0' } } });
  });
}
