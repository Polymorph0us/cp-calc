/**
 * CP Calc // 2088 – Main Application Controller
 * Vaporwave & Outrun Edition
 * Requires: engine.js
 */

import {
  evaluate, state as engineState, wrap, U,
  popcount, clz, ctz, lowbit, highestBit,
  MOD, MOD2, INT_MAX, INT_MIN, UINT_MAX, LLONG_MAX, LLONG_MIN, ULLONG_MAX,
} from './engine.js';

// ── Capacitor plugin stubs (replaced by real ones in native context) ───────
const Haptics = window.Capacitor?.Plugins?.Haptics ?? {
  impact: () => {},
  notification: () => {},
  selectionStart: () => {},
};

// ── Persistence ────────────────────────────────────────────────────────────
const STORAGE_KEY = 'cpc2';
const DEFAULT_STATE = {
  width: 64,
  signed: true,
  history: [],     // [{expr, result}]
  lastAns: '0',
};

let S = { ...DEFAULT_STATE };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  Object.assign(S, saved);
} catch (_) {}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (_) {}
}

// Sync engine state
function syncEngine() {
  engineState.width  = S.width;
  engineState.signed = S.signed;
  engineState.lastAns = S.lastAns;
}
syncEngine();

// ── Expression state ───────────────────────────────────────────────────────
let expr = '';           // current expression string
let lastResult = null;   // BigInt | string | null
let lastResultStr = '';  // string representation of lastResult (raw)
let currentRawHex = '';  // raw hex string with 0x
let currentRawBin = '';  // raw binary string with 0b
let currentRawOct = '';  // raw octal string with 0o
let afterEq = false;     // just pressed =
let hexMode = false;     // showing hex quick row

// ── EST state ──────────────────────────────────────────────────────────────
let estTarget = 'n';    // active field: 'n' | 'ops'
let estN = '';
let estOps = '1e8';
let estCx = 'n2';

// ── BITS state ─────────────────────────────────────────────────────────────
let bitsValue = 0n;
let bitsUndoStack = [];
let activeBitsMode = 'grid'; // 'grid' | 'sim' | 'submasks'

// Simulator state
let simOp = '&';
let simOperandB = 0xFFn;
let simOperandBStr = '0xFF';

// Submasks DP state
let submaskM = 0n;
let submaskS = 0n;
let submaskHistory = [];
let submaskIndex = 0;
let submaskAutoTimer = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const elExpr    = $('expr');
const elResult  = $('result');
const elHexLine = $('hex-line');
const elBinLine = $('bin-line');

const elQuickRow    = document.getElementById('quick-row');
const elHexQuickRow = document.getElementById('hex-quick-row');
const elKeypad      = $('keypad');

const elFxOverlay  = $('fx-overlay');
const elFxSheet    = $('fx-sheet');
const elFxContent  = $('fx-content');

const elHistOverlay = $('hist-overlay');
const elHistSheet   = $('hist-sheet');
const elHistList    = $('hist-list');

const elToast = $('toast');

// ── Utility ────────────────────────────────────────────────────────────────
function groupBy4(s) {
  return s.replace(/(?=(?:.{4})+$)/g, ' ').trim();
}

function formatDigits3(s) {
  if (!s || typeof s !== 'string') return s;
  const neg = s.startsWith('-');
  const raw = neg ? s.slice(1) : s;
  const parts = raw.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + parts.join('.');
}

function adjustResultFontSize(text) {
  const len = (text || '').length;
  let size = 56;
  if (len > 8) {
    size = Math.max(28, Math.round(56 - (len - 8) * 1.8));
  }
  elResult.style.fontSize = `${size}px`;
}

function adjustExprFontSize() {
  const len = expr.length;
  let size = 22;
  if (len > 18) {
    size = Math.max(16, Math.round(22 - (len - 18) * 0.4));
  }
  elExpr.style.fontSize = `${size}px`;
  requestAnimationFrame(() => {
    elExpr.scrollLeft = elExpr.scrollWidth;
  });
}

function showToast(msg) {
  elToast.textContent = msg;
  elToast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => elToast.classList.remove('show'), 1500);
}

function copyText(text, label = 'COPIED') {
  if (!text) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast(label)).catch(() => showToast(label));
  } else {
    showToast(label);
  }
}

