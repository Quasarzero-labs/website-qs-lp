// Nav: show the rule once the page has scrolled
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Boundary diagram: swap the model, keep everything else
const slot = document.getElementById('slot');
const slotName = document.getElementById('slot-name');
const slotNote = document.getElementById('slot-note');
const chips = document.querySelectorAll('.chip');
chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    chips.forEach((c) => {
      const on = c === chip;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    slotName.textContent = chip.dataset.name;
    slotNote.textContent = chip.dataset.note;
    slot.classList.remove('is-swapping');
    void slot.offsetWidth; // restart the animation
    slot.classList.add('is-swapping');
  });
});

// Reveal on scroll
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }),
    { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
  );
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('is-in'));
}

// ---------- The mathematics, computed live ----------
// One forecast for an ageing asset, on synthetic data: reduce, forecast, check the coverage.
// tests/model.test.js runs the block between the <model> markers against exact results.
function buildModel() {
//<model>
// Forecasting an ageing asset with low / base / high cases.
// Reduce the futures to a few shapes (PCA), predict those shapes from the first
// months (Bayesian linear regression), simulate (Monte Carlo), then check coverage.
var M = {};
var P = { T: 48, hist: [6, 9, 12, 15, 18, 21, 24], nTrain: 200, D: 3, noise: 0.02 };
M.P = P;
// Central interval levels and their normal quantiles
M.LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
M.Z = [0.674490, 0.841621, 1.036433, 1.281552, 1.644854, 1.959964];
M.normal = function (rng) {
  var u = 1 - rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v);
};
// One synthetic asset, output normalised to its first month:
// hyperbolic decline q(t) = (1 + b d t)^(-1/b), observed with measurement noise
M.asset = function (rng) {
  var b = 0.2 + 0.8 * rng(), d = 0.04 * Math.exp(0.5 * M.normal(rng)), y = [], t;
  for (t = 0; t < P.T; t++) { y.push(Math.pow(1 + b * d * t, -1 / b) + P.noise * M.normal(rng)); }
  return y;
};
// Eigen-decomposition of a symmetric matrix (cyclic Jacobi), eigenvalues sorted descending
M.jacobi = function (A) {
  var n = A.length, a = [], V = [], i, j, k, sweep, off, p, q, th, t, c, s, x, y;
  for (i = 0; i < n; i++) { a.push(A[i].slice()); V.push([]); for (j = 0; j < n; j++) { V[i].push(i === j ? 1 : 0); } }
  for (sweep = 0; sweep < 60; sweep++) {
    off = 0;
    for (p = 0; p < n; p++) { for (q = p + 1; q < n; q++) { off += a[p][q] * a[p][q]; } }
    if (off < 1e-22) { break; }
    for (p = 0; p < n; p++) {
      for (q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) { continue; }
        th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        c = 1 / Math.sqrt(t * t + 1); s = t * c;
        for (k = 0; k < n; k++) { x = a[k][p]; y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
        for (k = 0; k < n; k++) { x = a[p][k]; y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
        for (k = 0; k < n; k++) { x = V[k][p]; y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
      }
    }
  }
  var order = [];
  for (i = 0; i < n; i++) { order.push(i); }
  order.sort(function (u, v) { return a[v][v] - a[u][u]; });
  var values = [], vectors = [];
  for (i = 0; i < n; i++) {
    values.push(a[order[i]][order[i]]);
    vectors.push([]);
    for (k = 0; k < n; k++) { vectors[i].push(V[k][order[i]]); }
  }
  return { values: values, vectors: vectors };
};
// Features of an asset seen for m months: (1, q_1 - mean_1, ..., q_m - mean_m)
M.features = function (model, y) {
  var f = [1], j;
  for (j = 0; j < model.m; j++) { f.push(y[j] - model.xbar[j]); }
  return f;
};
// Fit on assets (arrays of length T) using the first m months to predict the rest
M.fit = function (assets, m) {
  var N = assets.length, p = P.T - m, K = m + 1, D = P.D, i, j, k, d, t, v;
  var model = { m: m, p: p, N: N, xbar: [], ybar: [], U: [], resid: [], comps: [] };
  for (j = 0; j < m; j++) { v = 0; for (i = 0; i < N; i++) { v += assets[i][j]; } model.xbar.push(v / N); }
  for (t = 0; t < p; t++) { v = 0; for (i = 0; i < N; i++) { v += assets[i][m + t]; } model.ybar.push(v / N); }
  // PCA of the centred futures
  var C = [];
  for (j = 0; j < p; j++) { C.push([]); for (k = 0; k < p; k++) { C[j].push(0); } }
  for (i = 0; i < N; i++) {
    for (j = 0; j < p; j++) {
      v = assets[i][m + j] - model.ybar[j];
      for (k = j; k < p; k++) { C[j][k] += v * (assets[i][m + k] - model.ybar[k]); }
    }
  }
  for (j = 0; j < p; j++) { for (k = j; k < p; k++) { C[j][k] /= (N - 1); C[k][j] = C[j][k]; } }
  var eig = M.jacobi(C), total = 0, kept = 0;
  for (j = 0; j < p; j++) { total += eig.values[j]; if (j < D) { kept += eig.values[j]; } }
  model.lam = eig.values;
  model.explained = kept / total;
  for (d = 0; d < D; d++) { model.U.push(eig.vectors[d]); }
  // Scores, and the per-month variance the D shapes leave behind
  var S = [], r;
  for (t = 0; t < p; t++) { model.resid.push(0); }
  for (i = 0; i < N; i++) {
    S.push(M.scores(model, assets[i].slice(m)));
    for (t = 0; t < p; t++) {
      r = assets[i][m + t] - model.ybar[t];
      for (d = 0; d < D; d++) { r -= model.U[d][t] * S[i][d]; }
      model.resid[t] += r * r / (N - 1);
    }
  }
  // Bayesian linear regression of each score on the features, in the eigenbasis of Phi'Phi
  var Phi = [], G = [];
  for (i = 0; i < N; i++) { Phi.push(M.features(model, assets[i])); }
  for (j = 0; j < K; j++) { G.push([]); for (k = 0; k < K; k++) { G[j].push(0); } }
  for (i = 0; i < N; i++) { for (j = 0; j < K; j++) { for (k = j; k < K; k++) { G[j][k] += Phi[i][j] * Phi[i][k]; } } }
  for (j = 0; j < K; j++) { for (k = j; k < K; k++) { G[k][j] = G[j][k]; } }
  var ge = M.jacobi(G);
  model.glam = ge.values.map(function (x) { return Math.max(0, x); });
  model.V = ge.vectors;
  for (d = 0; d < D; d++) {
    var yy = 0, b = [], c = [], alpha = 1, beta, a, it, gamma, mm, res;
    for (j = 0; j < K; j++) { b.push(0); }
    for (i = 0; i < N; i++) { yy += S[i][d] * S[i][d]; for (j = 0; j < K; j++) { b[j] += Phi[i][j] * S[i][d]; } }
    for (k = 0; k < K; k++) { v = 0; for (j = 0; j < K; j++) { v += model.V[k][j] * b[j]; } c.push(v); }
    beta = N / Math.max(yy, 1e-12);
    // alpha (prior precision) and beta (noise precision) by maximising the evidence
    for (it = 0; it < 200; it++) {
      gamma = 0; mm = 0; res = yy; a = [];
      for (k = 0; k < K; k++) {
        a.push(beta * c[k] / (alpha + beta * model.glam[k]));
        gamma += beta * model.glam[k] / (alpha + beta * model.glam[k]);
        mm += a[k] * a[k];
        res += -2 * a[k] * c[k] + model.glam[k] * a[k] * a[k];
      }
      var na = Math.min(1e9, gamma / Math.max(mm, 1e-300)), nb = (N - gamma) / Math.max(res, 1e-300);
      var done = Math.abs(na - alpha) < 1e-10 * alpha && Math.abs(nb - beta) < 1e-10 * beta;
      alpha = na; beta = nb;
      if (done) { break; }
    }
    a = [];
    for (k = 0; k < K; k++) { a.push(beta * c[k] / (alpha + beta * model.glam[k])); }
    model.comps.push({ alpha: alpha, beta: beta, a: a, c: c, yy: yy });
  }
  return model;
};
// Coordinates of a future on the D shapes
M.scores = function (model, future) {
  var s = [], d, t, v;
  for (d = 0; d < P.D; d++) {
    v = 0;
    for (t = 0; t < model.p; t++) { v += model.U[d][t] * (future[t] - model.ybar[t]); }
    s.push(v);
  }
  return s;
};
// Future rebuilt from its first n shapes
M.rebuild = function (model, s, n) {
  var y = [], t, d, v;
  for (t = 0; t < model.p; t++) {
    v = model.ybar[t];
    for (d = 0; d < n; d++) { v += model.U[d][t] * s[d]; }
    y.push(v);
  }
  return y;
};
// Exact predictive law of the future given the history: Gaussian, month by month
M.predict = function (model, y) {
  var f = M.features(model, y), K = model.m + 1, z = [], k, j, d, t, v;
  for (k = 0; k < K; k++) { v = 0; for (j = 0; j < K; j++) { v += model.V[k][j] * f[j]; } z.push(v); }
  var out = { sMean: [], sVar: [], mean: [], sd: [] }, cmp;
  for (d = 0; d < P.D; d++) {
    cmp = model.comps[d];
    var mu = 0, va = 1 / cmp.beta;
    for (k = 0; k < K; k++) { mu += cmp.a[k] * z[k]; va += z[k] * z[k] / (cmp.alpha + cmp.beta * model.glam[k]); }
    out.sMean.push(mu); out.sVar.push(va);
  }
  for (t = 0; t < model.p; t++) {
    var mt = model.ybar[t], vt = model.resid[t];
    for (d = 0; d < P.D; d++) { mt += model.U[d][t] * out.sMean[d]; vt += model.U[d][t] * model.U[d][t] * out.sVar[d]; }
    out.mean.push(mt); out.sd.push(Math.sqrt(vt));
  }
  return out;
};
// One simulated future: draw the D scores, rebuild, add what the shapes leave behind
M.draw = function (model, pred, rng) {
  var s = [], d, t, y = [], v;
  for (d = 0; d < P.D; d++) { s.push(pred.sMean[d] + Math.sqrt(pred.sVar[d]) * M.normal(rng)); }
  for (t = 0; t < model.p; t++) {
    v = model.ybar[t] + Math.sqrt(model.resid[t]) * M.normal(rng);
    for (d = 0; d < P.D; d++) { v += model.U[d][t] * s[d]; }
    y.push(v);
  }
  return y;
};
// Empirical quantile of an ascending array
M.quantile = function (sorted, q) {
  var h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
};
// Adds one unseen asset to the coverage tally: tally.n months seen, tally.hit[l] inside level l
M.tally = function (model, y, tally) {
  var pred = M.predict(model, y), t, l, e;
  for (t = 0; t < model.p; t++) {
    e = Math.abs(y[model.m + t] - pred.mean[t]) / pred.sd[t];
    tally.n++;
    for (l = 0; l < M.Z.length; l++) { if (e <= M.Z[l]) { tally.hit[l]++; } }
  }
  return tally;
};
// The live coverage plot: one point per batch of unseen assets, on a vertical axis from floor to 100%
M.CHECK = { batch: 16, floor: 0.6 };
//</model>
return M;
}

var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
var SIGNAL = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#e8743b';
var cvs = {
  field: document.getElementById('field'),
  shapes: document.getElementById('plot-shapes'),
  forecast: document.getElementById('plot-forecast'),
  check: document.getElementById('plot-check')
};
// Nothing is computed or drawn while a canvas is off screen
var vis = {};
if ('IntersectionObserver' in window) {
  Object.keys(cvs).forEach(function (key) {
    if (!cvs[key]) { return; }
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { vis[key] = e.isIntersecting; });
    }, { rootMargin: '80px' }).observe(cvs[key]);
  });
}

