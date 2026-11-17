// Runs the model exactly as shipped in script.js (between //<model> and //</model>)
// and compares it with exact results. Run: node tests/model.test.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const m = js.match(/\/\/<model>([\s\S]*?)\/\/<\/model>/);
if (!m) { console.error('FAIL: //<model> block not found'); process.exit(1); }
const M = new Function(m[1] + '\nreturn M;')();
const P = M.P;

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
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
// Independent linear solver (Gaussian elimination with row exchange), not the shipped code
function solve(A, b) {
  const n = b.length, a = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < n; r++) { const f = a[r][c] / a[c][c]; for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = a[r][n]; for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k]; x[r] = s / a[r][r]; }
  return x;
}

const rng = mulberry32(20261116);

// 1. Symmetric eigen-decomposition
{
  const n = 12, A = [];
  for (let i = 0; i < n; i++) { A.push(new Array(n).fill(0)); }
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { A[i][j] = A[j][i] = rng() - 0.5; }
  const e = M.jacobi(A);
  let res = 0, orth = 0, tr = 0;
  for (let k = 0; k < n; k++) {
    tr += A[k][k];
    for (let i = 0; i < n; i++) res = Math.max(res, Math.abs(dot(A[i], e.vectors[k]) - e.values[k] * e.vectors[k][i]));
    for (let l = 0; l < n; l++) orth = Math.max(orth, Math.abs(dot(e.vectors[k], e.vectors[l]) - (k === l ? 1 : 0)));
  }
  ok('jacobi: A v = λ v', res < 1e-10, res.toExponential(1));
  ok('jacobi: orthonormal vectors', orth < 1e-10, orth.toExponential(1));
  ok('jacobi: trace = Σλ', Math.abs(tr - e.values.reduce((s, x) => s + x, 0)) < 1e-10);
  ok('jacobi: sorted descending', e.values.every((v, i) => i === 0 || v <= e.values[i - 1]));
}

// 2. Fit on 200 synthetic assets, at every history length
const train = []; for (let i = 0; i < P.nTrain; i++) train.push(M.asset(rng));
const models = P.hist.map((h) => M.fit(train, h));
const mod = models[2], K = mod.m + 1;
ok('assets start near 1 and decline', train.every((y) => Math.abs(y[0] - 1) < 0.15) && train.filter((y) => y[P.T - 1] < y[0]).length > 195);

// 3. PCA identities
{
  const total = mod.lam.reduce((s, x) => s + x, 0), kept = mod.lam.slice(0, P.D).reduce((s, x) => s + x, 0);
  ok('pca: explained = kept / total', Math.abs(mod.explained - kept / total) < 1e-12, (100 * mod.explained).toFixed(1) + '%');
  ok('pca: three shapes carry most of the variance', mod.explained > 0.9);
  ok('pca: variance left behind = Σ discarded λ', rel(mod.resid.reduce((s, x) => s + x, 0), total - kept) < 1e-8);
  const y = train[7].slice(mod.m), s = M.scores(mod, y);
  const err = (n) => M.rebuild(mod, s, n).reduce((a, v, t) => a + (v - y[t]) ** 2, 0);
  ok('pca: each added shape reduces the error', err(1) >= err(2) && err(2) >= err(3) && err(0) >= err(1));
}

// 4. Bayesian regression against an independent solve of (αI + βΦᵀΦ) w = βΦᵀs
{
  const Phi = train.map((y) => M.features(mod, y));
  const G = []; for (let j = 0; j < K; j++) { G.push([]); for (let k = 0; k < K; k++) G[j].push(Phi.reduce((s, f) => s + f[j] * f[k], 0)); }
  const x = train[3], f = M.features(mod, x), pred = M.predict(mod, x);
  let worstMean = 0, worstVar = 0, worstOpt = Infinity;
  for (let d = 0; d < P.D; d++) {
    const c = mod.comps[d], s = train.map((y) => M.scores(mod, y.slice(mod.m))[d]);
    const A = G.map((r, j) => r.map((v, k) => c.beta * v + (j === k ? c.alpha : 0)));
    const w = solve(A, Phi[0].map((_, j) => c.beta * Phi.reduce((a, ff, i) => a + ff[j] * s[i], 0)));
    worstMean = Math.max(worstMean, Math.abs(dot(w, f) - pred.sMean[d]));
    worstVar = Math.max(worstVar, rel(pred.sVar[d], 1 / c.beta + dot(f, solve(A, f))));
    // α, β maximise the evidence: any 10% move away must not increase it.
    // A shape the history cannot predict sends α to its ceiling (the optimum is at infinity):
    // there, only a move back down is tested.
    const ev = (al, be) => {
      const a = c.c.map((ck, k) => be * ck / (al + be * mod.glam[k]));
      const mm = a.reduce((t, v) => t + v * v, 0);
      const res = c.yy + a.reduce((t, v, k) => t - 2 * v * c.c[k] + mod.glam[k] * v * v, 0);
      const logdet = mod.glam.reduce((t, l) => t + Math.log(al + be * l), 0);
      return 0.5 * K * Math.log(al) + 0.5 * mod.N * Math.log(be) - 0.5 * be * res - 0.5 * al * mm - 0.5 * logdet;
    };
    const best = ev(c.alpha, c.beta);
    const moves = c.alpha >= 1e9 ? [[1 / 1.1, 1], [1, 1.1], [1, 1 / 1.1]] : [[1.1, 1], [1 / 1.1, 1], [1, 1.1], [1, 1 / 1.1]];
    for (const [fa, fb] of moves) worstOpt = Math.min(worstOpt, best - ev(c.alpha * fa, c.beta * fb));
  }
  ok('regression: posterior mean = independent solve', worstMean < 1e-8, worstMean.toExponential(1));
  ok('regression: predictive variance = 1/β + φᵀSφ', worstVar < 1e-8, worstVar.toExponential(1));
  ok('α, β maximise the evidence', worstOpt > -1e-9, worstOpt.toExponential(1));
}