function hapticTick() {
  Haptics.impact({ style: 'LIGHT' }).catch?.(() => {});
}
function hapticEq() {
  Haptics.impact({ style: 'MEDIUM' }).catch?.(() => {});
}

// ── Width / signed chips ───────────────────────────────────────────────────
function updateWidthChips() {
  document.querySelectorAll('#width-chips .chip').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.w) === S.width);
  });
}
function updateSignChips() {
  $('chip-signed').classList.toggle('active', S.signed);
  $('chip-unsigned').classList.toggle('active', !S.signed);
}

document.querySelectorAll('#width-chips .chip').forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    hapticTick();
    S.width = Number(btn.dataset.w);
    syncEngine();
    save();
    updateWidthChips();
    renderCalc();
    renderBits();
    if (activeBitsMode === 'sim') renderSimUI();
    if (activeBitsMode === 'submasks') initSubmasks();
  });
});

$('chip-signed').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  S.signed = true;
  syncEngine(); save(); updateSignChips(); renderCalc(); renderBits();
});
$('chip-unsigned').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  S.signed = false;
  syncEngine(); save(); updateSignChips(); renderCalc(); renderBits();
});

// ── Calculator core ────────────────────────────────────────────────────────
function renderCalc() {
  // Expression
  elExpr.innerHTML = `<span>${escHtml(expr) || '&nbsp;'}</span>`;
  adjustExprFontSize();

  // Result
  if (!expr.trim()) {
    elResult.textContent = '0';
    elResult.className = 'result dim';
    adjustResultFontSize('0');
    elHexLine.textContent = '';
    elBinLine.textContent = '';
    currentRawHex = '';
    currentRawBin = '';
    return;
  }

  try {
    const raw = evaluate(expr);
    if (typeof raw === 'string') {
      elResult.textContent = raw;
      elResult.className = 'result dim';
      adjustResultFontSize(raw);
      elHexLine.textContent = '';
      elBinLine.textContent = '';
      currentRawHex = '';
      currentRawBin = '';
      return;
    }
    const v = wrap(raw);
    const neg = !S.width && v < 0n;
    const u   = neg ? -v : U(v);
    const pre = neg ? '-' : '';
    const pad = S.width || 0;

    const hx = u.toString(16).toUpperCase().padStart(pad / 4, '0');
    const bn = u.toString(2).padStart(pad, '0');

    currentRawHex = pre + '0x' + hx;
    currentRawBin = pre + '0b' + bn;

    elHexLine.textContent = pre + '0x' + groupBy4(hx);
    elBinLine.textContent = pre + '0b' + groupBy4(bn);
    const rawStr = v.toString();
    lastResultStr = rawStr;
    elResult.textContent = formatDigits3(rawStr);
    adjustResultFontSize(elResult.textContent);
    elResult.className = afterEq ? 'result bright' : 'result dim';
  } catch (_) {
    elResult.textContent = afterEq ? _.message || String(_) : '';
    adjustResultFontSize(elResult.textContent);
    elResult.className = afterEq ? 'result error' : 'result dim';
    elHexLine.textContent = '';
    elBinLine.textContent = '';
    currentRawHex = '';
    currentRawBin = '';
  }
}

function insertText(text) {
  // After = : digit → fresh; operator → continue from result
  if (afterEq) {
    if (/^\d|^0x|^0b|^ans$/i.test(text)) {
      // Fresh start
      expr = text === 'ans' ? lastResultStr : text;
    } else {
      // Continue: prepend result
      expr = lastResultStr + text;
    }
    afterEq = false;
  } else {
    expr += text;
  }

  // Detect hex mode
  const m = /0x([0-9a-fA-F]*)$/i.exec(expr);
  hexMode = !!m;
  elHexQuickRow.classList.toggle('hidden', !hexMode);
  elQuickRow.classList.toggle('hidden', hexMode);

  renderCalc();
}

function backspace() {
  if (afterEq) { afterEq = false; return; }
  if (!expr.length) return;
  // Remove last char (handle multi-char operators: <<, >>, **, 0x, 0b)
  if (expr.endsWith('<<') || expr.endsWith('>>') || expr.endsWith('**') || expr.endsWith('0x') || expr.endsWith('0b')) {
    expr = expr.slice(0, -2);
  } else {
    expr = expr.slice(0, -1);
  }
  hexMode = /0x[0-9a-fA-F]*$/i.test(expr);
  elHexQuickRow.classList.toggle('hidden', !hexMode);
  elQuickRow.classList.toggle('hidden', hexMode);
  renderCalc();
}