// Hero: particles on a logarithmic spiral, falling towards the zero
(function () {
  var cv = cvs.field, ctx = cv && cv.getContext('2d');
  if (!ctx) { return; }
  var N = 900, P = [], i;
  function spawn(p, anywhere) {
  p.t = Math.random() * 6.2832;
  p.r = anywhere ? 0.04 + Math.random() * 0.96 : 0.85 + Math.random() * 0.15;
  p.w = 0.7 + Math.random() * 1.1;
  p.hot = Math.random() < 0.12;
  }
  for (i = 0; i < N; i++) { var p0 = {}; spawn(p0, true); P.push(p0); }
  var W = 0, H = 0, tilt = -0.42, ct = Math.cos(tilt), st = Math.sin(tilt);
  function frame() {
  if (!still && vis.field === false) { requestAnimationFrame(frame); return; }
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = cv.clientWidth, h = cv.clientHeight;
  if (w !== W || h !== H) {
  W = w; H = h;
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(11,11,13,0.16)';
  ctx.fillRect(0, 0, W, H);
  var cx = W * 0.74, cy = H * 0.3, R = Math.max(W, H) * 0.6;
  // On a phone the centre falls under the text: keep the drift, drop the ring
  var narrow = W < 700;
  for (var k = 0; k < N; k++) {
  var q = P[k];
  q.t += Math.min(0.2, 0.002 / Math.pow(q.r, 1.5));
  q.r *= 0.9985;
  if (q.r < 0.035) { spawn(q, false); }
  var x = Math.cos(q.t) * q.r * R, y = Math.sin(q.t) * q.r * R * 0.36;
  ctx.globalAlpha = (0.14 + 0.5 * (1 - q.r)) * (narrow ? 0.45 : 0.85);
  ctx.fillStyle = q.hot ? SIGNAL : '#ece8dc';
  ctx.fillRect(cx + x * ct - y * st, cy + x * st + y * ct, q.w, q.w);
  }
  ctx.globalAlpha = 1;
  if (narrow) { if (!still) { requestAnimationFrame(frame); } return; }
  var z = Math.max(9, R * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, z, 0, 6.2832);
  ctx.fillStyle = '#0b0b0d';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ece8dc';
  ctx.stroke();
  if (!still) { requestAnimationFrame(frame); }
  }
  frame();
})();

// Three plots, one shared state: the shapes, the forecast, the coverage check
(function () {
  if (!cvs.shapes || !cvs.forecast || !cvs.check) { return; }
  var M = buildModel(), P = M.P, rng = Math.random;
  var INK = '#ece8dc', DIM = 'rgba(236,232,220,0.36)', FAINT = 'rgba(236,232,220,0.09)', BG = '#15151b';
  var MONO = "12px 'JetBrains Mono', monospace", SMALL = "10px 'JetBrains Mono', monospace";
  var PAD = 14, FOOT = 22, TOP = 36, YMAX = 1.15, DRAWS = 2400, STEP = 1700, TICK = 150, WINDOW = 48;
  var sizes = {}, S = null;
  // Labels drawn inside the plots follow the page language
  var FR = document.documentElement.lang === 'fr', LOCALE = FR ? 'fr-FR' : 'en-US';
  function num(v) { return v.toLocaleString(LOCALE); }
  function pct(v, digits) {
    return (100 * v).toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (FR ? '\u00a0%' : '%');
  }
  var L = FR ? {
    month: 'mois ',
    shapes: function (d, e) { return d + ' formes portent ' + pct(e, 1) + ' de la variance'; },
    forecast: function (m, n) { return 'historique ' + m + ' mois · N = ' + num(n); },
    coverage: function (o) { return 'annoncé ' + pct(0.8, 0) + ' · observé ' + pct(o, 1); },
    seen: function (n) { return 'n = ' + num(n) + ' mois-actifs jamais vus'; },
    inBand: function (h, n) { return 'dans la bande\u00a0: ' + h + '/' + n + ' mois'; },
    announced: 'annoncé '
  } : {
    month: 'month ',
    shapes: function (d, e) { return d + ' shapes carry ' + pct(e, 1) + ' of the variance'; },
    forecast: function (m, n) { return 'history ' + m + ' mo · N = ' + num(n) + ' draws'; },
    coverage: function (o) { return 'announced ' + pct(0.8, 0) + ' · observed ' + pct(o, 1); },
    seen: function (n) { return 'n = ' + num(n) + ' unseen asset-months'; },
    inBand: function (h, n) { return 'in the band: ' + h + '/' + n + ' months'; },
    announced: 'announced '
  };

  function nextStep() {
    var t;
    S.k++;
    if (!S.y || S.k >= P.hist.length) { S.k = 0; S.y = M.asset(rng); }
    S.model = S.models[S.k];
    S.pred = M.predict(S.model, S.y);
    S.future = S.y.slice(S.model.m);
    S.score = M.scores(S.model, S.future);
    S.sims = [];
    for (t = 0; t < S.model.p; t++) { S.sims.push([]); }
    S.n = 0; S.q = null; S.since = 0;
    // The forecast now on screen is checked too: its real months fall inside the band or not
    var t1 = { n: 0, hit: M.Z.map(function () { return 0; }) };
    M.tally(S.model, S.y, t1);
    S.shown = { hit: t1.hit[3], n: t1.n };
    add(t1);
    S.marks.push({ at: now(), v: t1.hit[3] / t1.n });
  }
  function setup() {
    var i, train = [];
    for (i = 0; i < P.nTrain; i++) { train.push(M.asset(rng)); }
    S = { train: train, models: P.hist.map(function (m) { return M.fit(train, m); }), k: -1, y: null };
    S.tally = { n: 0, hit: M.Z.map(function () { return 0; }) };
    S.batches = []; S.marks = []; S.count = 0; S.acc = 0;
    nextStep();
  }
  // Monte Carlo: add n simulated futures, then read low / base / high month by month
  function simulate(n) {
    var i, t, y, a, q = { lo: [], mid: [], hi: [] };
    for (i = 0; i < n; i++) {
      y = M.draw(S.model, S.pred, rng);
      for (t = 0; t < S.model.p; t++) { S.sims[t].push(y[t]); }
    }
    S.n += n;
    for (t = 0; t < S.model.p; t++) {
      a = Float64Array.from(S.sims[t]).sort();
      q.lo.push(M.quantile(a, 0.1)); q.mid.push(M.quantile(a, 0.5)); q.hi.push(M.quantile(a, 0.9));
    }
    S.q = q;
  }
  // Coverage, on a clock: every TICK, one batch of assets the model never saw, at a random history length.
  // Each batch gives a point that wanders; everything counted so far gives a line that settles.
  function add(t) {
    S.tally.n += t.n;
    for (var l = 0; l < t.hit.length; l++) { S.tally.hit[l] += t.hit[l]; }
  }
  function now() { return S.count - 1 + S.acc / TICK; }
  function batch() {
    var t = { n: 0, hit: M.Z.map(function () { return 0; }) };
    for (var i = 0; i < M.CHECK.batch; i++) { M.tally(S.models[Math.floor(rng() * S.models.length)], M.asset(rng), t); }
    add(t);
    S.batches.push({ v: t.hit[3] / t.n, cum: S.tally.hit[3] / S.tally.n });
    S.count++;
    if (S.batches.length > WINDOW + 2) { S.batches.shift(); }
    while (S.marks.length && S.marks[0].at < S.count - WINDOW - 2) { S.marks.shift(); }
  }

  function prep(k) {
    var c = cvs[k];
    if (!c || vis[k] === false) { return null; }
    var ctx = c.getContext('2d'), w = c.clientWidth, h = c.clientHeight;
    if (!ctx || !w || !h) { return null; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2), z = sizes[k];
    if (!z || z.w !== w || z.h !== h) {
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      sizes[k] = { w: w, h: h };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    return { ctx: ctx, W: w, H: h, y0: h - FOOT };
  }
  // Month 1..T on x, normalised output on y
  function xOf(g, month) { return PAD + (month - 1) / (P.T - 1) * (g.W - 2 * PAD); }
  function yOf(g, v) { return g.y0 - Math.max(0, Math.min(1, v / YMAX)) * (g.y0 - TOP); }
  function baseline(g, left, right) {
    var ctx = g.ctx;
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, g.y0 + 0.5); ctx.lineTo(g.W - PAD, g.y0 + 0.5); ctx.stroke();
    ctx.font = SMALL; ctx.fillStyle = DIM;
    ctx.textAlign = 'left'; ctx.fillText(left, PAD, g.H - 7);
    ctx.textAlign = 'right'; ctx.fillText(right, g.W - PAD, g.H - 7);
  }
  function head(g, text, second) {
    g.ctx.font = MONO; g.ctx.textAlign = 'left'; g.ctx.fillStyle = INK;
    g.ctx.fillText(text, PAD, second ? 38 : 21);
  }
  // values[i] is plotted at month first + i
  function path(g, values, first) {
    g.ctx.beginPath();
    for (var i = 0; i < values.length; i++) {
      if (i === 0) { g.ctx.moveTo(xOf(g, first + i), yOf(g, values[i])); } else { g.ctx.lineTo(xOf(g, first + i), yOf(g, values[i])); }
    }
  }
  function dots(g, values, first) {
    g.ctx.fillStyle = INK; g.ctx.globalAlpha = 0.6;
    for (var i = 0; i < values.length; i++) {
      g.ctx.beginPath(); g.ctx.arc(xOf(g, first + i), yOf(g, values[i]), 1.4, 0, 6.2832); g.ctx.fill();
    }
    g.ctx.globalAlpha = 1;
  }
  function boundary(g, m) {
    var x = Math.round((xOf(g, m) + xOf(g, m + 1)) / 2) + 0.5;
    g.ctx.strokeStyle = DIM; g.ctx.lineWidth = 1; g.ctx.setLineDash([2, 4]);
    g.ctx.beginPath(); g.ctx.moveTo(x, TOP - 6); g.ctx.lineTo(x, g.y0); g.ctx.stroke();
    g.ctx.setLineDash([]);
  }

  // 1. The futures of 200 assets, and one unseen future rebuilt from 1, 2, then 3 shapes
  function drawShapes() {
    var g = prep('shapes');
    if (!g) { return; }
    var ctx = g.ctx, m = S.model.m, i, n;
    ctx.strokeStyle = FAINT; ctx.lineWidth = 1;
    for (i = 0; i < 60; i++) { path(g, S.train[i], 1); ctx.stroke(); }
    boundary(g, m);
    dots(g, S.future, m + 1);
    ctx.strokeStyle = SIGNAL; ctx.lineWidth = 1.5;
    for (n = 1; n <= P.D; n++) {
      ctx.globalAlpha = n === P.D ? 1 : 0.22 * n;
      path(g, M.rebuild(S.model, S.score, n), m + 1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    baseline(g, L.month + 1, L.month + P.T);
    head(g, L.shapes(P.D, S.model.explained));
  }
  // 2. History, simulated band and base case, exact band, and what actually happened
  function drawForecast() {
    var g = prep('forecast');
    if (!g) { return; }
    var ctx = g.ctx, m = S.model.m, p = S.model.p, t, lo = [], hi = [];
    if (S.q) {
      ctx.beginPath();
      for (t = 0; t < p; t++) { ctx.lineTo(xOf(g, m + 1 + t), yOf(g, S.q.hi[t])); }
      for (t = p - 1; t >= 0; t--) { ctx.lineTo(xOf(g, m + 1 + t), yOf(g, S.q.lo[t])); }
      ctx.closePath();
      ctx.globalAlpha = 0.26; ctx.fillStyle = SIGNAL; ctx.fill(); ctx.globalAlpha = 1;
    }
    for (t = 0; t < p; t++) {
      lo.push(S.pred.mean[t] - M.Z[3] * S.pred.sd[t]);
      hi.push(S.pred.mean[t] + M.Z[3] * S.pred.sd[t]);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    path(g, lo, m + 1); ctx.stroke();
    path(g, hi, m + 1); ctx.stroke();
    ctx.globalAlpha = 1;
    dots(g, S.future, m + 1);
    if (S.q) { ctx.strokeStyle = SIGNAL; ctx.lineWidth = 1.6; path(g, S.q.mid, m + 1); ctx.stroke(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    path(g, S.y.slice(0, m), 1); ctx.stroke();
    boundary(g, m);
    baseline(g, L.month + 1, L.month + P.T);
    head(g, L.forecast(m, S.n));
  }
  // 3. Coverage of the 80% band over time: batches wander, the running total settles, rings are the forecasts shown
  function drawCheck() {
    var g = prep('check');
    if (!g) { return; }
    var ctx = g.ctx, top = 62, A = M.CHECK.floor, tn = now(), dx = (g.W - 2 * PAD) / (WINDOW - 1), i, j, b, x;
    function px(t) { return g.W - PAD - (tn - t) * dx; }
    function py(v) { return g.y0 - Math.max(0, Math.min(1, (v - A) / (1 - A))) * (g.y0 - top); }
    ctx.strokeStyle = DIM; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(PAD, py(0.8) + 0.5); ctx.lineTo(g.W - PAD, py(0.8) + 0.5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.beginPath(); ctx.rect(PAD, top - 8, g.W - 2 * PAD, g.y0 - top + 8); ctx.clip();
    j = S.count - S.batches.length;
    // Each batch of unseen assets
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1; ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (i = 0; i < S.batches.length; i++) { if (i === 0) { ctx.moveTo(px(j + i), py(S.batches[i].v)); } else { ctx.lineTo(px(j + i), py(S.batches[i].v)); } }
    ctx.stroke();
    for (i = 0; i < S.batches.length; i++) { ctx.beginPath(); ctx.arc(px(j + i), py(S.batches[i].v), 1.6, 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha = 1;
    // Everything counted so far
    ctx.strokeStyle = SIGNAL; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (i = 0; i < S.batches.length; i++) { if (i === 0) { ctx.moveTo(px(j + i), py(S.batches[i].cum)); } else { ctx.lineTo(px(j + i), py(S.batches[i].cum)); } }
    ctx.stroke();
    // The forecasts shown in the middle plot, newest brightest
    ctx.lineWidth = 1.5;
    for (i = 0; i < S.marks.length; i++) {
      b = S.marks[i]; x = px(b.at);
      ctx.globalAlpha = i === S.marks.length - 1 ? 1 : 0.5;
      ctx.strokeStyle = SIGNAL; ctx.beginPath();
      if (b.v < A) {
        // Below the axis: a triangle pointing down at the floor, not a ring at a false value
        ctx.moveTo(x - 4.5, py(A) - 7); ctx.lineTo(x + 4.5, py(A) - 7); ctx.lineTo(x, py(A)); ctx.closePath();
      } else { ctx.arc(x, py(b.v), 4.5, 0, 6.2832); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // Label of the announced level, on a patch so the lines pass behind it
    ctx.font = SMALL; ctx.textAlign = 'left';
    ctx.fillStyle = BG; ctx.fillRect(PAD, py(0.8) - 15, ctx.measureText(pct(0.8, 0)).width + 6, 11);
    ctx.fillStyle = DIM; ctx.fillText(pct(0.8, 0), PAD + 1, py(0.8) - 6);
    if (S.tally.n) {
      head(g, L.coverage(S.tally.hit[3] / S.tally.n));
      head(g, L.inBand(S.shown.hit, S.shown.n), true);
    }
    baseline(g, L.seen(S.tally.n), '');
  }
  function anyVisible() {
    return vis.shapes !== false || vis.forecast !== false || vis.check !== false;
  }
  // Paced by the clock, not by frames, so a slow device shows the same story
  var last = 0;
  function frame(now) {
    var dt = Math.min(250, Math.max(0, (now || 0) - last)) || 16;
    last = now || 0;
    if (still || anyVisible()) {
      if (!S) { setup(); }
      if (still) {
        if (!S.n) {
          for (var i = 0; i < WINDOW; i++) { batch(); if (i % Math.round(STEP / TICK) === 5) { nextStep(); } }
          simulate(DRAWS);
        }
      } else {
        if (S.n < DRAWS) { simulate(Math.max(1, Math.round(dt * 2))); }
        S.acc += dt;
        while (S.acc >= TICK) { S.acc -= TICK; batch(); }
        S.since += dt;
        if (S.since >= STEP) { nextStep(); }
      }
      drawShapes(); drawForecast(); drawCheck();
    }
    if (!still) { requestAnimationFrame(frame); }
  }
  frame();
})();
