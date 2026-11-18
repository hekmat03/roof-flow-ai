/**
 * migrations-docs.check.ts — keeps supabase/MIGRATIONS.md honest.
 *  1. Every migration file on disk is listed exactly once, in the documented order, and every
 *     listed file exists.
 *  2. Numbering is non-decreasing (the two 008_ files are allowed).
 *  3. Dependency order: no file alters / references / indexes / adds a policy or trigger on a
 *     public table that is created only by a LATER file (this is the check that would have
 *     caught the old README order, which skipped schema.sql and failed at 007).
 *  4. README / AUTH_SETUP / EMAIL_SETUP / DEPLOYMENT point to MIGRATIONS.md and do not carry
 *     their own numbered migration list.
 *  5. Legacy files carry a DO NOT RUN banner; the demo seed lives only in seed_demo.sql.
 * No network, no database. This is a static check; it is NOT a substitute for running the
 * migrations once on an empty Supabase project (see MIGRATIONS.md "Fresh install").
 * Run: node --experimental-strip-types --import ./tests/register-ts.mjs tests/migrations-docs.check.ts
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sbDir = join(root, 'supabase');

let passed = 0, failed = 0;
const check = (n: string, ok: boolean, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${n}${!ok && detail ? `\n       ${detail}` : ''}`);
};

const NOT_SETUP = new Set(['migration.sql', 'tenants.sql', 'seed_demo.sql', 'verify_setup.sql']);
const read = (p: string) => readFileSync(p, 'utf8');
const mdPath = join(sbDir, 'MIGRATIONS.md');

console.log('\n[1] MIGRATIONS.md vs files on disk');
check('supabase/MIGRATIONS.md exists', existsSync(mdPath));
const md = existsSync(mdPath) ? read(mdPath) : '';
const m = md.match(/<!-- MIGRATION-ORDER:BEGIN -->([\s\S]*?)<!-- MIGRATION-ORDER:END -->/);
check('machine-readable order block present', !!m);
const listed = (m?.[1] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

const onDisk = readdirSync(sbDir).filter((f) => f.endsWith('.sql') && !NOT_SETUP.has(f));
const missingFromDoc = onDisk.filter((f) => !listed.includes(f));
const missingOnDisk = listed.filter((f) => !onDisk.includes(f));
const dupes = listed.filter((f, i) => listed.indexOf(f) !== i);
check('every migration file on disk is listed in MIGRATIONS.md', missingFromDoc.length === 0,
  `not listed: ${missingFromDoc.join(', ')}. Add each to the order block and the table (e.g. a new 016).`);
check('every listed file exists on disk', missingOnDisk.length === 0, `missing: ${missingOnDisk.join(', ')}`);
check('no file is listed twice', dupes.length === 0, dupes.join(', '));
check('schema.sql is the first step', listed[0] === 'schema.sql');

const nums = listed.filter((f) => /^\d{3}_/.test(f)).map((f) => parseInt(f.slice(0, 3), 10));
check('numbering never goes backwards', nums.every((n, i) => i === 0 || n >= nums[i - 1]), nums.join(','));
check('no numbering gaps (001..last)', nums.length === 0 || [...new Set(nums)].every((n, i, a) => i === 0 || n === a[i - 1] + 1),
  `numbers present: ${[...new Set(nums)].join(',')}`);
check('every numbered row appears in the table too',
  listed.every((f) => md.split('\n').some((l) => l.startsWith('|') && l.includes('`' + f + '`'))),
  'a file is in the order block but has no table row');

console.log('\n[2] dependency order (static)');
const created = new Set<string>();
const stripComments = (s: string) => s.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const PATTERNS: RegExp[] = [
  /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?/gi,
  /references\s+(?:public\.)?"?(\w+)"?\s*\(/gi,
  /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?\w+\s+on\s+(?:public\.)?(\w+)/gi,
  /create\s+policy\s+"?[\w\s]+?"?\s+on\s+(?:public\.)?(\w+)/gi,
  /create\s+(?:or\s+replace\s+)?trigger\s+\w+\s+(?:before|after|instead\s+of)\s+[\w\s,]+?\s+on\s+(?:public\.)?(\w+)/gi,
  /insert\s+into\s+(?:public\.)?(\w+)/gi,
];
for (const f of listed.filter((x) => onDisk.includes(x))) {
  const sql = stripComments(read(join(sbDir, f)));
  // tables this file creates (visible to itself)
  const own = new Set<string>();
  for (const t of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) own.add(t[1].toLowerCase());
  const needed = new Set<string>();
  for (const re of PATTERNS) {
    for (const t of sql.matchAll(re)) {
      const name = t[1].toLowerCase();
      // skip schema-qualified names such as auth.users (Supabase-provided) and sql words
      const end = (t.index ?? 0) + t[0].length;
      if (sql[end] === '.' || ['only', 'if', 'public', 'select', 'values'].includes(name)) continue;
      needed.add(name);
    }
  }
  const missing = [...needed].filter((n) => !created.has(n) && !own.has(n));
  check(`${f}: every table it touches exists before it runs`, missing.length === 0,
    `uses table(s) not created by an earlier step: ${missing.join(', ')}`);
  own.forEach((t) => created.add(t));
}

console.log('\n[3] other documents point to MIGRATIONS.md');
for (const name of ['README.md', 'AUTH_SETUP.md', 'EMAIL_SETUP.md', 'DEPLOYMENT.md']) {
  const p = join(root, name);
  if (!existsSync(p)) continue;
  const t = read(p);
  const files = new Set([...t.matchAll(/\b(\d{3}_[a-z0-9_]+\.sql)\b/g)].map((x) => x[1]));
  const mentionsSql = /\.sql|migration/i.test(t);
  check(`${name}: points to MIGRATIONS.md`, !mentionsSql || t.includes('MIGRATIONS.md'), 'mentions migrations but never links MIGRATIONS.md');
  check(`${name}: has no private numbered migration list`, files.size < 3,
    `names ${files.size} numbered migration files (${[...files].join(', ')}); link to MIGRATIONS.md instead`);
  const stale = [...files].filter((f) => !existsSync(join(sbDir, f)));
  check(`${name}: names only files that exist`, stale.length === 0, stale.join(', '));
}

console.log('\n[4] legacy and demo data');
for (const f of ['migration.sql', 'tenants.sql']) {
  check(`${f} carries a DO NOT RUN banner`, /LEGACY\s+—\s+DO NOT RUN/.test(read(join(sbDir, f)).slice(0, 400)));
}
const seed = read(join(sbDir, 'seed_demo.sql'));
check('seed_demo.sql is marked demo-only / never production', /NEVER run this on production/i.test(seed));
const stillSeeding = onDisk.filter((f) => /abc roofing|wk_abcroofing|11111111-aaaa/i.test(stripComments(read(join(sbDir, f)))));
check('no numbered migration inserts the demo companies', stillSeeding.length === 0, stillSeeding.join(', '));
check('verify_setup.sql is read-only (no DDL or writes)',
  !/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(stripComments(read(join(sbDir, 'verify_setup.sql')))
    .replace(/'[^']*'/g, '')));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