function doEquals() {
  if (!expr.trim()) return;
  try {
    const raw = evaluate(expr);
    const v   = typeof raw === 'bigint' ? wrap(raw) : raw;
    lastResult    = v;
    lastResultStr = typeof v === 'bigint' ? v.toString() : String(v);
    // Save to history (max 50)
    S.history = [
      { expr, result: lastResultStr },
      ...S.history.filter(h => h.expr !== expr),
    ].slice(0, 50);
    S.lastAns = lastResultStr;
    engineState.lastAns = lastResultStr;
    save();
    afterEq = true;
    renderCalc();
    // update bits view with numeric result
    if (typeof v === 'bigint') {
      bitsValue = wrap(v);
      renderBits();
      if (activeBitsMode === 'sim') renderSimUI();
      if (activeBitsMode === 'submasks') initSubmasks();
    }
  } catch (err) {
    elResult.textContent = err.message || String(err);
    adjustResultFontSize(elResult.textContent);
    elResult.className = 'result error';
    afterEq = true;
  }
}

// ── Smart paren ────────────────────────────────────────────────────────────
function smartParen() {
  const open  = (expr.match(/\(/g) || []).length;
  const close = (expr.match(/\)/g) || []).length;
  const trimmed = expr.trim();
  const lastChar = trimmed.slice(-1);
  const isOp = /[\(\+\-\*\/\%\|\&\^\~<,]/.test(lastChar);
  if (open > close && trimmed.length > 0 && !isOp) {
    insertText(')');
  } else {
    insertText('(');
  }
}

// ── Keypad events ──────────────────────────────────────────────────────────
function handleKey(el) {
  const ins = el.dataset.ins;
  if (ins !== undefined) {
    const map = { '×': '*', '−': '-' };
    const actual = map[ins] ?? ins;
    insertText(actual);
    return;
  }
  const id = el.id;
  if (id === 'key-ac')    { expr = ''; afterEq = false; hexMode = false; elHexQuickRow.classList.add('hidden'); elQuickRow.classList.remove('hidden'); renderCalc(); return; }
  if (id === 'key-back')  { backspace(); return; }
  if (id === 'key-eq')    { doEquals(); hapticEq(); return; }
  if (id === 'key-paren') { smartParen(); return; }
}

elKeypad.addEventListener('pointerdown', e => {
  const key = e.target.closest('.key');
  if (!key) return;
  e.preventDefault();
  hapticTick();
  handleKey(key);
});

// Back: long-press repeats
let backRepeatTimer = null;
const KEY_BACK = $('key-back');
KEY_BACK.addEventListener('pointerdown', e => {
  e.stopPropagation();
  e.preventDefault();
  hapticTick();
  backspace();
  backRepeatTimer = setTimeout(function rep() {
    backspace();
    backRepeatTimer = setTimeout(rep, 80);
  }, 400);
});
KEY_BACK.addEventListener('pointerup',    () => clearTimeout(backRepeatTimer));
KEY_BACK.addEventListener('pointerleave', () => clearTimeout(backRepeatTimer));

// ── Quick row ───────────────────────────────────────────────────────────────
function handleQkey(btn) {
  const ins = btn.dataset.ins;
  const id  = btn.id;
  if (ins !== undefined) { insertText(ins); return; }
  if (id === 'btn-0x') { insertText('0x'); return; }
  if (id === 'btn-0b') { insertText('0b'); return; }
  if (id === 'btn-fx' || id === 'btn-fx2') { openFxSheet(); return; }
}

[elQuickRow, elHexQuickRow].forEach(row => {
  row.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.qkey');
    if (!btn) return;
    e.preventDefault();
    hapticTick();
    handleQkey(btn);
  });
});

// ── Display swipe-left to delete ────────────────────────────────────────────
let swipeStartX = 0;
$('display').addEventListener('pointerdown', e => { swipeStartX = e.clientX; });
$('display').addEventListener('pointerup', e => {
  if (e.clientX - swipeStartX < -40) backspace();
});

// ── Copy result on tap ──────────────────────────────────────────────────────
$('result').addEventListener('click', () => {
  if (lastResultStr && elResult.textContent !== '0' && elResult.className !== 'result dim') {
    hapticTick();
    copyText(lastResultStr, 'COPIED RAW DEC');
  }
});

