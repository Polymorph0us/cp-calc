/**
 * CP Calc – Calculation Engine
 * C++ semantics: integer division truncates toward zero,
 * % takes the sign of the dividend.
 * All arithmetic uses BigInt.
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
export const MOD     = 1_000_000_007n;
export const MOD2    = 998_244_353n;
export const INT_MAX =  2_147_483_647n;
export const INT_MIN = -2_147_483_648n;
export const UINT_MAX = 4_294_967_295n;
export const LLONG_MAX  = (1n << 63n) - 1n;
export const LLONG_MIN  = -(1n << 63n);
export const ULLONG_MAX = (1n << 64n) - 1n;

const CONSTANTS = {
  MOD, MOD2, INT_MAX, INT_MIN, UINT_MAX, LLONG_MAX, LLONG_MIN, ULLONG_MAX,
};

// ── State (width, signed, last ans) ─────────────────────────────────────────
// Consumers set these fields to control evaluation context.
export const state = {
  width: 64,    // 0 = infinite, 8 / 16 / 32 / 64
  signed: true,
  lastAns: '0',
};

function BW()   { return state.width || 64; }
function mask() { return (1n << BigInt(state.width)) - 1n; }

/** Unsigned view of x (clamps to width bits if finite width). */
export function U(x) {
  return (state.width || x < 0n) ? x & mask() : x;
}

/** Sign-extend / wrap to the current width. */
export function wrap(v) {
  if (!state.width) return v;
  const m = 1n << BigInt(state.width);
  v &= m - 1n;
  return state.signed && v >= m >> 1n ? v - m : v;
}

// ── Math helpers ─────────────────────────────────────────────────────────────
export const bigAbs = x => (x < 0n ? -x : x);