// 5. Monte Carlo against the exact Gaussian band
{
  const y = M.asset(rng), pred = M.predict(mod, y), N = 40000, sims = [];
  for (let t = 0; t < mod.p; t++) sims.push(new Float64Array(N));
  for (let i = 0; i < N; i++) { const d = M.draw(mod, pred, rng); for (let t = 0; t < mod.p; t++) sims[t][i] = d[t]; }
  let worst = 0;
  for (let t = 0; t < mod.p; t++) {
    sims[t].sort();
    for (const [q, z] of [[0.1, -1.281552], [0.5, 0], [0.9, 1.281552]]) worst = Math.max(worst, Math.abs(M.quantile(sims[t], q) - (pred.mean[t] + z * pred.sd[t])) / pred.sd[t]);
  }
  ok('monte carlo: low / base / high match the exact band', worst < 0.05, 'worst gap ' + worst.toFixed(3) + ' sd');
  const spread = (n) => { const v = []; for (let r = 0; r < 300; r++) { let s = 0; for (let i = 0; i < n; i++) s += M.draw(mod, pred, rng)[mod.p - 1]; v.push(s / n); } const mu = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1)); };
  const ratio = spread(100) / spread(400);
  ok('monte carlo: error ∝ 1/√N', ratio > 1.7 && ratio < 2.35, 'ratio ' + ratio.toFixed(2));
}

// 6. Calibration on assets the model never saw: the announced coverage is close to the observed one.
// The model is Gaussian and the data are not exactly so, and each training draw moves the result by
// two or three points: the tolerances below say "roughly calibrated", which is what the page states.
{
  const test = []; for (let i = 0; i < 4000; i++) test.push(M.asset(rng));
  const pooled = { n: 0, hit: M.Z.map(() => 0) };
  let worstModel = 0;
  for (const mm of models) {
    const t = { n: 0, hit: M.Z.map(() => 0) };
    for (const y of test) M.tally(mm, y, t);
    worstModel = Math.max(worstModel, Math.abs(t.hit[3] / t.n - 0.8));
    pooled.n += t.n; pooled.hit.forEach((_, l) => { pooled.hit[l] += t.hit[l]; });
  }
  const obs = pooled.hit.map((h) => h / pooled.n);
  ok('calibration: 80% band covers 80% (±3 pts), all history lengths pooled', Math.abs(obs[3] - 0.8) < 0.03, (100 * obs[3]).toFixed(1) + '% on ' + pooled.n + ' asset-months');
  ok('calibration: every level within 5 pts', obs.every((o, l) => Math.abs(o - M.LEVELS[l]) < 0.05), obs.map((o) => (100 * o).toFixed(1)).join(' '));
  ok('calibration: no history length off by more than 5 pts', worstModel < 0.05, (100 * worstModel).toFixed(1) + ' pts');
  ok('normal quantiles match the levels', M.LEVELS.length === M.Z.length && Math.abs(M.Z[3] - 1.281552) < 1e-6 && Math.abs(M.Z[5] - 1.959964) < 1e-6);
  // More history, narrower band at the last month (averaged over unseen assets)
  const width = models.map((mm) => test.slice(0, 500).reduce((s, y) => s + M.predict(mm, y).sd[mm.p - 1], 0) / 500);
  ok('band narrows as history grows', width.every((w, i) => i === 0 || w < width[i - 1]), width.map((w) => w.toFixed(3)).join(' > '));
}

// 7. Text: what the page states is what the code does
for (const bad of ['∀ m ∈ Models', 'subject to g(x)', 'estimating π', 'shelf', 'Poisson', 'q* = min']) ok('absent: ' + bad, !html.includes(bad) && !js.includes(bad));
for (const good of ['y ≈ ȳ + s₁u₁ + s₂u₂ + s₃u₃', 'N(mᵀφ, 1/β + φᵀSφ)', 'argmax p(s | α, β)', 'Synthetic assets']) ok('present: ' + good, html.includes(good));
ok('page states 200 training assets, code uses 200', html.includes('200 to learn from') && P.nTrain === 200);
ok('page states three shapes, code uses three', P.D === 3);

// 8. The hero formula describes the animation that runs behind it
ok('hero formula present', html.includes('ω ∝ r^(−3/2) ;  r(t) = r(0) · e^(−λt)'));
ok('hero: angular speed ∝ r^(−3/2)', /q\.t \+= Math\.min\([\d.]+, [\d.]+ \/ Math\.pow\(q\.r, 1\.5\)\)/.test(js));
ok('hero: radius decays exponentially', /q\.r \*= 0\.\d+;/.test(js));

console.log(fails ? '\n' + fails + ' failure(s)' : '\nOK: all checks passed');
process.exit(fails ? 1 : 0);