// ── Copy hex / bin ─────────────────────────────────────────────────────────
$('hex-line').addEventListener('click', () => {
  if (currentRawHex) { hapticTick(); copyText(currentRawHex, 'COPIED HEX'); }
});
$('bin-line').addEventListener('click', () => {
  if (currentRawBin) { hapticTick(); copyText(currentRawBin, 'COPIED BIN'); }
});

// ── f(x) sheet ─────────────────────────────────────────────────────────────
const FX_CATEGORIES = {
  numtheory: [
    'gcd', 'lcm', 'modpow', 'inv', 'isprime', 'factor', 'phi',
    'ncr', 'fact', 'fib', 'sqrt', 'log2', 'min', 'max', 'abs',
  ],
  bits: ['popcount', 'clz', 'ctz', 'lowbit', 'hb', 'setbit', 'clrbit', 'flip'],
  const: ['MOD', 'MOD2', 'INT_MAX', 'INT_MIN', 'UINT_MAX', 'LLONG_MAX', 'ULLONG_MAX', '**'],
};

let activeCat = 'numtheory';

function renderFxContent() {
  const items = FX_CATEGORIES[activeCat];
  elFxContent.innerHTML = items.map(name => {
    const isConst = activeCat === 'const';
    const isBit   = activeCat === 'bits';
    const cls = isConst ? 'fx-btn const' : isBit ? 'fx-btn bits' : 'fx-btn';
    const ins = isConst ? name : (name + '(');
    return `<button class="${cls}" data-ins="${escHtml(ins)}">${escHtml(name)}</button>`;
  }).join('');
}

function openFxSheet() {
  renderFxContent();
  elFxOverlay.classList.add('open');
  elFxSheet.classList.add('open');
}

function closeFxSheet() {
  elFxOverlay.classList.remove('open');
  elFxSheet.classList.remove('open');
}

$('btn-fx').addEventListener('pointerdown', e => { e.preventDefault(); hapticTick(); openFxSheet(); });
$('btn-fx2').addEventListener('pointerdown', e => { e.preventDefault(); hapticTick(); openFxSheet(); });

elFxOverlay.addEventListener('pointerdown', closeFxSheet);

elFxSheet.querySelectorAll('.sheet-tab').forEach(tab => {
  tab.addEventListener('pointerdown', e => {
    e.preventDefault();
    hapticTick();
    activeCat = tab.dataset.cat;
    elFxSheet.querySelectorAll('.sheet-tab').forEach(t => t.classList.toggle('active', t === tab));
    renderFxContent();
  });
});

elFxContent.addEventListener('pointerdown', e => {
  const btn = e.target.closest('.fx-btn');
  if (!btn) return;
  e.preventDefault();
  hapticTick();
  insertText(btn.dataset.ins);
  closeFxSheet();
});

// ── History sheet ───────────────────────────────────────────────────────────
function renderHistList() {
  if (!S.history.length) {
    elHistList.innerHTML = '<div style="color:var(--fg-dim);padding:12px 8px;font-size:12px;font-family:var(--font-mono);">&gt; NO LOGS RECORDED. EXECUTE [=] TO LOG.</div>';
    return;
  }
  elHistList.innerHTML = S.history.map((h, i) =>
    `<div class="hist-item" data-i="${i}" role="listitem">
      <span class="hist-expr">${escHtml(h.expr)}</span>
      <span class="hist-result">${escHtml(h.result)}</span>
    </div>`
  ).join('');

  // Swipe-to-delete
  elHistList.querySelectorAll('.hist-item').forEach(item => {
    let sx = 0;
    item.addEventListener('pointerdown', e => { sx = e.clientX; });
    item.addEventListener('pointerup', e => {
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 60) {
        const idx = Number(item.dataset.i);
        S.history.splice(idx, 1);
        save();
        renderHistList();
      }
    });
  });
}

function openHistSheet() {
  renderHistList();
  elHistOverlay.classList.add('open');
  elHistSheet.classList.add('open');
}

function closeHistSheet() {
  elHistOverlay.classList.remove('open');
  elHistSheet.classList.remove('open');
}

$('btn-history').addEventListener('pointerdown', e => {
  e.preventDefault(); hapticTick(); openHistSheet();
});
elHistOverlay.addEventListener('pointerdown', closeHistSheet);

