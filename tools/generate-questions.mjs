#!/usr/bin/env node
// Generates js/data/grade1.js, grade2.js, grade3.js — 100 math exercises each.
// Seeded PRNG, so re-running produces the same question sets. Change SEED for new sets.
// Usage: node tools/generate-questions.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'js', 'data');
const SEED = 0x51d3;
const PER_GRADE = 100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const ri = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Two plausible wrong answers + the right one, shuffled onto the three buildings.
function makeChoices(answer, wrongCandidates) {
  const wrong = new Set();
  for (const w of shuffle(wrongCandidates)) {
    if (wrong.size < 2 && Number.isInteger(w) && w >= 0 && w !== answer) wrong.add(w);
  }
  let off = 1;
  while (wrong.size < 2) {
    for (const w of [answer + off, answer - off]) {
      if (wrong.size < 2 && w >= 0 && w !== answer && !wrong.has(w)) wrong.add(w);
    }
    off += 1;
  }
  return shuffle([answer, ...wrong]);
}

const NEAR = [-3, -2, -1, 1, 2, 3];
const TENS = [-10, -2, -1, 1, 2, 10];

function addQ(a, b, big = false) {
  const ans = a + b;
  const offs = big ? TENS : NEAR;
  return { q: `${a} + ${b}`, a: ans, c: makeChoices(ans, offs.map((o) => ans + o)) };
}

function subQ(a, b, big = false) {
  const ans = a - b;
  const offs = big ? TENS : NEAR;
  return { q: `${a} - ${b}`, a: ans, c: makeChoices(ans, offs.map((o) => ans + o)) };
}

function mulQ(a, b) {
  const ans = a * b;
  const cands = [(a + 1) * b, (a - 1) * b, a * (b + 1), a * (b - 1), ans + 1, ans - 1, ans + 2, ans - 2];
  return { q: `${a} × ${b}`, a: ans, c: makeChoices(ans, cands) };
}

function divQ(divisor, quotient) {
  const dividend = divisor * quotient;
  const cands = [quotient + 1, quotient - 1, quotient + 2, quotient - 2, divisor];
  return { q: `${dividend} ÷ ${divisor}`, a: quotient, c: makeChoices(quotient, cands) };
}

function addUnique(list, seen, count, gen) {
  let added = 0;
  let guard = 0;
  while (added < count) {
    if (++guard > 20000) throw new Error('Generator stuck — quota unreachable');
    const item = gen();
    if (seen.has(item.q)) continue;
    seen.add(item.q);
    list.push(item);
    added += 1;
  }
}

// Grade 1: addition and subtraction within 20.
function grade1() {
  const list = [];
  const seen = new Set();
  addUnique(list, seen, 30, () => { const a = ri(1, 9); return addQ(a, ri(1, 10 - a)); });
  addUnique(list, seen, 25, () => { const a = ri(2, 10); return addQ(a, ri(Math.max(1, 11 - a), 10)); });
  addUnique(list, seen, 30, () => { const a = ri(2, 10); return subQ(a, ri(1, a - 1)); });
  addUnique(list, seen, 15, () => subQ(ri(11, 20), ri(2, 9)));
  return shuffle(list);
}

// Grade 2: addition/subtraction within 100, easy times tables (2, 3, 4, 5, 10).
function grade2() {
  const list = [];
  const seen = new Set();
  addUnique(list, seen, 20, () => addQ(ri(12, 89), ri(3, 9), true));
  addUnique(list, seen, 15, () => { const a = ri(11, 69); return addQ(a, ri(11, Math.min(79, 99 - a)), true); });
  addUnique(list, seen, 20, () => subQ(ri(13, 99), ri(3, 9), true));
  addUnique(list, seen, 15, () => { const a = ri(35, 99); return subQ(a, ri(11, a - 12), true); });
  addUnique(list, seen, 30, () => {
    const t = pick([2, 3, 4, 5, 10]);
    const k = ri(2, 10);
    return rand() < 0.5 ? mulQ(t, k) : mulQ(k, t);
  });
  return shuffle(list);
}

// Grade 3: full times tables, division, bigger addition/subtraction.
function grade3() {
  const list = [];
  const seen = new Set();
  addUnique(list, seen, 7, () => addQ(ri(45, 99), ri(45, 99), true));
  addUnique(list, seen, 8, () => addQ(ri(110, 880), ri(15, 99), true));
  addUnique(list, seen, 7, () => subQ(ri(110, 199), ri(15, 95), true));
  addUnique(list, seen, 8, () => subQ(ri(200, 999), ri(25, 99), true));
  addUnique(list, seen, 40, () => mulQ(ri(2, 10), ri(2, 10)));
  addUnique(list, seen, 30, () => divQ(ri(2, 10), ri(2, 10)));
  return shuffle(list);
}

const OPS = {
  '+': (x, y) => x + y,
  '-': (x, y) => x - y,
  '×': (x, y) => x * y,
  '÷': (x, y) => x / y,
};

function validate(grade, list) {
  if (list.length !== PER_GRADE) throw new Error(`grade ${grade}: expected ${PER_GRADE}, got ${list.length}`);
  const seen = new Set();
  for (const { q, a, c } of list) {
    if (seen.has(q)) throw new Error(`grade ${grade}: duplicate question "${q}"`);
    seen.add(q);
    const [x, op, y] = q.split(' ');
    const expected = OPS[op](Number(x), Number(y));
    if (expected !== a) throw new Error(`grade ${grade}: "${q}" — stored answer ${a}, actual ${expected}`);
    if (c.length !== 3 || new Set(c).size !== 3) throw new Error(`grade ${grade}: "${q}" — choices not 3 unique values`);
    if (!c.includes(a)) throw new Error(`grade ${grade}: "${q}" — choices missing the answer`);
    if (c.some((v) => !Number.isInteger(v) || v < 0)) throw new Error(`grade ${grade}: "${q}" — bad choice value`);
  }
}

function emit(grade, list) {
  const lines = list.map((o) => `  { q: ${JSON.stringify(o.q)}, a: ${o.a}, c: [${o.c.join(', ')}] },`);
  const body = [
    '// Auto-generated by tools/generate-questions.mjs — do not edit by hand.',
    `// ${list.length} math exercises for grade ${grade}.`,
    'window.SPIDERMATH_DATA = window.SPIDERMATH_DATA || {};',
    `window.SPIDERMATH_DATA.grade${grade} = [`,
    ...lines,
    '];',
    '',
  ].join('\n');
  writeFileSync(join(OUT_DIR, `grade${grade}.js`), body);
}

mkdirSync(OUT_DIR, { recursive: true });
const grades = { 1: grade1(), 2: grade2(), 3: grade3() };
for (const [grade, list] of Object.entries(grades)) {
  validate(grade, list);
  emit(grade, list);
  const ops = {};
  for (const { q } of list) {
    const op = q.split(' ')[1];
    ops[op] = (ops[op] || 0) + 1;
  }
  process.stdout.write(`grade ${grade}: ${list.length} exercises (${Object.entries(ops).map(([k, v]) => `${v}${k}`).join(', ')})\n`);
}
process.stdout.write(`Written to ${OUT_DIR}\n`);
