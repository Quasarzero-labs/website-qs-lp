// Runs the roaming agent's core exactly as shipped in script.js (between //<agent> and //</agent>)
// on simulated pages, and checks what the pages say about it. Run: node tests/agent.test.js
// The same agent on the real pages, in Chrome: node tests/agent.browser.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const m = js.match(/\/\/<agent>([\s\S]*?)\/\/<\/agent>/);
if (!m) { console.error('FAIL: //<agent> block not found'); process.exit(1); }
const A = new Function(m[1] + '\nreturn A;')();

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let fails = 0;
function ok(name, cond, detail) {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
  if (!cond) fails++;
}
const rng = mulberry32(20261118);

// A simulated page: a column of blocks (paragraphs, cards, rules) with margins around it
function page(w, h, gutter) {
  const rects = [], left = w > 900 ? (w - 1180) / 2 + gutter : gutter, right = w - left;
  for (let y = 80 + rng() * 60; y < h - 100;) {
    const kind = rng();
    if (kind < 0.15) { rects.push([left, y, right, y + 1]); y += 20 + rng() * 40; continue; }
    const cols = w > 900 && kind > 0.7 ? 3 : 1, cw = (right - left - (cols - 1) * 16) / cols, bh = 20 + rng() * 140;
    for (let k = 0; k < cols; k++) {
      const x0 = left + k * (cw + 16), x1 = x0 + cw * (0.4 + 0.6 * rng());
      rects.push([x0, y, x1, y + bh * (0.6 + 0.4 * rng())]);
    }
    y += bh + 6 + rng() * 70;
  }
  return rects;
}
// Distance from a point to a box (0 inside), written here rather than taken from the shipped code
function gap(x, y, b) { return Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3])); }
function overlaps(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
// Independent breadth-first distances, cell to cell, no wrapping from one row to the next
function distances(mz, from) {
  const d = new Array(mz.t.length).fill(-1), q = [from];
  d[from] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % mz.c, y = Math.floor(i / mz.c);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= mz.c || ny >= mz.r) continue;
      const n = ny * mz.c + nx;
      if (mz.t[n] && d[n] < 0) { d[n] = d[i] + 1; q.push(n); }
    }
  }
  return d;
}
// Desktop (16 px cells) and phone (12 px cells), as the page uses them
const SCREENS = [[1440, 2400, 48, 16], [1024, 2400, 41, 16], [375, 3000, 16, 12]];

// 1. The maze is the page: a cell is floor exactly when it stays PAD pixels clear of every block
for (const [w, h, gut, G] of SCREENS) {
  let exact = true, floors = 0, n = 0;
  for (let k = 0; k < 6; k++) {
    const rects = page(w, h, gut), mz = A.grid(w, h, G, rects);
    for (let i = 0; i < mz.t.length; i++) {
      const x = i % mz.c, y = Math.floor(i / mz.c), cell = [x * G - A.PAD, y * G - A.PAD, (x + 1) * G + A.PAD, (y + 1) * G + A.PAD];
      const clear = !rects.some((b) => overlaps(cell, b));
      if (clear !== !!mz.t[i]) exact = false;
      floors += mz.t[i]; n++;
    }
  }
  ok(`grid ${w} px: floor exactly where the cell stays ${A.PAD} px clear of content`, exact, Math.round(100 * floors / n) + '% floor');
}

// 2. What is drawn stays clear of content: the agent moves from cell centre to cell centre,
//    and its mark (ring, line width and the four images) fits in the half cell plus PAD
for (const [w, h, gut, G] of SCREENS) {
  const reach = G * A.SIZE * (1 + 4.2 * 1.15 / 20);
  let worst = Infinity, segs = 0;
  for (let k = 0; k < 3; k++) {
    const rects = page(w, h, gut), mz = A.grid(w, h, G, rects);
    for (let i = 0; i < mz.t.length; i++) {
      if (!mz.t[i]) continue;
      for (const d of [1, mz.c]) {
        const j = A.next(mz, i, d);
        if (j < 0) continue;
        segs++;
        const x0 = (i % mz.c + 0.5) * G, y0 = (Math.floor(i / mz.c) + 0.5) * G, x1 = (j % mz.c + 0.5) * G, y1 = (Math.floor(j / mz.c) + 0.5) * G;
        for (let s = 0; s <= 4; s++) {
          const x = x0 + (x1 - x0) * s / 4, y = y0 + (y1 - y0) * s / 4;
          for (const b of rects) { const g = gap(x, y, b); if (g < worst) worst = g; }
        }
      }
    }
  }
  ok(`agent ${G} px cells: never closer to content than its own drawn radius`, worst >= reach, 'closest ' + worst.toFixed(1) + ' px, radius ' + reach.toFixed(1) + ' px, ' + segs + ' moves');
}