elHistList.addEventListener('pointerdown', e => {
  const item = e.target.closest('.hist-item');
  if (!item) return;
  e.preventDefault();
  hapticTick();
  const h = S.history[Number(item.dataset.i)];
  if (h) {
    expr = h.expr;
    afterEq = false;
    hexMode = /0x[0-9a-fA-F]*$/i.test(expr);
    elHexQuickRow.classList.toggle('hidden', !hexMode);
    elQuickRow.classList.toggle('hidden', hexMode);
    renderCalc();
    closeHistSheet();
    switchTab('calc');
  }
});

$('btn-clear-hist').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  S.history = [];
  save();
  renderHistList();
});

// Swipe down on display opens history
let displaySwipeStartY = 0;
$('display').addEventListener('pointerdown', e => { displaySwipeStartY = e.clientY; });
$('display').addEventListener('pointerup', e => {
  if (e.clientY - displaySwipeStartY > 50) openHistSheet();
});

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('pointerdown', e => {
    e.preventDefault();
    hapticTick();
    switchTab(tab.dataset.tab);
  });
});

// ── BITS STUDIO & SIMULATOR ─────────────────────────────────────────────────

// Switch BITS Mode (GRID, SIM, SUBMASKS)
function switchBitsMode(mode) {
  activeBitsMode = mode;
  document.querySelectorAll('.bit-tab').forEach(t => t.classList.toggle('active', t.dataset.bmode === mode));
  document.querySelectorAll('.bview').forEach(v => v.classList.toggle('active', v.id === 'bview-' + mode));
  if (mode === 'sim') renderSimUI();
  if (mode === 'submasks') initSubmasks();
}

document.querySelectorAll('.bit-tab').forEach(tab => {
  tab.addEventListener('pointerdown', e => {
    e.preventDefault();
    hapticTick();
    switchBitsMode(tab.dataset.bmode);
  });
});

function renderBits() {
  const w = S.width || 64;
  const v = bitsValue;
  const uv = U(v) & ((1n << BigInt(w)) - 1n);

  // Readouts
  const neg = !S.width && v < 0n;
  const uabs = neg ? -v : uv;
  const pre = neg ? '-' : '';
  const hx = uabs.toString(16).toUpperCase().padStart(Math.ceil(w / 4), '0');
  const bn = uabs.toString(2).padStart(w, '0');
  const oc = uabs.toString(8);

  currentRawHex = pre + '0x' + hx;
  currentRawBin = pre + '0b' + bn;
  currentRawOct = pre + '0o' + oc;

  $('bd-dec').textContent = formatDigits3(v.toString());
  $('bd-hex').textContent = pre + '0x' + groupBy4(hx);
  
  // Format binary into 4-bit nibbles so it scrolls cleanly without clipping
  $('bd-bin').textContent = pre + '0b ' + groupBy4(bn);
  $('bd-oct').textContent = pre + '0o' + oc;

  // Stats
  $('bs-pop').textContent = popcount(v).toString();
  $('bs-clz').textContent = clz(v).toString();
  $('bs-ctz').textContent = ctz(v).toString();
  $('bs-lb').textContent  = lowbit(v).toString();
  $('bs-hb').textContent  = highestBit(v).toString();

  // Grid
  const grid = $('bit-grid');
  let html = '';
  for (let i = w - 1; i >= 0; i--) {
    const bit = Number((uv >> BigInt(i)) & 1n);
    const nibbleGap = (i % 4 === 0 && i % 8 !== 0) ? ' nibble-gap' : '';
    const byteGap = (i < w - 1 && i % 8 === 7) ? ' byte-gap' : '';
    html += `<button class="bit-cell${bit ? ' set' : ''}${nibbleGap}${byteGap}" data-i="${i}" aria-label="bit ${i}: ${bit}">
      ${bit}<span class="bit-idx">${i}</span>
    </button>`;
  }
  grid.innerHTML = html;
}

// Bit Grid Toggle
$('bit-grid').addEventListener('pointerdown', e => {
  const cell = e.target.closest('.bit-cell');
  if (!cell) return;
  e.preventDefault();
  hapticTick();
  const i = BigInt(cell.dataset.i);
  bitsUndoStack.push(bitsValue);
  bitsValue = wrap(U(bitsValue) ^ (1n << i));
  $('btn-undo').classList.remove('hidden');
  expr = bitsValue.toString();
  afterEq = false;
  renderBits();
  renderCalc();
  if (activeBitsMode === 'sim') renderSimUI();
  if (activeBitsMode === 'submasks') initSubmasks();
});