export function gcd(a, b) {
  a = bigAbs(a); b = bigAbs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function modpow(b, e, m) {
  if (m <= 0n) throw Error('modulus must be positive');
  if (e < 0n) return modpow(modinv(b, m), -e, m);
  let r = 1n % m;
  b = ((b % m) + m) % m;
  while (e > 0n) {
    if (e & 1n) r = r * b % m;
    b = b * b % m;
    e >>= 1n;
  }
  return r;
}

export function modinv(a, m) {
  if (m === undefined) m = MOD;
  let [r0, r1] = [((a % m) + m) % m, m];
  let [s0, s1] = [1n, 0n];
  while (r1) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw Error('no inverse');
  return ((s0 % m) + m) % m;
}

// Miller-Rabin primality test
const SMALL_PRIMES = [2n,3n,5n,7n,11n,13n,17n,19n,23n,29n,31n,37n];

export function isprime(n) {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n, r = 0;
  while (!(d & 1n)) { d >>= 1n; r++; }
  for (const a of SMALL_PRIMES) {
    let x = modpow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let i = 1; i < r; i++) {
      x = x * x % n;
      if (x === n - 1n) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

// Pollard's rho factorisation
function rho(n) {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; ; c++) {
    let x = 2n, y = 2n, d = 1n;
    const f = v => (v * v + c) % n;
    while (d === 1n) { x = f(x); y = f(f(y)); d = gcd(x - y, n); }
    if (d !== n) return d;
  }
}

function factorMap(n) {
  n = bigAbs(n);
  const out = new Map();
  const add = p => out.set(p, (out.get(p) || 0) + 1);
  if (n < 2n) return out;
  for (let p = 2n; p < 1000n && p * p <= n; p++)
    while (n % p === 0n) { add(p); n /= p; }
  const go = m => {
    if (m === 1n) return;
    if (isprime(m)) { add(m); return; }
    const d = rho(m); go(d); go(m / d);
  };
  go(n);
  return out;
}

export function factor(n) {
  if (n < 2n && n > -2n) return String(n);
  return [...factorMap(n)]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([p, e]) => (e > 1 ? `${p}^${e}` : `${p}`))
    .join(' \xb7 ');
}

export function phi(n) {
  let r = bigAbs(n);
  for (const p of factorMap(n).keys()) r = r / p * (p - 1n);
  return r;
}

function isqrt(n) {
  if (n < 0n) throw Error('sqrt of negative');
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

export function popcount(x) {
  let c = 0; x = U(x);
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return BigInt(c);
}

export function clz(x) {
  x = U(x);
  return BigInt(Math.max(0, BW() - (x ? x.toString(2).length : 0)));
}

export function ctz(x) {
  x = U(x);
  if (!x) return BigInt(BW());
  let c = 0n;
  while (!(x & 1n)) { x >>= 1n; c++; }
  return c;
}

export const lowbit = x => { x = U(x); return x & -x; };
export const highestBit = x => { x = U(x); return x ? BigInt(x.toString(2).length - 1) : -1n; };

export function fact(n, m = MOD) {
  if (n < 0n || n > 5_000_000n) throw Error('n out of range');
  let r = 1n % m;
  for (let i = 2n; i <= n; i++) r = r * i % m;
  return r;
}

export function ncr(n, r, m = MOD) {
  if (r < 0n || r > n) return 0n;
  if (n - r < r) r = n - r;
  if (r > 5_000_000n) throw Error('r too large');
  let a = 1n, b = 1n;
  for (let i = 0n; i < r; i++) {
    a = a * ((n - i) % m) % m;
    b = b * (i + 1n) % m;
  }
  return a * modinv(b, m) % m;
}

export function fib(n, m = 0n) {
  if (n < 0n) throw Error('n must be >= 0');
  const R = x => (m ? ((x % m) + m) % m : x);
  const f = k => {
    if (!k) return [0n, 1n];
    const [a, b] = f(k >> 1n);
    const c = R(a * R(2n * b - a));
    const d = R(a * a + b * b);
    return k & 1n ? [d, R(c + d)] : [c, d];
  };
  return f(n)[0];
}

// ── Function table ────────────────────────────────────────────────────────────
export const FUNCTIONS = {
  gcd,
  lcm:     (a, b) => a && b ? bigAbs(a / gcd(a, b) * b) : 0n,
  modpow,
  inv:     (a, m) => modinv(a, m !== undefined ? m : MOD),
  isprime: n => isprime(n) ? 1n : 0n,
  factor,
  phi,
  popcount,
  clz,
  ctz,
  lowbit,
  hb:      highestBit,
  setbit:  (x, i) => x | (1n << i),
  clrbit:  (x, i) => x & ~(1n << i),
  flip:    (x, i) => x ^ (1n << i),
  ncr,
  fact,
  fib,
  sqrt:    isqrt,
  abs:     bigAbs,
  log2:    x => {
    if (x <= 0n) throw Error('log2 of non-positive');
    return BigInt(x.toString(2).length - 1);
  },
  min: (...a) => a.reduce((p, c) => (c < p ? c : p)),
  max: (...a) => a.reduce((p, c) => (c > p ? c : p)),
};

// ── Evaluator ────────────────────────────────────────────────────────────────
/**
 * Evaluate a CP-calc expression string.
 * Returns a BigInt or a string (for factor(), etc.).
 * Throws on error.
 */
export function evaluate(s) {
  // Tokenise
  const tokens = [];
  const re = /\s*(?:(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:e\d+)?)|([a-z_]\w*)|(\*\*|<<|>>|[-+*\/%&|^~(),]))/iy;
  while (re.lastIndex < s.length) {
    const at = re.lastIndex;
    const m = re.exec(s);
    if (!m) {
      if (/^\s*$/.test(s.slice(at))) break;
      throw Error('bad character');
    }
    tokens.push(m[1] ? { k: 'n', v: m[1] } : m[2] ? { k: 'i', v: m[2] } : { k: 'o', v: m[3] });
  }

  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const is   = v => peek() && peek().k === 'o' && peek().v === v;
  const eat  = v => { if (!is(v)) throw Error('expected ' + v); p++; };

  // C++ truncation-toward-zero division (BigInt already does this)
  const divTZ = (a, b) => {
    if (!b) throw Error('division by zero');
    return a / b;
  };
  // C++ remainder: sign follows dividend
  const remTZ = (a, b) => {
    if (!b) throw Error('division by zero');
    return a - divTZ(a, b) * b;
  };

  const OP = {
    '|':  (a, b) => a | b,
    '^':  (a, b) => a ^ b,
    '&':  (a, b) => a & b,
    '<<': (a, b) => { if (b < 0n || b > 4096n) throw Error('bad shift'); return a << b; },
    '>>': (a, b) => { if (b < 0n) throw Error('bad shift'); return a >> b; },
    '+':  (a, b) => a + b,
    '-':  (a, b) => a - b,
    '*':  (a, b) => a * b,
    '/':  divTZ,
    '%':  remTZ,
  };

  const left = (sub, ops) => () => {
    let a = sub();
    while (peek() && peek().k === 'o' && ops.includes(peek().v)) {
      const o = next().v;
      a = OP[o](a, sub());
    }
    return a;
  };

  // Forward-declare prim so unary/pw can call it
  let prim;

  const unary = () => {
    if (is('-')) { p++; return -unary(); }
    if (is('+')) { p++; return unary(); }
    if (is('~')) { p++; return ~unary(); }
    return pw();
  };

  const pw = () => {
    const b = prim();
    if (is('**')) {
      p++;
      const e = unary();
      if (typeof e === 'bigint') {
        if (e < 0n) throw Error('negative exponent');
        if (e > 100_000n) throw Error('exponent too large');
        return b ** e;
      }
    }
    return b;
  };

  const mul = left(unary, ['*', '/', '%']);
  const add = left(mul,   ['+', '-']);
  const sh  = left(add,   ['<<', '>>']);
  const an  = left(sh,    ['&']);
  const xr  = left(an,    ['^']);
  const or  = left(xr,    ['|']);

  prim = () => {
    const x = next();
    if (!x) throw Error('unexpected end');

    if (x.k === 'n') {
      const em = /^(\d+)e(\d+)$/i.exec(x.v);
      if (em) return BigInt(em[1]) * 10n ** BigInt(em[2]);
      return BigInt(x.v);
    }

    if (x.k === 'i') {
      if (is('(')) {
        const fn = FUNCTIONS[x.v.toLowerCase()];
        if (!fn) throw Error('unknown function ' + x.v);
        p++;
        const args = [];
        if (!is(')')) {
          do { args.push(or()); } while (is(',') && ++p);
        }
        eat(')');
        return fn(...args);
      }
      const u = x.v.toUpperCase();
      if (u === 'ANS') return BigInt(state.lastAns || '0');
      if (u in CONSTANTS) return CONSTANTS[u];
      throw Error('unknown name ' + x.v);
    }

    if (x.v === '(') {
      const v = or();
      eat(')');
      return v;
    }

    throw Error('unexpected ' + x.v);
  };

  const result = or();
  if (p < tokens.length) throw Error('unexpected ' + tokens[p].v);
  return result;
}