// 3. Moves: one cell at a time, never through a wall, never off the grid or round to the next row
{
  let good = true;
  for (let k = 0; k < 10; k++) {
    const mz = A.grid(375, 1500, 12, page(375, 1500, 16));
    for (let i = 0; i < mz.t.length; i++) {
      const x = i % mz.c, y = Math.floor(i / mz.c);
      for (const [d, nx, ny] of [[-1, x - 1, y], [1, x + 1, y], [-mz.c, x, y - 1], [mz.c, x, y + 1]]) {
        const inside = nx >= 0 && ny >= 0 && nx < mz.c && ny < mz.r, want = inside && mz.t[ny * mz.c + nx] ? ny * mz.c + nx : -1;
        if (A.next(mz, i, d) !== want) good = false;
      }
    }
  }
  ok('next: one cell at a time, no walls, no wrapping, nothing off the grid', good);
}

// 4. Routes: walkable and as short as an independent search
{
  let valid = true, shortest = true, checked = 0;
  for (let k = 0; k < 20; k++) {
    const mz = A.grid(1440, 1800, 16, page(1440, 1800, 48)), floor = [];
    for (let i = 0; i < mz.t.length; i++) if (mz.t[i]) floor.push(i);
    for (let j = 0; j < 10; j++) {
      const a = floor[Math.floor(rng() * floor.length)], b = floor[Math.floor(rng() * floor.length)], d = distances(mz, a);
      if (a === b || d[b] < 0) continue;
      const p = A.route(mz, a, (i) => i === b);
      checked++;
      if (!p || p[p.length - 1] !== b) { valid = false; continue; }
      let prev = a;
      for (const i of p) {
        const same = Math.floor(i / mz.c) === Math.floor(prev / mz.c);
        if (!mz.t[i] || !((Math.abs(i - prev) === 1 && same) || Math.abs(i - prev) === mz.c)) valid = false;
        prev = i;
      }
      if (p.length !== d[b]) shortest = false;
    }
  }
  ok('route: walkable, one cell per step, ends on the goal', valid, checked + ' routes');
  ok('route: as short as an independent breadth-first search', shortest);
}

// 5. The agent left alone reads every document it can reach, never opens a restricted one,
//    always heads to the nearest, and finishes in a bounded number of steps
{
  let all = true, closed = true, nearest = true, bounded = true, read = 0, locked = 0, reachable = 0;
  for (let k = 0; k < 12; k++) {
    const mz = A.grid(1440, 1600, 16, page(1440, 1600, 48)), items = A.dots(mz);
    const start = A.nearest(mz, 1400, 400), reach = distances(mz, start);
    const before = items.reduce((s, v) => s + (v === 2), 0);
    const total = items.reduce((s, v, i) => s + (v === 1 && reach[i] >= 0), 0); // the start cell counts too
    const stats = { read: 0 };
    let p = start, steps = 0;
    for (;;) {
      A.arrive(items, p, stats);
      const plan = A.plan(mz, items, p);
      if (!plan) break;
      const d = distances(mz, p);
      let best = Infinity;
      for (let i = 0; i < items.length; i++) if (items[i] === 1 && d[i] > 0 && d[i] < best) best = d[i];
      if (plan.length !== best) nearest = false;
      for (const i of plan) { p = i; steps++; if (i !== plan[plan.length - 1]) A.arrive(items, i, stats); }
      if (steps > mz.t.length * 4) { bounded = false; break; }
    }
    if (stats.read !== total) all = false;
    reachable += total;
    if (items.reduce((s, v) => s + (v === 2), 0) !== before) closed = false;
    read += stats.read; locked += before;
  }
  ok('agent: reads every document it can reach', all, read + ' read of ' + reachable + ' reachable');
  ok('agent: never opens a restricted document', closed, locked + ' restricted, all still closed');
  ok('agent: always heads to the nearest readable document', nearest);
  ok('agent: finishes in a bounded number of steps', bounded);
}

