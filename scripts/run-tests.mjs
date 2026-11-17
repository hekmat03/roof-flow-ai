// Runs every tests/*.check.ts and tests/*.test.ts, so a new test can never be forgotten.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests').filter((f) => /\.(check|test)\.ts$/.test(f)).sort();
if (files.length === 0) { console.error('No tests found; refusing to pass an empty suite.'); process.exit(1); }
let failed = [];
for (const f of files) {
  console.log(`\n=== tests/${f}`);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './tests/register-ts.mjs', `tests/${f}`], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
}
if (failed.length) { console.error(`\nFAILED: ${failed.join(', ')}`); process.exit(1); }
console.log(`\nAll ${files.length} test files passed.`);
