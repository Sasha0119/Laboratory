/**
 * Unit tests for the strict number-input parser.
 *
 * Run with:  npm run test:input
 *
 * Same dependency-free style as the physics tests.
 */

import { parseNumberInput, roundTo, type ParseFailure } from '../numberInput';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const show = (s: string) => JSON.stringify(s);

function accepts(text: string, expected: number) {
  const r = parseNumberInput(text);
  check(
    `${show(text)} → ${expected}`,
    r.ok && r.value === expected,
    r.ok ? `got ${r.value}` : `refused as ${r.reason}`
  );
}

function refuses(text: string, reason: ParseFailure) {
  const r = parseNumberInput(text);
  check(
    `${show(text)} is refused (${reason})`,
    !r.ok && r.reason === reason,
    r.ok ? `accepted as ${r.value}` : `refused as ${r.reason}`
  );
}

section('Plain numbers');
accepts('12', 12);
accepts('0', 0);
accepts('3.25', 3.25);
accepts('0.0005', 0.0005);
accepts('.5', 0.5);
accepts('5.', 5);
accepts('+7', 7);
accepts('007', 7);

section('Decimal comma or point');
accepts('1.5', 1.5);
accepts('1,5', 1.5);
accepts(',25', 0.25);
accepts('0,0008', 0.0008);
// A single separator is always decimal — never a silent "thousand".
accepts('1,000', 1);
accepts('2.500', 2.5);

section('Negative numbers');
accepts('-5', -5);
accepts('-0,75', -0.75);
accepts('−3', -3); // Unicode minus, as pasted from a document
accepts('-0', 0);
check('"-0" is a plain zero, not -0', Object.is((parseNumberInput('-0') as { value: number }).value, 0));

section('Empty');
refuses('', 'empty');
refuses('   ', 'empty');
refuses('\t\n', 'empty');

section('Trailing junk is never half-read (audit: "12abc" became 12)');
refuses('12abc', 'invalid');
refuses('abc12', 'invalid');
refuses('12 m', 'invalid');
refuses('12kg', 'invalid');
refuses('1/2', 'invalid');
refuses('5%', 'invalid');
refuses('1-2', 'invalid');
refuses('--5', 'invalid');
refuses('-', 'invalid');
refuses('.', 'invalid');
refuses(',', 'invalid');
refuses('+', 'invalid');

section('Thousands separators are refused, not guessed (audit: "1.000,5" became 1)');
refuses('1.000,5', 'ambiguous');
refuses('1,000.5', 'ambiguous');
refuses('1.000.000', 'ambiguous');
refuses('1,000,000', 'ambiguous');
refuses('1 000', 'ambiguous');
refuses('12 345,6', 'ambiguous');
refuses('1..5', 'ambiguous');
refuses('1,,5', 'ambiguous');
refuses('a.b,c', 'invalid');

section('Not numbers JavaScript would accept');
refuses('1e5', 'invalid');
refuses('1E-3', 'invalid');
refuses('Infinity', 'invalid');
refuses('-Infinity', 'invalid');
refuses('NaN', 'invalid');
refuses('0x10', 'invalid');
refuses('0b11', 'invalid');

section('Very large');
accepts('123456789012', 123456789012);
accepts('99999999999999999999', 1e20);
refuses('9'.repeat(400), 'invalid'); // overflows to Infinity

section('Pasted text');
accepts('  42  ', 42);
accepts(' 12,5 ', 12.5); // non-breaking spaces around a value
accepts('\t3.5\n', 3.5);
refuses('1 000', 'ambiguous'); // NBSP digit grouping (French, Russian style)
refuses('1 000', 'ambiguous'); // narrow NBSP grouping
refuses('4 2', 'invalid');
refuses('12.5 m/s', 'invalid');
refuses('speed: 12', 'invalid');
refuses('１２', 'invalid'); // full-width digits

section('Rounding to the displayed decimals');
check('0.12345 to 4 decimals is 0.1235 (well, its nearest double)', roundTo(0.12345, 4) === 0.1235 || roundTo(0.12345, 4) === 0.1234);
check('45.5 to 0 decimals is 46', roundTo(45.5, 0) === 46);
check('2.25 to 1 decimal stays within a step', Math.abs(roundTo(2.25, 1) - 2.25) <= 0.05 + 1e-12);
check('an already-round value is unchanged', roundTo(9.81, 2) === 9.81);
check('-0.00001 rounds to plain zero', Object.is(roundTo(-0.00001, 2), 0));

console.log('');
if (failures.length === 0) {
  console.log(`\x1b[32m${passed} checks passed.\x1b[0m`);
  process.exit(0);
} else {
  console.log(`\x1b[31m${failures.length} failed\x1b[0m, ${passed} passed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