// Undo
$('btn-undo').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  if (!bitsUndoStack.length) return;
  bitsValue = bitsUndoStack.pop();
  if (!bitsUndoStack.length) $('btn-undo').classList.add('hidden');
  expr = bitsValue.toString();
  afterEq = false;
  renderBits();
  renderCalc();
  if (activeBitsMode === 'sim') renderSimUI();
  if (activeBitsMode === 'submasks') initSubmasks();
});

// Bit Actions
document.querySelectorAll('.bit-action').forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    hapticTick();
    const w = S.width || 64;
    const m = (1n << BigInt(w)) - 1n;
    bitsUndoStack.push(bitsValue);
    const uv = U(bitsValue) & m;
    switch (btn.dataset.act) {
      case 'shl1':   bitsValue = wrap((uv << 1n) & m); break;
      case 'shr1':   bitsValue = wrap(uv >> 1n); break;
      case 'not':    bitsValue = wrap(~uv & m); break;
      case 'lowbit': bitsValue = wrap(uv & -uv); break;
      case 'clrlow': bitsValue = wrap(uv & (uv - 1n)); break;
      case 'zero':   bitsValue = 0n; break;
      case 'ones':   bitsValue = wrap(m); break;
    }
    $('btn-undo').classList.remove('hidden');
    expr = bitsValue.toString();
    afterEq = false;
    renderBits();
    renderCalc();
    if (activeBitsMode === 'sim') renderSimUI();
    if (activeBitsMode === 'submasks') initSubmasks();
  });
});

// ── Copy Readouts on Tap (Solving Clipping Problem) ─────────────────────────
$('readout-dec-box').addEventListener('click', () => {
  hapticTick(); copyText(bitsValue.toString(), 'COPIED DEC RAW');
});
$('readout-hex-box').addEventListener('click', () => {
  hapticTick(); copyText(currentRawHex, 'COPIED HEX RAW');
});
$('readout-bin-box').addEventListener('click', () => {
  hapticTick(); copyText(currentRawBin, 'COPIED BIN RAW');
});
$('readout-oct-box').addEventListener('click', () => {
  hapticTick(); copyText(currentRawOct, 'COPIED OCT RAW');
});
$('btn-copy-bits').addEventListener('click', e => {
  e.stopPropagation();
  hapticTick(); copyText(currentRawHex, 'COPIED HEX RAW');
});

// ── Interactive Mask Simulator (SIM) ────────────────────────────────────────
function computeSim() {
  const w = S.width || 64;
  const m = (1n << BigInt(w)) - 1n;
  const a = U(bitsValue) & m;
  const b = U(simOperandB) & m;
  let res = 0n;
  switch (simOp) {
    case '&':  res = a & b; break;
    case '|':  res = a | b; break;
    case '^':  res = a ^ b; break;
    case '<<': res = (a << (b & 63n)) & m; break;
    case '>>': res = a >> (b & 63n); break;
  }
  return wrap(res);
}

function renderSimUI() {
  const aStr = `0x${U(bitsValue).toString(16).toUpperCase()} (${bitsValue.toString()})`;
  const bStr = `0x${U(simOperandB).toString(16).toUpperCase()} (${simOperandB.toString()})`;
  $('sim-val-a').textContent = aStr;
  $('sim-val-b').textContent = bStr;

  const res = computeSim();
  const hexRes = '0x' + U(res).toString(16).toUpperCase();
  $('sim-res-val').textContent = `${hexRes}  [DEC: ${res.toString()}]`;
}

document.querySelectorAll('.sim-op').forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    hapticTick();
    simOp = btn.dataset.simop;
    document.querySelectorAll('.sim-op').forEach(b => b.classList.toggle('active', b === btn));
    renderSimUI();
  });
});

document.querySelectorAll('.sim-preset').forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    hapticTick();
    const p = btn.dataset.preset;
    const w = S.width || 64;
    const m = (1n << BigInt(w)) - 1n;
    if (p === '0xFF') simOperandB = 0xFFn;
    else if (p === '0xFFFF') simOperandB = 0xFFFFn;
    else if (p === 'lowbit') simOperandB = U(bitsValue) & -U(bitsValue);
    else if (p === '1') simOperandB = 1n;
    else if (p === 'inv') simOperandB = ~U(bitsValue) & m;
    renderSimUI();
  });
});

