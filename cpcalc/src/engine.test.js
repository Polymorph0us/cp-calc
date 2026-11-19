/**
 * CP Calc – Engine Unit Tests (Node.js, ES modules)
 * Run: node --experimental-vm-modules engine.test.js
 * Or:  node engine.test.js   (Node ≥ 22 supports ESM natively)
 */

import { evaluate, state, wrap, U, clz, phi, modinv, fib, factor } from './engine.js';

let pass = 0, fail = 0;

function eq(label, got, expected) {
  const gs = String(got), es = String(expected);
  if (gs === es) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.error(`  ✗ ${label}\n    got:      ${gs}\n    expected: ${es}`);
    fail++;
  }
}

// ── Configure state ──────────────────────────────────────────────────────────
state.width = 64;
state.signed = true;
state.lastAns = '0';

console.log('Engine tests:');

// (1<<20) ^ 12345 % MOD  -> 1060921
// Operator precedence: % binds tighter than ^
// 12345 % 1000000007 = 12345
// (1<<20) = 1048576
// 1048576 ^ 12345 = 1060921
eq('(1<<20) ^ 12345 % MOD', evaluate('(1<<20) ^ 12345 % MOD'), 1060921n);

// -7 % 3 -> -1  (C++ semantics)
eq('-7%3', evaluate('-7%3'), -1n);

// -2**2 -> -4  (unary minus applies after **)
// In our grammar: -2**2 = -(2**2) = -4
eq('-2**2', evaluate('-2**2'), -4n);

// 5/2 -> 2  (truncation toward zero)
eq('5/2', evaluate('5/2'), 2n);

// inv(3, MOD) -> 333333336
eq('inv(3,MOD)', evaluate('inv(3,MOD)'), 333333336n);

// fib(100, MOD) -> 687995182
eq('fib(100,MOD)', evaluate('fib(100,MOD)'), 687995182n);

// factor(600851475143) -> '71 · 839 · 1471 · 6857'
eq('factor(600851475143)', evaluate('factor(600851475143)'), '71 \xb7 839 \xb7 1471 \xb7 6857');

// 1<<63 (signed 64-bit) -> -9223372036854775808
// In infinite-precision BigInt this is just 9223372036854775808.
// wrap() applies the signed 64-bit interpretation.
const shift63raw = evaluate('1<<63');
eq('1<<63 raw (BigInt)', shift63raw, 9223372036854775808n);
eq('1<<63 wrapped signed 64-bit', wrap(shift63raw), -9223372036854775808n);

// ~0 -> -1  (BigInt bitwise NOT)
eq('~0', evaluate('~0'), -1n);

// clz(1) (64-bit) -> 63
state.width = 64;
eq('clz(1) 64-bit', evaluate('clz(1)'), 63n);

// phi(36) -> 12
eq('phi(36)', evaluate('phi(36)'), 12n);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
