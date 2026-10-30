/**
 * validators.check.ts — email / phone / name rules and the server-side tool layer.
 * Run: node --experimental-strip-types --import ./tests/register-ts.mjs tests/validators.check.ts
 */
import {
  validateEmail, validatePhone, validateName, formatPhone, findEmailCandidate, findPhoneCandidate,
} from '../api/_lib/validators.ts';
import { validateToolArgs } from '../api/_lib/tools.ts';

let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${n}`); };

console.log('Email: accepted');
for (const e of ['sam@gmail.com', 'Sam.Lee+roof@Company.co.uk', "o'brien@acme-roofing.com", 'dana_w@outlook.com']) {
  check(e, validateEmail(e).ok);
}
check('lowercases + trims', (validateEmail('  Sam@Gmail.COM ') as { value: string }).value === 'sam@gmail.com');

console.log('Email: rejected');
for (const e of ['abc', 'sam@', '@gmail.com', 'sam@gmail', 'sam@@gmail.com', 'sam lee@gmail.com', 'sam..lee@gmail.com', '.sam@gmail.com', 'sam@-gmail.com', 'sam@gmail.c', '']) {
  check(`format: "${e}"`, !validateEmail(e).ok);
}
for (const e of ['test@test.com', 'asdf@asdf.com', 'a@a.com', 'none@none.com', 'noemail@gmail.com', 'sam@example.com', 'fake@fake.com', 'xxxx@gmail.com', 'me@site.invalid', 'qwerty@gmail.com', 'noreply@acme.com']) {
  const r = validateEmail(e);
  check(`placeholder: ${e}`, !r.ok && r.kind === 'placeholder');
}
check('disposable: x@mailinator.com', (() => { const r = validateEmail('sam@mailinator.com'); return !r.ok && r.kind === 'disposable'; })());
check('non-string rejected', !validateEmail(undefined).ok && !validateEmail(42).ok);

console.log('Phone: accepted');
for (const p of ['(415) 555-2671', '415-555-2671', '415.555.2671', '4155552671', '+1 415 555 2671', '1 (415) 555-2671', '+44 20 7946 0958', '(214) 555-0177 x12']) {
  check(p, validatePhone(p).ok);
}
check('normalises to digits (drops US 1)', (validatePhone('+1 (415) 555-2671') as { value: string }).value === '4155552671');
check('formatPhone', formatPhone('4155552671') === '(415) 555-2671');

console.log('Phone: rejected');
for (const p of ['', '123', '555-1234', '415555267', 'call me', '415-555-ABCD']) check(`format/short: "${p}"`, !validatePhone(p).ok);
check('short gives "short" kind', (() => { const r = validatePhone('555-1234'); return !r.ok && r.kind === 'short'; })());
for (const p of ['0000000000', '1111111111', '1234567890', '9876543210', '5550000000', '(055) 123-4567', '(155) 123-4567']) {
  check(`fake: ${p}`, !validatePhone(p).ok);
}
check('too long', !validatePhone('1234567890123456').ok);

console.log('Name');
check('accepts "Sam Lee"', validateName('Sam Lee').ok);
check("accepts \"Mary O'Neil-Jones\"", validateName("Mary O'Neil-Jones").ok);
check('accepts "José Álvarez"', validateName('José Álvarez').ok);
for (const n of ['', 'a', '12345', 'test', 'asdf', 'John Doe', '!!!']) check(`rejects "${n}"`, !validateName(n).ok);

console.log('Spotting contact details in free text');
check('finds john@gmail', findEmailCandidate('my email is john@gmail ok') === 'john@gmail');
check('finds full email', findEmailCandidate('reach me: Sam@Gmail.com.') === 'Sam@Gmail.com');
check('no email -> undefined', findEmailCandidate('my roof leaks') === undefined);
check('phone after "my phone is"', findPhoneCandidate('my phone is 555-1234') === '555-1234');
check('10-digit run', findPhoneCandidate('call 000 000 0000 please')?.replace(/\D/g, '') === '0000000000');
check('ignores ZIP codes', findPhoneCandidate('I live in 75201') === undefined);
check('ignores ISO dates', findPhoneCandidate('storm on 2026-05-15 was bad') === undefined);
check('ignores plain numbers', findPhoneCandidate('the number of shingles is 30') === undefined);

console.log('Server tool layer (book_inspection)');
const base = { name: 'Sam Lee', phone: '(415) 555-2671', preferred_time: 'Tuesday morning', address_or_zip: '12 Palm St', issue: 'hail damage' };
check('valid booking passes', validateToolArgs('book_inspection', base).ok);
check('short phone rejected', !validateToolArgs('book_inspection', { ...base, phone: '555-1234' }).ok);
check('fake phone rejected', !validateToolArgs('book_inspection', { ...base, phone: '0000000000' }).ok);
check('fake email rejected', !validateToolArgs('book_inspection', { ...base, email: 'test@test.com' }).ok);
check('good email accepted', validateToolArgs('book_inspection', { ...base, email: 'sam@gmail.com' }).ok);
check('update_crm needs a valid contact', !validateToolArgs('update_crm', { phone: '123' }).ok && validateToolArgs('update_crm', { phone: '4155552671' }).ok);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
