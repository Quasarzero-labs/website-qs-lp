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

// The agent that roams the page. The page is its maze: every block of content is a wall,
// the margins and the gaps between blocks are its corridors. Some documents are restricted:
// the agent walks past them and never opens them.
function buildAgent() {
//<agent>
var A = { PAD: 4, STEP: 3, SIZE: 0.42, RESTRICTED: 0.06 };
// A grid of square cells of g pixels laid over the page. A cell is floor (1) only if it stays
// PAD pixels clear of every block of content [x0, y0, x1, y1]. Outside the grid is wall.
A.grid = function (w, h, g, rects) {
  var c = Math.max(3, Math.floor(w / g)), r = Math.max(3, Math.ceil(h / g));
  var t = new Uint8Array(c * r).fill(1), k, b, x, y, x0, x1, y0, y1;
  for (k = 0; k < rects.length; k++) {
    b = rects[k];
    x0 = Math.max(0, Math.floor((b[0] - A.PAD) / g)); x1 = Math.min(c - 1, Math.ceil((b[2] + A.PAD) / g) - 1);
    y0 = Math.max(0, Math.floor((b[1] - A.PAD) / g)); y1 = Math.min(r - 1, Math.ceil((b[3] + A.PAD) / g) - 1);
    for (y = y0; y <= y1; y++) { for (x = x0; x <= x1; x++) { t[y * c + x] = 0; } }
  }
  return { c: c, r: r, g: g, t: t };
};
// A hash of the cell in [0, 1): the same cell always holds the same kind of document
A.hash = function (x, y) {
  var n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
// Documents on a lattice fixed to the page, one every STEP cells: 1 readable, 2 restricted
A.dots = function (m) {
  var it = new Uint8Array(m.t.length), x, y, i;
  for (y = 0; y < m.r; y += A.STEP) {
    for (x = 0; x < m.c; x += A.STEP) {
      i = y * m.c + x;
      if (m.t[i]) { it[i] = A.hash(x, y) < A.RESTRICTED ? 2 : 1; }
    }
  }
  return it;
};
// The neighbour of cell i one step away (d is -1, 1, -c or c), or -1 if it is a wall or off the grid
A.next = function (m, i, d) {
  var x = i % m.c;
  if ((d === -1 && x === 0) || (d === 1 && x === m.c - 1)) { return -1; }
  return m.t[i + d] ? i + d : -1;
};
// Breadth-first search: the shortest route (tiles after `from`, up to the goal), or null
A.route = function (m, from, goal) {
  var prev = new Int32Array(m.t.length).fill(-1), q = [from], h = 0, i, k, n, path;
  prev[from] = from;
  while (h < q.length) {
    i = q[h++];
    if (i !== from && goal(i)) {
      path = [];
      while (i !== from) { path.push(i); i = prev[i]; }
      return path.reverse();
    }
    var nb = [-1, 1, -m.c, m.c];
    for (k = 0; k < 4; k++) { n = A.next(m, i, nb[k]); if (n >= 0 && prev[n] < 0) { prev[n] = i; q.push(n); } }
  }
  return null;
};
// The agent's plan: the nearest document it may read, among those that pass `ok` if given
A.plan = function (m, items, from, ok) {
  return A.route(m, from, function (i) { return items[i] === 1 && (!ok || ok(i)); });
};
// Arriving on a tile: a readable document is read, a restricted one is left closed
A.arrive = function (items, i, stats) {
  if (items[i] === 1) { items[i] = 0; stats.read++; }
  return stats;
};
// The floor cell nearest to a point in pixels, among rows y0..y1 and cells that pass `ok`; -1 if none.
// It is where the agent lands when it comes back into view.
A.nearest = function (m, px, py, ok, y0, y1) {
  var best = -1, bd = Infinity, x, y, i, d;
  y0 = Math.max(0, y0 || 0); y1 = Math.min(m.r - 1, y1 === undefined ? m.r - 1 : y1);
  for (y = y0; y <= y1; y++) {
    for (x = 0; x < m.c; x++) {
      i = y * m.c + x;
      if (!m.t[i] || (ok && !ok(i))) { continue; }
      d = Math.abs((x + 0.5) * m.g - px) + Math.abs((y + 0.5) * m.g - py);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
};
//</agent>
return A;
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

// The agent at work across the whole page. It keeps to the margins and the gaps between blocks,
// reads the documents it may read in the part you are reading, walks past the restricted ones,
// and comes back into view when you scroll. The Steer button hands it to the keyboard.
(function () {
  var cv = document.getElementById('roam'), hud = document.getElementById('roam-hud');
  var ctx = cv && cv.getContext && cv.getContext('2d');
  if (!ctx || !hud || still) { return; }
  var A = buildAgent();
  var INK = '#ece8dc', DOT = 'rgba(236,232,220,0.3)', SQ = 'rgba(236,232,220,0.42)';
  // Tiles per second; ms: keyboard idle, out of view, nothing left in view, hop, retry
  var SPEED = 7, IDLE = 6000, LOST = 700, REFILL = 4000, HOP = 420, RETRY = 300;
  var FR = document.documentElement.lang === 'fr', LOCALE = FR ? 'fr-FR' : 'en-US';
  var L = FR ? { steer: 'Piloter', steering: 'Échap pour rendre la main' } : { steer: 'Steer', steering: 'Esc to hand back' };
  function $(id) { return document.getElementById(id); }
  var ui = { read: $('roam-read'), locked: $('roam-locked'), steer: $('roam-steer'), close: $('roam-close'), open: $('roam-open') };
  var nav = $('nav');
  // Lens mark proportions (ring r = 20 in a 64 box): the four gaps, and the four images
  var GAPS = [19.9, 9.08, 21.64, 10.47, 22.34, 7.68, 21.64, 11.87, 1.05, 0];
  var IMG = [[-20, 4.2], [70, 3.2], [160, 3.8], [250, 2.6]];
  // What the agent keeps clear of: text, images, controls, and boxes with a fill or a rule.
  // Rules that span the whole width, between sections, are doors rather than walls.
  var SKIP = '#roam, #roam-hud, .nav, .hero__field, .skip, script, style, noscript';
  var SOLID = /^(IMG|SVG|CANVAS|VIDEO|IFRAME|INPUT|BUTTON|SELECT|TEXTAREA|HR)$/;
  var G = 16, navH = 64, dirty = true, built = -1e9, last = 0, running = false;
  var S = { m: null, items: null, seen: null, p: -1, q: -1, f: 0, dir: 0, want: 0, rot: 0, plan: null, hop: null,
            manual: false, lastKey: 0, stats: { read: 0 }, locked: 0, lostAt: 0, emptyAt: 0, waitUntil: 0, off: false };
  var shown = { read: -1, locked: -1 };

  function num(v) { return v.toLocaleString(LOCALE); }
  function px(i) { return (i % S.m.c + 0.5) * G; }
  function py(i) { return (Math.floor(i / S.m.c) + 0.5) * G; }
  function at() { return [px(S.p) + (px(S.q) - px(S.p)) * S.f, py(S.p) + (py(S.q) - py(S.p)) * S.f]; }

  // ---- the page, read as a maze ----
  function painted(c) {
    var m = /rgba?\(([^)]*)\)/.exec(c || ''), p;
    if (!m) { return !!c && c !== 'transparent'; }
    p = m[1].split(/[\s,\/]+/).filter(Boolean);
    return p.length < 4 || parseFloat(p[3]) > 0;
  }
  function rule(w, s, c) { return parseFloat(w) > 0 && s !== 'none' && s !== 'hidden' && painted(c); }
  function own(e) {
    for (var n = e.firstChild; n; n = n.nextSibling) { if (n.nodeType === 3 && /\S/.test(n.nodeValue)) { return true; } }
    return false;
  }
  // Blocks still sliding in (reveal on scroll) are placed where they will come to rest
  function lift(e, cache) {
    var rv = e.closest('.reveal'), m, v;
    if (!rv) { return 0; }
    if (cache.has(rv)) { return cache.get(rv); }
    m = /matrix\(([^)]*)\)/.exec(getComputedStyle(rv).transform || '');
    v = m ? parseFloat(m[1].split(',')[5]) || 0 : 0;
    cache.set(rv, v);
    return v;
  }
  function collect() {
    var out = [], all = document.body.getElementsByTagName('*'), sx = window.scrollX, sy = window.scrollY;
    var vw = document.documentElement.clientWidth, cache = new Map(), i, e, r, cs, d, x0, y0, x1, y1, wide;
    for (i = 0; i < all.length; i++) {
      e = all[i];
      if (e.closest(SKIP)) { continue; }
      r = e.getBoundingClientRect();
      if (r.width < 0.5 && r.height < 0.5) { continue; }
      cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.position === 'fixed') { continue; }
      d = lift(e, cache);
      x0 = r.left + sx; x1 = r.right + sx; y0 = r.top + sy - d; y1 = r.bottom + sy - d;
      wide = r.width >= vw * 0.98;
      if (SOLID.test(e.tagName.toUpperCase()) || own(e) || (!wide && painted(cs.backgroundColor))) { out.push([x0, y0, x1, y1]); continue; }
      if (wide) { continue; }
      if (rule(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor)) { out.push([x0, y0, x1, y0 + 1]); }
      if (rule(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor)) { out.push([x0, y1 - 1, x1, y1]); }
      if (rule(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor)) { out.push([x0, y0, x0 + 1, y1]); }
      if (rule(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor)) { out.push([x1 - 1, y0, x1, y1]); }
    }
    return out;
  }
  function build(now) {
    var w = document.documentElement.clientWidth, h = document.documentElement.scrollHeight, old = S.m, a, m, items, seen, i, locked = 0;
    if (old && S.p >= 0) { a = at(); }
    G = w < 600 ? 12 : 16;
    navH = nav ? nav.getBoundingClientRect().height : 0;
    m = A.grid(w, h, G, collect()); items = A.dots(m); seen = new Uint8Array(m.t.length);
    // What was read stays read: the lattice is fixed to the page, cells keep their index at the same width
    if (old && old.c === m.c && S.seen) { seen.set(S.seen.subarray(0, Math.min(S.seen.length, seen.length))); }
    for (i = 0; i < items.length; i++) {
      if (items[i] === 1 && seen[i]) { items[i] = 0; } else if (items[i] === 2) { locked++; }
    }
    S.m = m; S.items = items; S.seen = seen; S.locked = locked; S.plan = null; S.hop = null; S.f = 0;
    if (!a) { a = [w - 3 * G, window.scrollY + window.innerHeight * 0.45]; }
    S.p = S.q = A.nearest(m, a[0], a[1]);
    dirty = false; built = now;
  }

  // ---- what the agent does ----
  // Rows fully on screen, below the nav
  function band() { return [Math.ceil((window.scrollY + navH) / G), Math.floor((window.scrollY + window.innerHeight) / G) - 1]; }
  function inBand(i, b) { var y = Math.floor(i / S.m.c); return y >= b[0] && y <= b[1]; }
  function hop(to, now) { S.hop = { from: S.p, to: to, t0: now }; S.q = S.p; S.f = 0; S.plan = null; }
  // Called each time the agent reaches the centre of a tile
  function decide(now) {
    var b = band(), before = S.stats.read, far;
    A.arrive(S.items, S.p, S.stats);
    if (S.stats.read > before) { S.seen[S.p] = 1; }
    if (S.manual && now - S.lastKey > IDLE) { setManual(false); }
    if (S.manual) {
      if (S.want && A.next(S.m, S.p, S.want) >= 0) { S.dir = S.want; }
      S.q = S.dir && A.next(S.m, S.p, S.dir) >= 0 ? S.p + S.dir : S.p;
      S.plan = null;
      return;
    }
    S.plan = A.plan(S.m, S.items, S.p, function (i) { return inBand(i, b); });
    // A document in view that is only reached by a long detour out of view: take the shortcut
    far = 2 * (b[1] - b[0]) + 2 * Math.round(window.innerWidth / G);
    if (S.plan && S.plan.length > far) { hop(S.plan[S.plan.length - 1], now); return; }
    S.q = S.plan ? S.plan[0] : S.p;
  }
  // Nothing it can walk to in view: hop to a document in another part of the maze,
  // or, once everything in view is read, let new documents arrive where the read ones were
  function idle(b, now) {
    var t = A.nearest(S.m, px(S.p), py(S.p), function (i) { return S.items[i] === 1; }, b[0], b[1]), i;
    if (t >= 0) { hop(t, now); return; }
    if (!S.emptyAt) { S.emptyAt = now; return; }
    if (now - S.emptyAt < REFILL) { return; }
    for (i = b[0] * S.m.c; i < (b[1] + 1) * S.m.c && i < S.items.length; i++) { if (S.seen[i]) { S.seen[i] = 0; S.items[i] = 1; } }
    S.emptyAt = 0;
  }
  function step(dt, now) {
    var b = band(), t, y;
    S.rot += dt / 1000 * 0.9;
    if (S.hop) {
      if (now - S.hop.t0 < HOP) { return; }
      S.p = S.q = S.hop.to; S.hop = null; S.waitUntil = 0;
    }
    // Out of view after a scroll: come back to where the reader is
    if (!S.manual && !inBand(S.p, b) && !(S.q !== S.p && inBand(S.q, b))) {
      if (!S.lostAt) { S.lostAt = now; }
      if (now - S.lostAt > LOST) {
        S.lostAt = 0;
        y = Math.min(Math.max(py(S.p), (b[0] + 0.5) * G), (b[1] + 0.5) * G);
        t = A.nearest(S.m, px(S.p), y, function (i) { return S.items[i] === 1; }, b[0], b[1]);
        if (t < 0) { t = A.nearest(S.m, px(S.p), y, null, b[0], b[1]); }
        if (t >= 0) { hop(t, now); return; }
      }
    } else { S.lostAt = 0; }
    if (S.q === S.p) {
      if (now < S.waitUntil) { return; }
      decide(now);
      if (S.hop) { return; }
      if (S.q === S.p) {
        if (!S.manual) { idle(b, now); S.waitUntil = now + RETRY; }
        return;
      }
      S.f = 0;
    }
    S.emptyAt = 0;
    S.f += dt / 1000 * SPEED;
    while (S.f >= 1) {
      S.f -= 1; S.p = S.q; decide(now);
      if (S.hop || S.q === S.p) { S.f = 0; break; }
    }
  }
  // While steered from the keyboard, the page scrolls to keep the agent in view
  function follow() {
    if (!S.manual || S.hop) { return; }
    var y = at()[1] - window.scrollY, hi = navH + 0.2 * (window.innerHeight - navH), lo = 0.78 * window.innerHeight;
    if (y > lo) { window.scrollBy({ top: y - lo, behavior: 'instant' }); }
    else if (y < hi && window.scrollY > 0) { window.scrollBy({ top: y - hi, behavior: 'instant' }); }
  }

  // ---- drawing ----
  function mark(x, y, R) {
    if (R < 0.5) { return; }
    var k = R / 20, i, a;
    ctx.save(); ctx.translate(x, y); ctx.rotate(S.rot);
    ctx.strokeStyle = INK; ctx.lineWidth = 5 * k; ctx.setLineDash(GAPS.map(function (g) { return g * k; }));
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = SIGNAL;
    for (i = 0; i < 4; i++) {
      a = IMG[i][0] * Math.PI / 180;
      ctx.beginPath(); ctx.arc(R * Math.cos(a), R * Math.sin(a), IMG[i][1] * k * 1.15, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  function draw(now) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    var sy = window.scrollY, c = S.m.c, r = Math.max(1.1, G * 0.08), s = G * 0.17, y0, y1, x, y, i, a, k, R = G * A.SIZE;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, navH, w, h - navH); ctx.clip();
    ctx.translate(-window.scrollX, -sy);
    y0 = Math.max(0, Math.floor((sy + navH) / G) - 1); y1 = Math.min(S.m.r - 1, Math.ceil((sy + h) / G));
    // Documents: dots may be read, squares are restricted
    ctx.fillStyle = DOT; ctx.beginPath();
    for (y = y0; y <= y1; y++) {
      for (x = 0; x < c; x += A.STEP) {
        if (S.items[y * c + x] === 1) { ctx.moveTo((x + 0.5) * G + r, (y + 0.5) * G); ctx.arc((x + 0.5) * G, (y + 0.5) * G, r, 0, 6.2832); }
      }
    }
    ctx.fill();
    ctx.strokeStyle = SQ; ctx.lineWidth = 1; ctx.beginPath();
    for (y = y0; y <= y1; y++) {
      for (x = 0; x < c; x += A.STEP) {
        if (S.items[y * c + x] === 2) { ctx.rect((x + 0.5) * G - s, (y + 0.5) * G - s, 2 * s, 2 * s); }
      }
    }
    ctx.stroke();
    a = at();
    // Its plan: the shortest route to the next document it may read
    if (S.plan && S.plan.length) {
      ctx.strokeStyle = SIGNAL; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      for (i = S.plan[0] === S.q ? 1 : 0; i < S.plan.length; i++) { ctx.lineTo(px(S.plan[i]), py(S.plan[i])); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      i = S.plan[S.plan.length - 1];
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px(i), py(i), G * 0.28, 0, 6.2832); ctx.stroke();
    }
    if (S.hop) {
      k = Math.min(1, (now - S.hop.t0) / HOP);
      if (k < 0.5) { mark(px(S.hop.from), py(S.hop.from), R * (1 - 2 * k)); } else { mark(px(S.hop.to), py(S.hop.to), R * (2 * k - 1)); }
    } else { mark(a[0], a[1], R); }
    ctx.restore();
    if (S.stats.read !== shown.read) { shown.read = S.stats.read; ui.read.textContent = num(S.stats.read); }
    if (S.locked !== shown.locked) { shown.locked = S.locked; ui.locked.textContent = num(S.locked); }
  }

  // ---- controls ----
  var KEYS = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd', q: 'l', z: 'u' };
  function setManual(on) {
    S.manual = on; S.plan = null; S.lastKey = performance.now(); S.waitUntil = 0;
    if (!on) { S.want = 0; S.dir = 0; }
    ui.steer.setAttribute('aria-pressed', String(on));
    ui.steer.textContent = on ? L.steering : L.steer;
  }
  ui.steer.addEventListener('click', function () { setManual(!S.manual); ui.steer.focus(); });
  ui.steer.addEventListener('keydown', function (e) {
    if (!S.m) { return; }
    if (e.key === 'Escape') { setManual(false); return; }
    var k = KEYS[e.key];
    if (!k) { return; }
    e.preventDefault();
    if (!S.manual) { setManual(true); }
    S.want = { l: -1, r: 1, u: -S.m.c, d: S.m.c }[k]; S.lastKey = performance.now();
  });
  ui.steer.addEventListener('blur', function () { if (S.manual) { setManual(false); } });
  // The visitor can put it away; the choice is remembered on this browser only
  function setOff(off) {
    S.off = off; cv.hidden = off; hud.classList.toggle('is-off', off); ui.open.hidden = !off;
    if (off) { if (S.manual) { setManual(false); } } else { start(); }
    try { localStorage.setItem('qz-agent', off ? 'off' : 'on'); } catch (e) { /* storage blocked: nothing to remember */ }
  }
  ui.close.addEventListener('click', function () { setOff(true); ui.open.focus(); });
  ui.open.addEventListener('click', function () { setOff(false); ui.close.focus(); });

  // The maze is read again when the page changes shape (resize, fonts, an answer opened)
  function invalidate() { dirty = true; }
  window.addEventListener('resize', invalidate);
  if (window.ResizeObserver) { new ResizeObserver(invalidate).observe(document.body); }
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(invalidate); }
  document.addEventListener('toggle', invalidate, true);

  function frame(now) {
    if (S.off) { running = false; return; }
    var dt = Math.min(100, Math.max(0, now - last)) || 16;
    last = now;
    if (dirty && now - built > 250) { build(now); }
    if (S.m && S.p >= 0) { step(dt, now); follow(); draw(now); }
    requestAnimationFrame(frame);
  }
  function start() {
    if (running) { return; }
    running = true; last = performance.now(); requestAnimationFrame(frame);
  }
  var off = false;
  try { off = localStorage.getItem('qz-agent') === 'off'; } catch (e) { /* storage blocked: start on */ }
  hud.hidden = false;
  setOff(off);
})();
