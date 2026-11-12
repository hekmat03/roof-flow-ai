import { readFileSync, existsSync } from 'node:fs';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${name}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const exists = (p: string) => existsSync(new URL(`../${p}`, import.meta.url));

// NOTE: these are static checks of the SQL text (no Postgres in CI). The migration ends with a manual
// verification block to run once against a real database.
console.log('[1] the unguarded policy this migration compensates for');
const m001 = read('supabase/001_multitenant.sql');
check('001 tenants_update has no column restriction (the reason 013 exists)',
  /create policy tenants_update on public\.tenants\s+for update to authenticated\s+using \(id = public\.my_tenant\(\)\)\s+with check \(id = public\.my_tenant\(\)\)/.test(m001));

console.log('\n[2] migration 013 locks the identity columns');
check('migration 013 exists', exists('supabase/013_tenant_column_guard.sql'));
const sql = exists('supabase/013_tenant_column_guard.sql') ? read('supabase/013_tenant_column_guard.sql') : '';
const code = sql.replace(/--.*$/gm, '');
check('is a BEFORE UPDATE row trigger on public.tenants',
  /create trigger tenants_guard_protected_columns\s+before update on public\.tenants\s+for each row/.test(sql));
check('blocks changes to widget_key', /new\.widget_key is distinct from old\.widget_key/.test(sql));
check('blocks changes to id and created_at', /new\.id is distinct from old\.id/.test(sql) && /new\.created_at is distinct from old\.created_at/.test(sql));
check('only restricts authenticated and anon (service_role and SQL editor still work)',
  /auth\.role\(\) in \('authenticated', 'anon'\)/.test(sql) && !/service_role/.test(code));
check('raises a permission error instead of silently ignoring', /errcode = '42501'/.test(sql));
check('does NOT block name, settings or prompts', !/new\.(name|settings|prompts) is distinct/.test(code));
check('is idempotent (create or replace / drop trigger if exists)',
  /create or replace function public\.tenants_guard_protected_columns/.test(sql) && /drop trigger if exists tenants_guard_protected_columns/.test(sql));
check('deletes no data', !/\b(delete from|drop table|truncate)\b/i.test(code));
check('runs after 012 (header says so)', /AFTER 012_email_verification\.sql/.test(sql));

console.log('\n[3] the app only edits settings, which stays allowed');
const leadsDb = read('src/lib/leadsDb.ts');
check('client updates tenants.settings only', /\.update\(\{ settings \}\)/.test(leadsDb) && !/widget_key\s*:/.test(leadsDb.split('.from(\'tenants\')').slice(1).join('')));

console.log(`\nTenant column guard checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
