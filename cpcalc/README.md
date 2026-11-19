# CP Calc — Competitive Programmer's Calculator // 2088

A fully offline, high-performance Android calculator app designed specifically for competitive programmers. Built with a **Vaporwave / Outrun Design System**, C++ calculation semantics, an interactive 64-bit **Bit Studio & DP Submask Simulator**, and a complexity estimator ("Will it pass?").

---

## Visual Design & Aesthetics

### Vaporwave / Outrun Design System
- **The Void & Synth Sun**: Deep void background (`#090014`) with a massive radial synth sun orb (`#FF9900` → `#FF00FF`) casting atmospheric glow.
- **3D Perspective Wireframe Grid**: Pure CSS 3D perspective grid floor receding toward the horizon (`perspective(280px) rotateX(64deg)`).
- **Global CRT Scanline Overlay**: Pointer-events-free scanlines and subtle cathode-ray tube texture for authentic retro-futurism.
- **Terminal Chrome**: Window title bars with vintage OS status dots (Pink `#FF00FF`, Cyan `#00FFFF`, Orange `#FF9900`) and command-line prompts (`> REGISTER_01`, `> BIT_STUDIO.EXE`, `> WILL_IT_PASS.EXE`).
- **Dynamic Skewed Keypad**: High-contrast neon keypad with `-skew-x-6` geometry un-skewing to normal on press/hover. Key color tiers:
  - **Digits**: Clean dark purple squircle with cyan laser rim.
  - **Arithmetic**: Electric cyan tint with bright cyan glow.
  - **Bitwise**: Hot magenta tint (`#FF00FF`) with magenta glow.
  - **AC / Backspace**: Neon pink-red accent.
  - **Equals (`=`)**: Vibrant sunset gradient (`#FF9900` → `#FF00FF`) with dual box-shadow glow.

---

## Features

### 1. Calc Screen
- Full expression evaluator with **strict C++ semantics**:
  - Integer division truncates toward zero (`5 / 2 = 2`, `-7 / 3 = -2`).
  - Modulo (`%`) takes the sign of the dividend (`-7 % 3 = -1`).
- BigInt precision arithmetic with automatic wrap at bit-width bounds (8, 16, 32, 64-bit, or $\infty$).
- Signed / Unsigned mode toggle (`sgn` / `uns`).
- Dual alternative display lines for instantaneous HEX and BIN conversion.
- Quick row for prefixes (`0x`, `0b`), constants, and functions.

### 2. Bits Screen (Bit Studio & Simulator)
Overhauled to solve mobile screen clipping and provide competitive programmers with an active simulation environment:
- **3-Mode Tab Switcher**:
  - **`GRID`**: 8-column × 8-row 64-bit interactive bit matrix. Tap any bit to flip it. Visual byte borders, bit index labels (63..0), and CP bit-twiddling action chips (`<<1`, `>>1`, `NOT`, `x&-x` lowbit, `x&(x-1)` clear-low, `zero`, `all 1s`).
  - **`SIM` (Interactive Bit Simulator)**: Test bitwise operations live ($A \text{ op } B$) with operands $A$ and $B$, operator selectors ($\&, |, \land, \ll, \gg$), and one-tap CP masks (`0xFF`, `0xFFFF`, `LOWBIT`, `1`, `~A`). Tap **EXECUTE & APPLY TO CALC** to push the simulated result directly into the calculator engine.
  - **`SUBMASKS` (Bitmask DP Submask Generator)**: Steps through all submasks of the current value using the canonical competitive programming submask iteration algorithm:
    $$s = (s - 1) \& M$$
    Displays total submasks ($2^K$), current step index, DEC/HEX values, and visual bit badges showing which bits of $M$ are present ($1$) vs absent ($0$) in $s$. Includes `< PREV`, `NEXT >`, `RESET`, `AUTO` playback, and `PUSH` to calculator.
- **Screen Clipping & Readout Solution**:
  - Replaced cramped columns with structured cards: DEC and HEX in the top row, OCT and "COPY RAW" in the bottom row.
  - Full 64-bit binary string (spans ~80 characters) is placed inside a dedicated horizontal scroll container (`.bits-bin-scroll`) with 4-bit nibble grouping (`0b 1111 0000 ...`). Never overflows or clips off-screen.
  - Tap any readout card to copy the formatted or raw value directly to the clipboard with toast feedback.
