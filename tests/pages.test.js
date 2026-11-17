// Each French page must say exactly what its English page says.
// Compares each pair tag by tag, number by number. Run: node tests/pages.test.js
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

let fails = 0;
function ok(name, cond, detail) {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
  if (!cond) fails++;
}
const strip = (h) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '<script></script>');
// Every opening tag with its id and classes, in order
function skeleton(h) {
  const out = [];
  for (const m of strip(h).matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)) {
    const id = (m[2].match(/\bid="([^"]*)"/) || [])[1], cls = (m[2].match(/\bclass="([^"]*)"/) || [])[1];
    out.push(m[1] + (id ? '#' + id : '') + (cls ? '.' + cls.trim().split(/\s+/).join('.') : ''));
  }
  return out;
}
// Visible text nodes, in order
function texts(h) {
  const body = strip(h).slice(h.indexOf('<body'));
  // Only ordinary whitespace is collapsed: non-breaking spaces must survive to be checked below
  return body.split(/<[^>]+>/).map((t) => t.replace(/&amp;/g, '&').replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, '')).filter(Boolean);
}
const digits = (list) => list.join(' ').match(/\d+/g) || [];

const PAIRS = [
  { en: 'index.html', fr: 'fr/index.html', toFr: 'fr/', toEn: '\\.\\./',
    urlEn: 'https://www.quasarzero.fr/', urlFr: 'https://www.quasarzero.fr/fr/',
    shared: ['ω ∝ r^(−3/2) ;  r(t) = r(0) · e^(−λt)', 'y ≈ ȳ + s₁u₁ + s₂u₂ + s₃u₃', 'N(mᵀφ, 1/β + φᵀSφ)', 'argmax p(s | α, β)'] },
  { en: 'legal/index.html', fr: 'fr/mentions-legales/index.html', toFr: '\\.\\./fr/mentions-legales/', toEn: '\\.\\./\\.\\./legal/',
    urlEn: 'https://www.quasarzero.fr/legal/', urlFr: 'https://www.quasarzero.fr/fr/mentions-legales/',
    shared: ['100 989 490', '88 Colin P. Kelly Jr. Street', 'contact@quasarzero.fr', 'cnil.fr'] },
];
for (const P of PAIRS) {
  console.log('\n# ' + P.en + '  ↔  ' + P.fr);
  const en = read(P.en), fr = read(P.fr);
  // 1. Same structure
  const se = skeleton(en), sf = skeleton(fr);
  const firstDiff = se.findIndex((t, i) => t !== sf[i]);
  ok('same tags, ids and classes in the same order', se.length === sf.length && firstDiff === -1,
    firstDiff === -1 ? se.length + ' tags' : 'first difference at tag ' + firstDiff + ': ' + se[firstDiff] + ' vs ' + sf[firstDiff]);

  // 2. Same number of text nodes, and the same figures in them
  const te = texts(en), tf = texts(fr);
  ok('same number of text nodes', te.length === tf.length, te.length + ' vs ' + tf.length);
  const de = digits(te), df = digits(tf);
  const firstNum = de.findIndex((d, i) => d !== df[i]);
  ok('same figures in the same order', de.length === df.length && firstNum === -1,
    firstNum === -1 ? de.length + ' figures' : 'first difference: ' + de[firstNum] + ' vs ' + df[firstNum]);

  // 3. Nothing left untranslated: a sentence may not be identical in both pages
  const same = te.filter((t, i) => t === tf[i] && t.split(' ').length >= 4 && /[a-z]{4}/.test(t)
    && !/[≈∝→~]/.test(t) && !/^(Dakar|©)/.test(t));
  ok('no sentence left in English on the French page', same.length === 0, same.slice(0, 3).join(' | '));
  const english = tf.filter((t) => /\b(the|and|your|with|our)\b/i.test(t));
  ok('no common English word in French text', english.length === 0, english.slice(0, 3).join(' | '));

  // 4. Languages declared and linked both ways
  ok('lang attributes', /<html lang="en">/.test(en) && /<html lang="fr">/.test(fr));
  for (const [name, h] of [['en', en], ['fr', fr]]) {
    ok(name + ': hreflang alternates', ['hreflang="en" href="' + P.urlEn + '"', 'hreflang="fr" href="' + P.urlFr + '"', 'hreflang="x-default" href="' + P.urlEn + '"'].every((s) => h.includes(s)));
  }
  ok('canonical URLs', en.includes('rel="canonical" href="' + P.urlEn + '"') && fr.includes('rel="canonical" href="' + P.urlFr + '"'));
  ok('each page links to the other', (en.match(new RegExp('href="' + P.toFr + '"', 'g')) || []).length === 2 && (fr.match(new RegExp('href="' + P.toEn + '"', 'g')) || []).length === 2);

  // 5. The French page loads the shared files from the parent folder, and they exist
  const assets = [...fr.matchAll(/(?:href|src)="(\.\.\/[^"#]+\.[a-z0-9]+)"/g)].map((m) => m[1]);
  ok('french page assets exist', assets.length >= 5 && assets.every((a) => fs.existsSync(path.join(__dirname, '..', path.dirname(P.fr), a))), assets.join(' '));

  // 6. Formulas are language-neutral and present in both
  for (const f of P.shared) {
    ok('identical in both pages: ' + f, en.includes(f) && fr.includes(f));
  }

  // 7. French typography: no ordinary space before : ; ? ! %
  const loose = tf.filter((t) => / [:;?!%]/.test(t) && !t.includes('r(t)'));
  ok('non-breaking spaces before French punctuation', loose.length === 0, loose.slice(0, 2).join(' | '));
}

// Each home page has its own share image, served from this repository, at the size social networks expect
for (const p of ['index.html', 'fr/index.html']) {
  const url = (read(p).match(/property="og:image" content="https:\/\/www\.quasarzero\.fr\/([^"]+)"/) || [])[1];
  const file = url && path.join(__dirname, '..', url);
  const png = file && fs.existsSync(file) ? fs.readFileSync(file) : null;
  const size = png && png.toString('ascii', 1, 4) === 'PNG' ? png.readUInt32BE(16) + '×' + png.readUInt32BE(20) : 'missing';
  ok(p + ': share image ' + url + ' is a 1200×630 PNG', size === '1200×630', size);
}
ok('share images differ by language', read('index.html').includes('og-en.png') && read('fr/index.html').includes('og-fr.png'));

// The home pages link to their own legal page
ok('home pages link to the legal pages', read('index.html').includes('href="legal/"') && read('fr/index.html').includes('href="mentions-legales/"'));

console.log(fails ? '\n' + fails + ' failure(s)' : '\nOK: all checks passed');
process.exit(fails ? 1 : 0);