$('btn-apply-sim').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  const res = computeSim();
  bitsUndoStack.push(bitsValue);
  bitsValue = res;
  $('btn-undo').classList.remove('hidden');
  expr = bitsValue.toString();
  afterEq = false;
  renderBits();
  renderCalc();
  renderSimUI();
  showToast('APPLIED TO CALC');
});

// ── Bitmask DP Submask Generator (SUBMASKS) ─────────────────────────────────
function initSubmasks() {
  const w = S.width || 64;
  const m = (1n << BigInt(w)) - 1n;
  submaskM = U(bitsValue) & m;
  submaskS = submaskM;
  submaskHistory = [submaskM];
  submaskIndex = 0;
  if (submaskAutoTimer) {
    clearInterval(submaskAutoTimer);
    submaskAutoTimer = null;
    $('btn-sm-auto').textContent = 'AUTO';
  }
  renderSubmasksUI();
}

function renderSubmasksUI() {
  const w = S.width || 64;
  $('sm-base-m').textContent = `0x${submaskM.toString(16).toUpperCase()} (${submaskM.toString()})`;
  
  const popK = Number(popcount(submaskM));
  const total = popK <= 50 ? (1n << BigInt(popK)).toString() : `2^${popK}`;
  $('sm-count').textContent = total;

  $('sm-step-info').textContent = `SUBMASK #${submaskIndex + 1} OF ${total}`;
  $('sm-s-dec').textContent = submaskS.toString();
  $('sm-s-hex').textContent = '0x' + submaskS.toString(16).toUpperCase();

  // Render visual bit badges showing which bits of M are present in s
  const vis = $('sm-bits-visual');
  let badges = '';
  for (let i = w - 1; i >= 0; i--) {
    const bitM = (submaskM >> BigInt(i)) & 1n;
    if (bitM) {
      const bitS = (submaskS >> BigInt(i)) & 1n;
      badges += `<span class="sm-bit-badge ${bitS ? 'sm-bit-on' : 'sm-bit-off'}">B${i}:${bitS}</span>`;
    }
  }
  if (!badges) badges = '<span style="color:var(--fg-dim);font-size:11px;">(Mask is 0 — only submask is 0)</span>';
  vis.innerHTML = badges;
}

function nextSubmaskStep() {
  if (submaskS === 0n) {
    // Cycled through all submasks
    return false;
  }
  submaskS = (submaskS - 1n) & submaskM;
  submaskIndex++;
  submaskHistory.push(submaskS);
  renderSubmasksUI();
  return true;
}

$('btn-sm-next').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  if (!nextSubmaskStep()) {
    showToast('CYCLE COMPLETE (s=0)');
  }
});

$('btn-sm-prev').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  if (submaskHistory.length > 1) {
    submaskHistory.pop();
    submaskS = submaskHistory[submaskHistory.length - 1];
    submaskIndex = Math.max(0, submaskIndex - 1);
    renderSubmasksUI();
  }
});

$('btn-sm-reset').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  submaskS = submaskM;
  submaskHistory = [submaskM];
  submaskIndex = 0;
  renderSubmasksUI();
});

$('btn-sm-auto').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  if (submaskAutoTimer) {
    clearInterval(submaskAutoTimer);
    submaskAutoTimer = null;
    $('btn-sm-auto').textContent = 'AUTO';
  } else {
    $('btn-sm-auto').textContent = 'STOP';
    submaskAutoTimer = setInterval(() => {
      const hasNext = nextSubmaskStep();
      if (!hasNext) {
        clearInterval(submaskAutoTimer);
        submaskAutoTimer = null;
        $('btn-sm-auto').textContent = 'AUTO';
        showToast('ITERATION FINISHED');
      }
    }, 280);
  }
});

$('btn-sm-push').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  expr = submaskS.toString();
  afterEq = false;
  renderCalc();
  showToast('LOADED TO CALC');
});

// ── EST Screen ──────────────────────────────────────────────────────────────
document.querySelectorAll('#est-complexity .chip').forEach(chip => {
  chip.addEventListener('pointerdown', e => {
    e.preventDefault();
    hapticTick();
    estCx = chip.dataset.cx;
    document.querySelectorAll('#est-complexity .chip').forEach(c => c.classList.toggle('active', c === chip));
    renderEst();
  });
});