- Real-time bit statistics: `popcount`, `clz` (count leading zeros), `ctz` (count trailing zeros), `lowbit`, and `highest bit`.

### 3. Est Screen ("Will It Pass?")
- Complexity operations calculator for standard CP complexities: $O(n)$, $O(n \log n)$, $O(n \sqrt{n})$, $O(n^2)$, $O(n^3)$, $O(2^n)$.
- Live status calculation assuming $10^8$ operations/second:
  - $\le 1\text{ s}$: **`SHOULD PASS`** (Neon cyan glow)
  - $1\text{ s} - 5\text{ s}$: **`BORDERLINE`** (Neon orange glow)
  - $> 5\text{ s}$: **`LIKELY TLE`** (Neon magenta/red glow)

### 4. Function & Constant Sheets
- **Number Theory**: `gcd`, `lcm`, `modpow`, `inv`, `isprime`, `factor`, `phi`, `ncr`, `fact`, `fib`, `sqrt`, `log2`, `min`, `max`, `abs`.
- **Bit Manipulation**: `popcount`, `clz`, `ctz`, `lowbit`, `hb`, `setbit`, `clrbit`, `flip`.
- **Constants**: `MOD` ($10^9+7$), `MOD2` ($998244353$), `INT_MAX`, `INT_MIN`, `UINT_MAX`, `LLONG_MAX`, `LLONG_MIN`, `ULLONG_MAX`.

### 5. History Sheet
- Last 50 expressions saved in local storage.
- Tap to reload expression into calculator, swipe to delete, or clear all.

---

## Architecture & Codebase

```
cpcalc/
├── src/
│   ├── engine.js          # Pure C++ calculation engine (ESM, zero deps)
│   ├── engine.test.js     # 12 Node.js unit test vectors
│   ├── app.js             # UI controller, simulator, submask DP iterator
│   ├── style.css          # Vaporwave / Outrun design system & layout
│   ├── index.html         # Terminal shell, 3 screens, sheets, dialogs
│   └── icon.svg           # App icon
├── www/                   # Built web assets (minified, git-ignored)
├── android/               # Capacitor Android project
├── scripts/
│   └── build.mjs          # Safe minifier & bundler
├── capacitor.config.json
├── release.keystore       # Release signing key
└── package.json
```

---

## Build & Release

### Prerequisites
- Node.js >= 18
- Java >= 11 (OpenJDK 21 recommended)
- Android SDK (API 35, build-tools 35.0.0, arm64-v8a)

### Build Commands

```bash
# 1. Run engine unit tests
npm test
# Expected: 12 passed, 0 failed

# 2. Build web assets → www/
npm run build

# 3. Sync to Android project
npx cap sync android

# 4. Build signed release APK
cd android
./gradlew assembleRelease --no-daemon
```

### One-line Build
```bash
npm run build && npx cap sync android && cd android && ./gradlew assembleRelease --no-daemon
```

### Final Release APK
```
cpcalc/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk
```
- **File size**: **978,734 bytes (956 KB / 0.93 MB)** — well below the 5 MB hard limit!
- **Target ABI**: `arm64-v8a` only
- **Minification**: R8 enabled with aggressive resource shrinking
- **Security**: 100% offline (no `android.permission.INTERNET` declared)
- **Signature**: Verified with APK Signature Scheme v2

---

## Test Vectors

| Expression | Expected |
|---|---|
| `(1<<20) ^ 12345 % MOD` | `1060921` |
| `-7%3` | `-1` |
| `-2**2` | `-4` |
| `5/2` | `2` |
| `inv(3,MOD)` | `333333336` |
| `fib(100,MOD)` | `687995182` |
| `factor(600851475143)` | `71 · 839 · 1471 · 6857` |
| `1<<63` (signed 64-bit, wrapped) | `-9223372036854775808` |
| `~0` | `-1` |
| `clz(1)` (64-bit) | `63` |
| `phi(36)` | `12` |