// 6. Documents: on floor only, on a lattice fixed to the page, the same ones every time the page
//    is read again, and the share of restricted ones the code declares
{
  const rects = page(1440, 2400, 48), a = A.grid(1440, 2400, 16, rects), da = A.dots(a), db = A.dots(A.grid(1440, 2400, 16, rects));
  let onFloor = true, lattice = true;
  for (let i = 0; i < da.length; i++) {
    if (!da[i]) continue;
    if (!a.t[i]) onFloor = false;
    if ((i % a.c) % A.STEP || Math.floor(i / a.c) % A.STEP) lattice = false;
  }
  ok('dots: only on floor cells, one every ' + A.STEP + ' cells', onFloor && lattice);
  ok('dots: the same documents each time the page is read', da.every((v, i) => v === db[i]));
  let r = 0, n = 0;
  for (let y = 0; y < 3000; y += A.STEP) for (let x = 0; x < 120; x += A.STEP) { n++; if (A.hash(x, y) < A.RESTRICTED) r++; }
  ok('dots: about ' + Math.round(100 * A.RESTRICTED) + '% restricted', Math.abs(r / n - A.RESTRICTED) < 0.01, (100 * r / n).toFixed(1) + '%');
}

// 7. Landing back in view: the nearest cell that qualifies, as a brute-force search finds it
{
  let same = true;
  for (let k = 0; k < 30; k++) {
    const mz = A.grid(1024, 1600, 16, page(1024, 1600, 41)), x = rng() * 1024, y = rng() * 1600, y0 = Math.floor(rng() * 50), y1 = y0 + 40;
    const okf = (i) => i % 3 === 0;
    let best = Infinity;
    for (let i = 0; i < mz.t.length; i++) {
      const cy = Math.floor(i / mz.c);
      if (!mz.t[i] || !okf(i) || cy < y0 || cy > y1) continue;
      best = Math.min(best, Math.abs((i % mz.c + 0.5) * 16 - x) + Math.abs((cy + 0.5) * 16 - y));
    }
    const got = A.nearest(mz, x, y, okf, y0, y1);
    const d = got < 0 ? Infinity : Math.abs((got % mz.c + 0.5) * 16 - x) + Math.abs((Math.floor(got / mz.c) + 0.5) * 16 - y);
    if (d !== best) same = false;
  }
  ok('nearest: the closest qualifying cell in the rows asked for', same);
}

// 8. What the pages say matches what the agent does, in both languages
for (const [p, words] of [
  ['index.html', ['>Steer</button>', 'restricted<span class="roam__more">, never opened', 'never opens the restricted ones (squares)', 'aria-label="Hide the agent"']],
  ['fr/index.html', ['>Piloter</button>', 'protégés<span class="roam__more">, jamais ouverts', 'n’ouvre jamais les documents protégés (carrés)', 'aria-label="Masquer l’agent"']],
]) {
  const html = fs.readFileSync(path.join(root, p), 'utf8');
  ok(p + ': one drawing layer over the page, hidden from screen readers', /<canvas class="roam" id="roam" aria-hidden="true">/.test(html));
  ok(p + ': the counter waits for the script (hidden without JavaScript)', /<div class="roam__hud" id="roam-hud" hidden>/.test(html));
  ok(p + ': the old maze box is gone', !html.includes('id="agent"'));
  for (const w of words) ok(p + ': says ' + w, html.includes(w));
}
// The Steer button gets the same label back after steering
ok('script: Steer labels match the pages', js.includes("steer: 'Steer'") && js.includes("steer: 'Piloter'"));

console.log(fails ? '\n' + fails + ' failure(s)' : '\nOK: all checks passed');
process.exit(fails ? 1 : 0);
