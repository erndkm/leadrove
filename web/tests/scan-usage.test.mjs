import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLimits, parseUsage, readCodexLimits } from '../server/usage.mjs';
import { estimateScanTokens, recordedUsage } from '../src/scan-usage.mjs';
import { mobileChecks } from '../src/mobile-checks.mjs';
import { inspectMobile } from '../server/mobile-evidence.mjs';
import { chromium } from 'playwright';

test('token usage handles provider cache semantics without counting output reasoning twice', () => {
  const codex = parseUsage('codex', 'diagnostic\n' + JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10000, cached_input_tokens: 8000, output_tokens: 1500, reasoning_output_tokens: 1000 } }));
  assert.deepEqual(codex, { inputTokens: 10000, cachedInputTokens: 8000, outputTokens: 1500, totalTokens: 11500 });
  const claude = parseUsage('claude', JSON.stringify({ type: 'assistant', usage: { input_tokens: 1, output_tokens: 2 } }) + '\n' + JSON.stringify({ type: 'result', usage: { input_tokens: 300, cache_read_input_tokens: 5000, cache_creation_input_tokens: 1000, output_tokens: 500 } }));
  assert.deepEqual(claude, { inputTokens: 6300, cachedInputTokens: 5000, outputTokens: 500, totalTokens: 6800 });
  assert.equal(parseUsage('codex', '{"type":"turn.completed"}'), null);
  assert.equal(parseUsage('claude', '{"type":"result","usage":{"input_tokens":-1,"output_tokens":2}}'), null);
});

test('limits expose only verified percentages and correct account bucket', () => {
  const result = normalizeLimits({ rateLimits: { limitId: 'other', primary: { usedPercent: 10 } }, rateLimitsByLimitId: { codex: { limitId: 'codex', primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1900000000 }, secondary: { usedPercent: 100, windowDurationMins: 10080 } } }, secret: 'must-not-escape' }, 123);
  assert.equal(result.windows[0].remainingPercent, 75);
  assert.equal(result.windows[1].remainingPercent, 0);
  assert.equal(result.windows[0].resetsAt, 1900000000000);
  assert.equal(result.checkedAt, 123);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(normalizeLimits({ rateLimits: { limitId: 'other', primary: { usedPercent: 10 } } }), null);
  assert.equal(normalizeLimits({ rateLimits: { primary: { usedPercent: 110 } } }), null);
});

test('quota reader performs only initialization and the read-only limits handshake', async () => {
  const script = `let buffer = '', initialized = false; process.stdin.on('data', chunk => { buffer += chunk; let n; while ((n = buffer.indexOf('\\n')) >= 0) { const m = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); if (m.method === 'initialize') console.log(JSON.stringify({id: m.id, result: {}})); else if (m.method === 'initialized') initialized = true; else if (initialized && m.method === 'account/rateLimits/read') console.log(JSON.stringify({id: m.id, result: { rateLimits: { limitId: 'codex', primary: {usedPercent: 40, windowDurationMins: 300} } }})); else process.exit(1); } });`;
  const limits = await readCodexLimits({ command: process.execPath, prefix: ['-e', script, '--'] }, process.env);
  assert.equal(limits.windows[0].remainingPercent, 60);
  assert.equal(await readCodexLimits({ command: process.execPath, prefix: ['-e', 'setInterval(() => {}, 1000)', '--'] }, process.env, { timeout: 150 }), null);
});

test('scan estimates use only selected provider history and never invent a quota percentage', () => {
  assert.deepEqual(estimateScanTokens(2, {}, 'codex'), { low: 16000, high: 60000, samples: 0 });
  const reports = { a: { provider: 'codex', usage: { totalTokens: 10000 } }, b: { provider: 'claude', usage: { totalTokens: 100000 } }, c: { provider: 'codex', usage: null } };
  assert.deepEqual(estimateScanTokens(3, reports, 'codex'), { low: 21000, high: 45000, samples: 1 });
  assert.equal(estimateScanTokens(0, reports, 'codex').high, 0);
  assert.equal(recordedUsage([{ status: 'completed' }]), null);
  assert.deepEqual(recordedUsage([{ usage: { totalTokens: 10000 } }, { usage: null }, { usage: { totalTokens: 0 } }]), { total: 10000, count: 2 });
});

test('mobile checks do not turn old or missing evidence into a pass', () => {
  assert.equal(mobileChecks({}).label, 'Not checked');
  const legacy = mobileChecks({ mobile: { viewport: 'width=device-width', horizontalOverflow: false, smallTextSamples: 0 } });
  assert.equal(legacy.status, 'unknown');
  const narrowOverflow = mobileChecks({ mobile: { viewport: 'width=device-width', horizontalOverflow: false, narrow: { horizontalOverflow: true } } });
  assert.equal(narrowOverflow.checks[1].status, 'warn');
});

test('browser measurements distinguish responsive controls from overflow, small targets and zoom restrictions', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:16px sans-serif}button{min-height:44px;padding:12px 20px}.hidden{display:none}</style><h1>Local studio</h1><p>Book your visit</p><button>Book now</button><button class="hidden">Hidden</button>');
    const good = await page.evaluate(inspectMobile);
    assert.equal(good.tapTargets, 1);
    assert.equal(mobileChecks({ mobile: good }).status, 'pass');
    await page.setContent('<meta name="viewport" content="width=980, user-scalable=no"><style>body{width:800px}p{font-size:10px}button{font-size:8px;width:15px;height:15px;padding:0}</style><p>Tiny text</p><button>x</button>');
    const bad = mobileChecks({ mobile: await page.evaluate(inspectMobile) });
    assert.equal(bad.status, 'warn');
    assert.equal(bad.checks.filter(check => check.status === 'warn').length, 5);
  } finally { await browser.close(); }
});
