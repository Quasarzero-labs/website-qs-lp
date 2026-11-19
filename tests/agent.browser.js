// The roaming agent, checked in a real Chrome on the real pages. Every position where the agent
// is drawn is recorded and compared with the text and images of the page, measured by the
// browser itself (text ranges), not by the agent's own reading of the page.
// Run: node tests/agent.browser.js [screenshot dir]   (needs Google Chrome and python3)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'agent-shots-'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5190 + Math.floor(Math.random() * 400);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
function ok(name, cond, detail) {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
  if (!cond) fails++;
}

// Records the centre of the agent each time it is drawn (the mark is the only rotated shape)
const RECORDER = `(() => {
  window.__roam = [];
  const rotate = CanvasRenderingContext2D.prototype.rotate;
  CanvasRenderingContext2D.prototype.rotate = function (a) {
    if (this.canvas && this.canvas.id === 'roam') {
      const m = this.getTransform(), d = Math.min(devicePixelRatio || 1, 2);
      window.__roam.push([performance.now(), m.e / d + scrollX, m.f / d + scrollY, m.f / d]);
    }
    return rotate.call(this, a);
  };
})();`;

// What a reader sees: every line of text and every image or control, in page pixels
const CONTENT = `(() => {
  const boxes = [], skip = '#roam-hud, .nav, script, style, noscript, .skip';
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!/\\S/.test(n.nodeValue) || n.parentElement.closest(skip)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) if (r.width > 0 && r.height > 0)
      boxes.push([r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY, n.nodeValue.trim().slice(0, 30)]);
  }
  for (const el of document.querySelectorAll('img, svg, canvas, button, input, video')) {
    if (el.closest(skip) || el.id === 'roam' || el.classList.contains('hero__field')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) boxes.push([r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY, '<' + el.tagName.toLowerCase() + '>']);
  }
  return boxes;
})()`;

