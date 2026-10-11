import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { REPORT_SCHEMA, auditPrompt, validateReport } from './report.mjs';
import { parseUsage, readCodexLimits } from './usage.mjs';

export function subscriptionEnvironment(source = process.env) {
  // Do not inherit API keys/provider overrides: this feature uses the CLI login.
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|CODEX_HOME|CLAUDE_CONFIG_DIR|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/i;
  return { ...Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key))), NO_COLOR: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }
export async function findCli(provider) {
  const override = process.env[provider === 'codex' ? 'CLIENTFINDER_CODEX_PATH' : 'CLIENTFINDER_CLAUDE_PATH'];
  if (override) {
    if (!await exists(override) || !/\.(exe|m?js)$/i.test(override) && process.platform === 'win32') throw new Error('The configured CLI path must point to an executable or JavaScript entry point.');
    return /\.m?js$/i.test(override) ? { command: process.execPath, prefix: [override] } : { command: override, prefix: [] };
  }
  const directories = [...(process.env.PATH || '').split(delimiter), join(homedir(), '.local', 'bin')];
  for (const directory of directories.filter(Boolean)) {
    const binary = join(directory, `${provider}${process.platform === 'win32' ? '.exe' : ''}`);
    if (await exists(binary)) return { command: binary, prefix: [] };
    // npm's Windows .cmd wrappers require a shell. Invoke their JS entry instead.
    const entry = join(directory, 'node_modules', provider === 'codex' ? '@openai/codex/bin/codex.js' : '@anthropic-ai/claude-code/cli.js');
    if (await exists(entry)) return { command: process.execPath, prefix: [entry] };
  }
  throw new Error(`${provider === 'codex' ? 'Codex CLI' : 'Claude Code'} is not installed or is not on PATH.`);
}

export function runProcess(cli, args, { input = '', cwd, signal, timeout = 180_000, env = subscriptionEnvironment() } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const child = spawn(cli.command, [...cli.prefix, ...args], { cwd, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', failure;
    const stop = reason => {
      failure ||= reason;
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill('SIGKILL');
    };
    const abort = () => stop(new Error('Scan cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop(new Error('AI review timed out. Retry the website or choose another provider.')), timeout);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 2_000_000) stop(new Error('AI output exceeded the size limit.')); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-12_000); });
    child.stdin.on('error', () => {});
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => { cleanup(); if (failure) reject(failure); else resolve({ code, stdout, stderr }); });
    child.stdin.end(input);
  });
}

export async function providerStatus(provider) {
  try {
    const cli = await findCli(provider);
    const result = await runProcess(cli, provider === 'codex' ? ['login', 'status'] : ['auth', 'status'], { timeout: 10_000, cwd: tmpdir() });
    let ready;
    if (provider === 'codex') ready = result.code === 0 && /using ChatGPT/i.test(result.stdout + result.stderr);
    else { const auth = JSON.parse(result.stdout); ready = result.code === 0 && auth.loggedIn === true && ['claude.ai', 'oauth_token'].includes(auth.authMethod); }
    const quota = ready && provider === 'codex' ? await readCodexLimits(cli, subscriptionEnvironment()).catch(() => null) : null;
    return { installed: true, ready, quota, message: ready ? 'Subscription connected' : `Sign in with your subscription using ${provider === 'codex' ? 'codex login' : 'claude auth login'}.` };
  } catch { return { installed: false, ready: false, message: `${provider === 'codex' ? 'Codex CLI' : 'Claude Code'} is unavailable. Install it and sign in, then refresh connection.` }; }
}

export function claudeMessage(prompt, images) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }, ...images.map(buffer => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: buffer.toString('base64') } }))] } }) + '\n';
}

export function parseClaudeOutput(stdout) {
  const events = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const result = events.findLast(event => event.type === 'result');
  if (!result || result.is_error || result.subtype && result.subtype !== 'success') throw new Error('Claude did not complete the review. Check subscription limits and retry.');
  return result.structured_output || JSON.parse(result.result.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

export async function reviewEvidence(provider, capture, { signal } = {}) {
  const cli = await findCli(provider);
  const directory = await mkdtemp(join(tmpdir(), 'clientfinder-audit-'));
  try {
    const prompt = auditPrompt(capture.evidence);
    let result, report;
    if (provider === 'codex') {
      const schemaPath = join(directory, 'schema.json'), outputPath = join(directory, 'report.json');
      await writeFile(schemaPath, JSON.stringify(REPORT_SCHEMA));
      const imagePaths = await Promise.all(capture.images.map(async (buffer, index) => { const path = join(directory, `viewport-${index}.png`); await writeFile(path, buffer); return path; }));
      const disabled = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'hooks', 'multi_agent', 'view_image'];
      const args = ['exec', '--ignore-user-config', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0', ...disabled.flatMap(feature => ['-c', `features.${feature}=false`]), '--output-schema', schemaPath, '--output-last-message', outputPath, ...imagePaths.flatMap(path => ['--image', path]), '-'];
      result = await runProcess(cli, [...args.slice(0, 1), '--json', ...args.slice(1)], { cwd: directory, input: prompt, signal });
      if (result.code === 0) report = JSON.parse(await readFile(outputPath, 'utf8'));
    } else {
      const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--max-turns', '3', '--no-session-persistence', '--setting-sources', '', '--settings', '{"disableAllHooks":true}', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--json-schema', JSON.stringify(REPORT_SCHEMA)];
      result = await runProcess(cli, args, { cwd: directory, input: claudeMessage(prompt, capture.images), signal });
      if (result.code === 0) report = parseClaudeOutput(result.stdout);
    }
    if (result.code !== 0) {
      // Never relay raw CLI logs: they can contain account data or environment paths.
      const logs = result.stderr + result.stdout;
      if (/rate.?limit|usage.?limit|quota|too many requests/i.test(logs)) throw new Error('Subscription usage limit reached. Wait for it to reset, then retry the remaining websites.');
      if (/login|unauthorized|authentication|token.*expired/i.test(logs)) throw new Error(`Sign in again with ${provider === 'codex' ? 'codex login' : 'claude auth login'}, then retry.`);
      throw new Error(`${provider === 'codex' ? 'Codex' : 'Claude'} could not complete the review. Check that its CLI is current and your subscription is available, then retry.`);
    }
    return { ...validateReport(report), usage: parseUsage(provider, result.stdout) };
  } finally {
    // directory is created by mkdtemp under the OS temp directory, never user input.
    await rm(directory, { recursive: true, force: true });
  }
}
