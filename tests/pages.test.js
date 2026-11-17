// The French page must say exactly what the English page says.
// Compares the two files tag by tag, number by number. Run: node tests/pages.test.js
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const en = read('index.html'), fr = read('fr/index.html');

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
  ok(name + ': hreflang alternates', ['hreflang="en" href="https://www.quasarzero.fr/"', 'hreflang="fr" href="https://www.quasarzero.fr/fr/"', 'hreflang="x-default"'].every((s) => h.includes(s)));
}
ok('canonical URLs', en.includes('rel="canonical" href="https://www.quasarzero.fr/"') && fr.includes('rel="canonical" href="https://www.quasarzero.fr/fr/"'));
ok('each page links to the other', (en.match(/href="fr\/"/g) || []).length === 2 && (fr.match(/href="\.\.\/"/g) || []).length === 2);

// 5. The French page loads the shared files from the parent folder, and they exist
const assets = [...fr.matchAll(/(?:href|src)="(\.\.\/[^"#]+)"/g)].map((m) => m[1]).filter((a) => a !== '../');
ok('french page assets exist', assets.length >= 5 && assets.every((a) => fs.existsSync(path.join(__dirname, '..', 'fr', a))), assets.join(' '));

// 6. Formulas are language-neutral and present in both
for (const f of ['ω ∝ r^(−3/2) ;  r(t) = r(0) · e^(−λt)', 'y ≈ ȳ + s₁u₁ + s₂u₂ + s₃u₃', 'N(mᵀφ, 1/β + φᵀSφ)', 'argmax p(s | α, β)']) {
  ok('formula in both pages: ' + f, en.includes(f) && fr.includes(f));
}

// 7. French typography: no ordinary space before : ; ? ! %
const loose = tf.filter((t) => / [:;?!%]/.test(t) && !t.includes('r(t)'));
ok('non-breaking spaces before French punctuation', loose.length === 0, loose.slice(0, 2).join(' | '));

console.log(fails ? '\n' + fails + ' failure(s)' : '\nOK: all checks passed');
process.exit(fails ? 1 : 0);