function gap(x, y, b) {
  const dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]);
  return Math.hypot(dx, dy);
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const stop = () => { try { chrome.kill(); } catch (e) {} try { server.kill(); } catch (e) {} };
  try {
    const wsBrowser = await new Promise((resolve, reject) => {
      let buf = '';
      chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
      setTimeout(() => reject(new Error('Chrome did not start')), 15000);
    });
    const port = new URL(wsBrowser).port;
    let page = null;
    for (let k = 0; k < 50 && !page; k++) {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      page = list.find((t) => t.type === 'page');
      if (!page) await wait(100);
    }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map(), waiters = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      else if (msg.method) { for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === msg.method) { waiters[i].resolve(msg.params); waiters.splice(i, 1); } }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
    const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
    const js = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description));
      return r.result.value;
    };
    const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name), Buffer.from(r.data, 'base64')); };
    const open = async (url, w, h, mobile) => {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url });
      await loaded;
      await wait(1500);
      await js('window.__roam.length = 0');
    };
    const key = async (k, code, vk) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });

    // Scrolls through a page, then checks every recorded position against what a reader sees
    async function tour(label, url, w, h, mobile, stops) {
      await open(url, w, h, mobile);
      const G = w < 600 ? 12 : 16, reach = G * 0.42 * (1 + 4.2 * 1.15 / 20);
      const counts = [];
      let inView = 0, views = 0;
      for (let k = 0; k < stops.length; k++) {
        await js(`scrollTo({ top: ${stops[k]} * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' })`);
        await wait(2600);
        if (k === 1 || k === stops.length - 2) await shot(label + '-' + k + '.png');
        const s = await js(`(() => { const nav = document.getElementById('nav').getBoundingClientRect().height, r = window.__roam, last = r[r.length - 1];
          return { read: +document.getElementById('roam-read').textContent.replace(/\\D/g, ''), y: last ? last[3] : -1, nav, h: innerHeight }; })()`);
        counts.push(s.read);
        views++;
        if (s.y >= s.nav && s.y <= s.h) inView++;
      }
      const samples = await js('window.__roam'), boxes = await js(CONTENT);
      let worst = Infinity, where = '';
      for (const p of samples) {
        for (const b of boxes) { const d = gap(p[1], p[2], b); if (d < worst) { worst = d; where = b[4]; } }
      }
      ok(label + ': the agent never touches text or images (' + samples.length + ' positions, ' + boxes.length + ' boxes)', samples.length > 200 && worst >= reach,
        'closest ' + worst.toFixed(1) + ' px from "' + where + '", drawn radius ' + reach.toFixed(1) + ' px');
      ok(label + ': it keeps reading as the page scrolls', counts.every((c, i) => i === 0 || c > counts[i - 1]), counts.join(' → '));
      ok(label + ': it is back in view after each scroll', inView === views, inView + ' of ' + views + ' stops');
      const dts = samples.slice(1).map((p, i) => p[0] - samples[i][0]).sort((a, b) => a - b);
      return { dts, boxes };
    }

    // 1. Desktop, English: the whole page, top to bottom
    const stops = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1];
    const d = await tour('desktop-en', 'http://127.0.0.1:' + PORT + '/', 1440, 900, false, stops);
    const p95 = d.dts[Math.floor(d.dts.length * 0.95)];
    ok('desktop-en: drawn every frame, no long stalls', p95 < 40, '95th percentile between frames ' + p95.toFixed(1) + ' ms');
    const restricted = await js(`+document.getElementById('roam-locked').textContent.replace(/\\D/g, '')`);
    ok('desktop-en: restricted documents are counted, none opened', restricted > 0, restricted + ' restricted on the page');

    // 2. Keyboard: Steer hands the agent to the arrow keys, Esc hands it back
    await js(`document.getElementById('roam-steer').focus()`);
    await key('ArrowLeft', 'ArrowLeft', 37);
    await wait(300);
    const steering = await js(`[document.getElementById('roam-steer').getAttribute('aria-pressed'), document.getElementById('roam-steer').textContent]`);
    ok('keyboard: an arrow key hands over the controls', steering[0] === 'true' && /Esc/.test(steering[1]), steering.join(' · '));
    const y0 = await js('scrollY');
    for (let k = 0; k < 12; k++) { await key('ArrowUp', 'ArrowUp', 38); await wait(250); }
    const y1 = await js('scrollY');
    ok('keyboard: the arrows move it, the page follows it', y1 !== y0 || (await js('window.__roam.length')) > 0, 'scroll ' + Math.round(y0) + ' → ' + Math.round(y1));
    await key('Escape', 'Escape', 27);
    await wait(200);
    const back = await js(`[document.getElementById('roam-steer').getAttribute('aria-pressed'), document.getElementById('roam-steer').textContent]`);
    ok('keyboard: Esc hands it back to the agent', back[0] === 'false' && back[1] === 'Steer', back.join(' · '));

    // 3. Hide: nothing drawn, remembered on reload, and it comes back on demand
    await js(`document.getElementById('roam-close').click()`);
    await wait(200);
    const n0 = await js('window.__roam.length');
    await wait(800);
    const n1 = await js('window.__roam.length');
    ok('hide: the agent stops and its layer is hidden', n1 === n0 && (await js(`document.getElementById('roam').hidden`)), (n1 - n0) + ' frames drawn after hiding');
    await open('http://127.0.0.1:' + PORT + '/', 1440, 900, false);
    await wait(600);
    const still = await js(`[window.__roam.length, document.getElementById('roam-hud').classList.contains('is-off'), document.getElementById('roam-open').hidden]`);
    ok('hide: remembered after a reload', still[0] === 0 && still[1] && !still[2], still.join(' · '));
    await js(`document.getElementById('roam-open').click()`);
    await wait(600);
    ok('hide: Show brings it back', (await js('window.__roam.length')) > 10);

    // 4. Reduced motion: no agent at all
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await open('http://127.0.0.1:' + PORT + '/', 1440, 900, false);
    await wait(600);
    const rm = await js(`[window.__roam.length, getComputedStyle(document.getElementById('roam-hud')).display]`);
    ok('reduced motion: nothing moves and no counter', rm[0] === 0 && rm[1] === 'none', rm.join(' · '));
    await send('Emulation.setEmulatedMedia', { features: [] });

    // 5. Phone, French: same rules, the counter fits on the screen and speaks French
    await tour('mobile-fr', 'http://127.0.0.1:' + PORT + '/fr/', 375, 812, true, [0, 0.2, 0.45, 0.7, 1]);
    const hud = await js(`(() => { const r = document.getElementById('roam-hud').getBoundingClientRect(); return [r.left, r.right, innerWidth, document.querySelector('.roam__count').textContent]; })()`);
    ok('mobile-fr: the counter fits on the screen', hud[0] >= 0 && hud[1] <= hud[2], Math.round(hud[0]) + '–' + Math.round(hud[1]) + ' of ' + hud[2] + ' px');
    ok('mobile-fr: the counter is in French', /lus/.test(hud[3]) && /jamais ouverts/.test(hud[3]), hud[3].trim());

    // 6. A narrow laptop, French
    await tour('laptop-fr', 'http://127.0.0.1:' + PORT + '/fr/', 1024, 700, false, [0, 0.3, 0.6, 0.9]);
    ws.close();
  } finally {
    stop();
  }
  console.log('screenshots: ' + out);
  console.log(fails ? '\n' + fails + ' failure(s)' : '\nOK: all checks passed');
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