$('est-ops-toggle').addEventListener('pointerdown', e => {
  e.preventDefault();
  hapticTick();
  estTarget = estTarget === 'n' ? 'ops' : 'n';
  updateEstTargetUI();
});

const elEstNWrap = $('est-n-wrap');
if (elEstNWrap) {
  elEstNWrap.addEventListener('pointerdown', () => {
    hapticTick();
    estTarget = 'n';
    updateEstTargetUI();
  });
}

const elEstOpsRow = document.querySelector('.est-ops-row');
if (elEstOpsRow) {
  elEstOpsRow.addEventListener('pointerdown', () => {
    hapticTick();
    estTarget = 'ops';
    updateEstTargetUI();
  });
}

function updateEstTargetUI() {
  const isOps = estTarget === 'ops';
  $('est-n').style.opacity = isOps ? '.45' : '1';
  $('est-ops-display').style.fontWeight = isOps ? '700' : '400';
  $('est-ops-display').style.color = isOps ? 'var(--neon-cyan)' : 'var(--fg-dim)';
}

$('est-keypad').addEventListener('pointerdown', e => {
  const key = e.target.closest('.key');
  if (!key) return;
  e.preventDefault();
  hapticTick();
  const val = key.dataset.est;

  if (val !== undefined) {
    if (estTarget === 'n') estN += val;
    else estOps += val;
    updateEstDisplay();
    renderEst();
    return;
  }
  if (key.classList.contains('est-back')) {
    if (estTarget === 'n') estN = estN.slice(0, -1);
    else estOps = estOps.slice(0, -1);
    updateEstDisplay();
    renderEst();
    return;
  }
  if (key.classList.contains('est-ac')) {
    if (estTarget === 'n') estN = '';
    else estOps = '';
    updateEstDisplay();
    renderEst();
    return;
  }
});

function updateEstDisplay() {
  $('est-n').textContent          = estN || '—';
  $('est-ops-display').textContent = estOps || '1e8';
}

function renderEst() {
  const out = $('est-result');
  const estCard = $('est-display');
  estCard.classList.remove('ok', 'warn', 'bad');

  if (!estN.trim()) {
    out.textContent = '';
    out.className = 'est-result mono';
    return;
  }
  try {
    const n = Number(estN);
    if (!isFinite(n) || n <= 0) throw Error('INVALID n VALUE');
    const ops = Number(estOps || '1e8');
    if (!isFinite(ops) || ops <= 0) throw Error('INVALID ops/s');
    const complexOps = {
      n:     x => x,
      nlogn: x => x * Math.log2(x),
      nsqrt: x => x * Math.sqrt(x),
      n2:    x => x * x,
      n3:    x => x ** 3,
      pow2:  x => 2 ** x,
    }[estCx](n);
    const sec = complexOps / ops;
    const opsFmt = complexOps.toExponential(2);
    if (sec <= 1) {
      estCard.classList.add('ok');
      out.className = 'est-result ok mono';
      out.textContent = `${opsFmt} OPS // SHOULD PASS (<1 s)`;
    } else if (sec <= 5) {
      estCard.classList.add('warn');
      out.className = 'est-result warn mono';
      out.textContent = `${opsFmt} OPS // BORDERLINE (~${sec.toFixed(1)} s)`;
    } else {
      estCard.classList.add('bad');
      out.className = 'est-result bad mono';
      out.textContent = `${opsFmt} OPS // LIKELY TLE (~${sec.toFixed(0)} s)`;
    }
  } catch (e) {
    estCard.classList.add('bad');
    out.className = 'est-result bad mono';
    out.textContent = e.message;
  }
}

// ── Status bar / safe areas (Capacitor) ────────────────────────────────────
async function setupStatusBar() {
  try {
    const { StatusBar } = window.Capacitor?.Plugins ?? {};
    if (StatusBar) {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setStyle({ style: 'DARK' });
    }
  } catch (_) {}
}

// ── Helper ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Boot ────────────────────────────────────────────────────────────────────
updateWidthChips();
updateSignChips();
renderCalc();
renderBits();
updateEstDisplay();
updateEstTargetUI();
setupStatusBar();
