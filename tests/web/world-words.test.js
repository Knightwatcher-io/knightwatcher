// Tests for the medieval world's words and overlay: the word set words.medieval and the overlay
// overlay.phosphor of web/packs/medieval.pack.json, as web/js/world.js compiles them; the rule that
// builds the quiet line and the captions from the collector's parts (KW.world.join, quietLine and
// caption), held to the collector's quiet_line() and text.join_fitting(); where the words and the
// overlay come from on a 'dev' page and a deployed one; the overlay's CSS custom properties against
// the values web/css/display.css keeps as its fallback; how main.js writes the words; and the demo's
// quiet line and captions. Run with: node --test tests/web/
//
// The page's scripts run under Node in a sandbox, as in tests/web/world.test.js; a signed pack is
// signed with a key generated in memory for the run.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PK = require('../../web/js/pack.js');
const SIGN = require('../../tools/sign-pack.js');

const WEB = path.join(__dirname, '../../web');
const TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB, 'css/display.css'), 'utf8');
const MAIN = fs.readFileSync(path.join(WEB, 'js/main.js'), 'utf8');
/* The scripts index.html loads, in its order, but the engine, the settings and main.js: the
   drawing, the scenes, the pack library, the compiler, the carriers, the state and the demo. */
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !['js/engine.js', 'js/settings.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));

/* The page's scripts in a sandbox, with the console's lines as [level, text]: { box, KW, W, lines }. */
function sandbox() {
  const lines = [];
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const box = vm.createContext({ window: {}, document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) },
    console: { info: l => lines.push(['info', l]), warn: l => lines.push(['warn', l]), log() {} } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  return { box, KW, W: KW.world, lines };
}
/* A sandbox started from the pack as a 'dev' page reads it. */
function started() { const s = sandbox(); s.W.start([TEXT], true); return s; }
/* The pack's text with its pack changed by edit. */
function edited(edit) { const env = JSON.parse(TEXT); edit(env.pack); return JSON.stringify(env) + '\n'; }
const KEY = crypto.generateKeyPairSync('ed25519');
function signedText(text) {
  const value = crypto.sign(null, Buffer.from(PK.message(JSON.parse(text).pack)), KEY.privateKey).toString('base64');
  return SIGN.withSig(text, { alg: 'ed25519', kid: 'test1', value });
}
const keysIn = s => ({ test1: vm.runInContext(`new Uint8Array([${[...Buffer.from(KEY.publicKey.export({ format: 'jwk' }).x, 'base64url')]}])`, s.box) });

/* The quiet line's parts as the collector sends them, for n ads blocked written whole and short. */
const quiet = (n, short, more) => [{ k: 'quiet' }, { k: 'up', n: '29' }, { k: 'backup', at: '03:12' }, Object.assign({ k: 'ads', n, short }, more)];
const len = s => Array.from(s).length;

// ---- The words in the pack ---------------------------------------------------------------------------

test('kw.medieval gives the word set words.medieval as the owner chose it', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(plain(r.data.words), { 'words.medieval': {
    name: 'Medieval', watcher: 'the knight',
    labels: { watcher: 'The knight', patron: 'The monarch', build: 'Build', tabard: 'Tabard', plume: 'Plume', helmet: 'Helmet', foe: 'Foe', critter: 'Pest', pet: 'The cat' },
    quiet: { quiet: ['ALL QUIET'], up: ['{n} up'], backup: ['backup {at}'], ads: ['{n} ads slain', '{short} ads slain', '{short} slain'] },
    captions: { ip_banned: ['BANISHED {addr} · {jail}', 'BANISHED {addr}'], import: ['DELIVERED · {title}'], backup_done: ['STORES SAFE {at}'] } } });
  const s = started(), w = s.W.words;
  assert.deepEqual(plain(w), Object.assign({ source: 'pack', set: 'words.medieval', faults: [] }, plain(r.data.words['words.medieval'])));
});

test('the quiet line from the medieval words: ads slain, shortened and dropped as the line needs', () => {
  const s = started(), Q = (parts, own) => s.W.quietLine(parts, own === undefined ? 'OWN' : own);
  assert.equal(Q(quiet('4,812', '4,812')), 'ALL QUIET · 29 up · backup 03:12 · 4,812 ads slain');
  // 51 characters with the count whole; one more digit takes the short form
  assert.equal(Q(quiet('12,345', '12.3k')), 'ALL QUIET · 29 up · backup 03:12 · 12,345 ads slain');
  assert.equal(Q(quiet('123,456', '123k')), 'ALL QUIET · 29 up · backup 03:12 · 123,456 ads slain');
  assert.equal(Q(quiet('1,234,567', '1.2M')), 'ALL QUIET · 29 up · backup 03:12 · 1.2M ads slain');
  assert.equal(Q(quiet('1,234,567,890', '12345.6M')), 'ALL QUIET · 29 up · backup 03:12 · 12345.6M slain');
  // after a longer backup part the count takes its shortest form, then is dropped, and then the
  // backup is
  const long = [{ k: 'quiet' }, { k: 'up', n: '29' }, { k: 'backup', at: '03:12 Sun' }, { k: 'ads', n: '1,234,567', short: '1.2M' }];
  assert.equal(Q(long), 'ALL QUIET · 29 up · backup 03:12 Sun · 1.2M slain');
  long[2].at = '03:12 on Sunday';
  assert.equal(Q(long), 'ALL QUIET · 29 up · backup 03:12 on Sunday');
  long[2].at = 'x'.repeat(40);
  assert.equal(Q(long), 'ALL QUIET · 29 up');
  // the parts the collector had readings for, and no more
  assert.equal(Q([{ k: 'quiet' }, { k: 'up', n: '29' }]), 'ALL QUIET · 29 up');
  assert.equal(Q([{ k: 'quiet' }]), 'ALL QUIET');
});

test('each caption from the medieval words', () => {
  const s = started(), C = (type, parts) => s.W.caption(type, parts, 'OWN');
  assert.equal(C('ip_banned', { addr: '203.0.113.77', jail: 'sshd' }), 'BANISHED 203.0.113.77 · sshd');
  assert.equal(C('import', { title: 'The Night Shift S02E04' }), 'DELIVERED · The Night Shift S02E04');
  assert.equal(C('backup_done', { at: '03:12' }), 'STORES SAFE 03:12');
  // a ban with no jail passes over the template that needs one
  assert.equal(C('ip_banned', { addr: '203.0.113.77' }), 'BANISHED 203.0.113.77');
  assert.equal(C('ip_banned', { addr: '203.0.113.77', jail: '' }), 'BANISHED 203.0.113.77');
  // an address too long for the jail as well takes the shorter template
  const v6 = '2001:db8:85a3:1234::8a2e:370:7334';
  assert.equal(C('ip_banned', { addr: v6, jail: 'sshd' }), 'BANISHED ' + v6);
  // a title too long is cut at 44 with the collector's ellipsis
  const cut = C('import', { title: 'An Extraordinarily Long Film Title: The Sequel' });
  assert.equal(cut, 'DELIVERED · An Extraordinarily Long Film Ti…');
  assert.equal(len(cut), 44);
});

// ---- The rule ----------------------------------------------------------------------------------------

test('join: the parts joined with " · ", each in the first template it has the values for', () => {
  const s = sandbox(), J = s.W.join;
  const sets = { a: ['A {x} long', 'A {x}', 'A'], b: ['B {y}', 'B'], c: ['C'] };
  assert.equal(J([{ k: 'a', x: '1' }, { k: 'b', y: '2' }, { k: 'c' }], sets, 52), 'A 1 long · B 2 · C');
  // a template whose value the part lacks is passed over for the next
  assert.equal(J([{ k: 'a' }, { k: 'b', y: '2' }], sets, 52), 'A · B 2');
  // a part whose every template lacks a value is passed over
  assert.equal(J([{ k: 'a', x: '1' }, { k: 'd' }], { a: ['A {x}'], d: ['D {z}'] }, 52), 'A 1');
  assert.equal(J([{ k: 'd' }], { d: ['D {z}'] }, 52), null);
  // a value that is not a string, or is empty, is lacking
  assert.equal(J([{ k: 'a', x: 3 }], sets, 52), 'A');
  assert.equal(J([{ k: 'a', x: '  ' }], sets, 52), 'A');
  // a kind the sets give no templates for: the whole line is the collector's
  assert.equal(J([{ k: 'a', x: '1' }, { k: 'new' }], sets, 52), null);
  for (const bad of [null, [], 'parts', [null], [{ x: '1' }]]) assert.equal(J(bad, sets, 52), null, JSON.stringify(bad));
  assert.equal(J([{ k: 'a' }], null, 52), null);
});

test('join: the last part shortens, then drops, then the one before it, and the first is cut', () => {
  const s = sandbox(), J = s.W.join;
  const sets = { a: ['AAAAAAAAAA'], b: ['BBBBBBBBBB', 'BBBBB'], c: ['CCCCCCCCCC', 'CCC'] };
  const parts = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
  assert.equal(J(parts, sets, 36), 'AAAAAAAAAA · BBBBBBBBBB · CCCCCCCCCC'); // 36 exactly
  assert.equal(J(parts, sets, 35), 'AAAAAAAAAA · BBBBBBBBBB · CCC');
  assert.equal(J(parts, sets, 28), 'AAAAAAAAAA · BBBBBBBBBB'); // c dropped before b shortens
  assert.equal(J(parts, sets, 22), 'AAAAAAAAAA · BBBBB');
  assert.equal(J(parts, sets, 17), 'AAAAAAAAAA');
  // the first part alone, too long: its shortest form, cut with an ellipsis
  assert.equal(J([{ k: 'b' }], sets, 4), 'BBB…');
  assert.equal(J([{ k: 'b' }], sets, 5), 'BBBBB');
  // the cut drops white space before the ellipsis, as text.clip() does
  assert.equal(J([{ k: 'a', x: 'one two' }], { a: ['{x}'] }, 5), 'one…');
});

test('join: the limits are the collector\'s, 52 for the quiet line and 44 for a caption', () => {
  const s = started();
  assert.deepEqual([s.W.QUIET_MAX, s.W.CAPTION_MAX], [52, 44]);
  // the quiet line at 52 and at 53
  const at = n => [{ k: 'quiet' }, { k: 'backup', at: 'x'.repeat(n) }];
  assert.equal(len(s.W.quietLine(at(33), '')), 52);
  assert.equal(s.W.quietLine(at(34), ''), 'ALL QUIET');
  // a caption at 44 and at 45
  assert.equal(s.W.caption('backup_done', { at: 'y'.repeat(32) }, ''), 'STORES SAFE ' + 'y'.repeat(32));
  assert.equal(s.W.caption('backup_done', { at: 'y'.repeat(33) }, ''), 'STORES SAFE ' + 'y'.repeat(31) + '…');
});

test('join: characters are counted by code point, and runs of white space are made single, as the collector does', () => {
  const s = sandbox(), J = s.W.join;
  // an astral character is one character, not two
  assert.equal(J([{ k: 'a', x: '\u{1F3AC}'.repeat(4) }], { a: ['{x}'] }, 4), '\u{1F3AC}'.repeat(4));
  assert.equal(J([{ k: 'a', x: '\u{1F3AC}'.repeat(5) }], { a: ['{x}'] }, 4), '\u{1F3AC}'.repeat(3) + '…');
  assert.equal(J([{ k: 'a', x: ' The   Night\tShift ' }], { a: ['DELIVERED · {x}'] }, 44), 'DELIVERED · The Night Shift');
});

test('join: a value is text, never markup, and main.js writes the words with textContent', () => {
  const s = started();
  assert.equal(s.W.caption('import', { title: '<b>Bold</b> & "quoted"' }, ''), 'DELIVERED · <b>Bold</b> & "quoted"');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(MAIN), 'main.js writes no markup');
  assert.ok(MAIN.includes('quiet.textContent = t.quiet'));
  assert.ok(MAIN.includes('quiet.textContent = text'));
  assert.ok(MAIN.includes('cap.textContent = text'));
  // the live quiet line and the captions go through the words
  assert.ok(MAIN.includes('KW.world.quietLine(v.quietParts, v.quietLine)'));
  assert.ok(MAIN.includes('KW.world.caption(e.type, e.parts, e.text)'));
  assert.ok(MAIN.includes('E.fireEvent(e.act, captionOf(e))'));
});

test('with no parts, or no words for them, the collector\'s own text is shown as it is', () => {
  const s = started();
  assert.equal(s.W.quietLine(null, 'ALL QUIET · 12 up'), 'ALL QUIET · 12 up');
  assert.equal(s.W.quietLine([], 'ALL QUIET · 12 up'), 'ALL QUIET · 12 up');
  assert.equal(s.W.quietLine(undefined, undefined), '');
  // a kind of part the words do not know
  assert.equal(s.W.quietLine([{ k: 'quiet' }, { k: 'streams', n: '2' }], 'OWN'), 'OWN');
  assert.equal(s.W.caption('ip_banned', null, 'BANNED 203.0.113.77'), 'BANNED 203.0.113.77');
  assert.equal(s.W.caption('import', {}, 'IMPORTED · A Film'), 'IMPORTED · A Film');
  assert.equal(s.W.caption('ad_blocked', { n: '3' }, ''), '');
  // words without captions, or without a quiet line
  const noCaptions = sandbox();
  noCaptions.W.start([edited(p => { delete p.words['words.medieval'].captions; })], true);
  assert.equal(noCaptions.W.caption('backup_done', { at: '03:12' }, 'BACKUP DONE 03:12'), 'BACKUP DONE 03:12');
  assert.equal(noCaptions.W.quietLine(quiet('4,812', '4,812'), 'OWN'), 'ALL QUIET · 29 up · backup 03:12 · 4,812 ads slain');
  // a pack without words, and so without the preset that names them: the collector's text, and no
  // line in the console of its own
  const none = sandbox();
  none.W.start([edited(p => { delete p.words; delete p.worlds; p.provides = p.provides.filter(x => x !== 'words' && x !== 'worlds'); })], true);
  assert.deepEqual(plain(none.W.words), { source: 'code', set: null, name: null, watcher: null, labels: null, quiet: null, captions: null, faults: [] });
  assert.equal(none.W.quietLine(quiet('4,812', '4,812'), 'OWN'), 'OWN');
  assert.equal(none.W.caption('backup_done', { at: '03:12' }, 'BACKUP DONE 03:12'), 'BACKUP DONE 03:12');
  assert.deepEqual(none.lines.map(l => l[0]), ['info']);
  // before start, the collector's text too
  assert.equal(sandbox().W.quietLine(quiet('4,812', '4,812'), 'OWN'), 'OWN');
});

// ---- The overlay ----------------------------------------------------------------------------------------

/* The fallback display.css gives each --kw- property, from its var(--kw-..., fallback) forms. Each
   property must have one fallback, the same wherever it is read. */
function cssFallbacks() {
  const out = {};
  for (const m of CSS.matchAll(/var\((--kw-[a-z0-9]+), ((?:[^()]|\([^()]*\))+)\)/g)) {
    const v = m[2].trim();
    if (out[m[1]] !== undefined) assert.equal(v, out[m[1]], m[1] + ' has two fallbacks');
    out[m[1]] = v;
  }
  return out;
}
/* A colour as six hex digits, from #rgb, #rrggbb or rgba(r,g,b,a) (then with its alpha). */
const norm = c => {
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  return (m ? '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3] : c).toLowerCase().replace(/\s+/g, '');
};

test('the overlay overlay.phosphor holds display.css\'s own colours and font, as the custom properties main.js sets', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.deepEqual(plain(r.data.overlays), { 'overlay.phosphor': { name: 'Phosphor', font: 'vt323',
    levels: { ok: ['#39ff6a', '#2fd95a'], warn: ['#ffb000', '#f0a400'], crit: ['#ff4a3d', '#ff6a5e'], info: ['#3fd0ff', '#3fc4f0'], sleep: ['#1c8a3a', '#1c8a3a'] },
    outline: '#000000', scrim: '#000000', caption: { rgb: '#000000', a: 0.66 } } });
  const s = started(), o = s.W.overlay, css = cssFallbacks();
  assert.deepEqual([o.source, o.id, o.name, o.font, plain(o.faults)], ['pack', 'overlay.phosphor', 'Phosphor', 'vt323', []]);
  assert.deepEqual(Object.keys(o.props).sort(), Object.keys(css).sort(), 'every property the overlay sets is read by display.css, and every one it reads is set');
  for (const k of Object.keys(css)) assert.equal(norm(o.props[k]), norm(css[k]), k);
  // the values themselves
  assert.deepEqual(plain(o.props), {
    '--kw-ok': '#39ff6a', '--kw-ok2': '#2fd95a', '--kw-warn': '#ffb000', '--kw-warn2': '#f0a400', '--kw-crit': '#ff4a3d', '--kw-crit2': '#ff6a5e',
    '--kw-info': '#3fd0ff', '--kw-info2': '#3fc4f0', '--kw-sleep': '#1c8a3a', '--kw-sleep2': '#1c8a3a', '--kw-outline': '#000000', '--kw-scrim': '0,0,0',
    '--kw-caption': 'rgba(0,0,0,.66)', '--kw-font': '"VT323", "DejaVu Sans Mono", monospace' });
});

test('display.css reads the overlay only through custom properties: each level, the badge, the outline, the scrim and the caption', () => {
  // the status colours, each level's pair
  for (const l of ['ok', 'warn', 'crit', 'info', 'sleep']) {
    assert.match(CSS, new RegExp('#surface\\.st-' + l + ' +\\{ --fg: var\\(--kw-' + l + ', #[0-9a-f]{6}\\); --fg2: var\\(--kw-' + l + '2, #[0-9a-f]{6}\\); \\}'), l);
  }
  // the badge in the warn and crit colours, the caption's background, the scrim's three stops
  assert.match(CSS, /#more \{[^}]*background: var\(--kw-warn, #ffb000\)/);
  assert.match(CSS, /#more\.crit \{ background: var\(--kw-crit, #ff4a3d\); \}/);
  assert.match(CSS, /#cap \{[^}]*background: var\(--kw-caption, rgba\(0,0,0,\.66\)\)/);
  assert.equal((CSS.match(/rgba\(var\(--kw-scrim, 0,0,0\),/g) || []).length, 5);
  // no colour of the overlay is left written out in the rules it styles
  const ov = CSS.slice(CSS.indexOf('/* ---- The display'));
  const bare = ov.replace(/rgba\(var\(--kw-scrim, 0,0,0\),[.\d]+\)/g, '').replace(/var\(--kw-[a-z0-9]+, (?:[^()]|\([^()]*\))+\)/g, '').replace(/#surface \{[^}]*\}/, '').replace(/#more \{[^}]*\}/, m => m.replace('color: #000;', ''));
  assert.deepEqual(bare.match(/#[0-9a-f]{3,6}\b|rgba?\(/gi), null);
});

test('main.js sets the overlay\'s properties on the display, after the world has started', () => {
  assert.ok(MAIN.indexOf('KW.world.start(KW.packText') < MAIN.indexOf('surface.style.setProperty(k, ovProps[k])'));
  assert.ok(MAIN.includes('const ovProps = KW.world && KW.world.overlay ? KW.world.overlay.props : {};'));
});

test('compileOverlay takes only colours and a font the engine ships, and makes the properties from them', () => {
  const s = sandbox(), r = s.KW.pack.read(TEXT, { allowUnsigned: true }), v = r.data.overlays['overlay.phosphor'];
  const with_ = edit => { const o = JSON.parse(JSON.stringify(v)); edit(o); return { data: { overlays: { x: o } } }; };
  const fails = (edit, reason) => assert.throws(() => s.W.compileOverlay(with_(edit), 'x'), e => e.message === reason);
  fails(o => { o.font = 'comic'; }, 'overlays.x.font: the font "comic" is not built in this engine yet');
  fails(o => { o.levels.ok[0] = 'red;}body{'; }, 'overlays.x.levels.ok[0]: is not a hex colour');
  fails(o => { o.outline = '#000'; }, 'overlays.x.outline: is not a hex colour');
  fails(o => { o.caption = { rgb: '#000000', a: 2 }; }, 'overlays.x.caption: is not a colour');
  fails(o => { delete o.levels.sleep; }, 'overlays.x.levels.sleep: is not two colours');
  assert.throws(() => s.W.compileOverlay({ data: {} }, 'x'), /overlays\.x: the pack has no such overlay/);
  // a caption given as a hex colour, and a scrim of another colour
  const o = s.W.compileOverlay(with_(x => { x.caption = '#102030'; x.scrim = '#0a0b0c'; }), 'x');
  assert.deepEqual([o.props['--kw-caption'], o.props['--kw-scrim']], ['#102030', '10,11,12']);
});

// ---- Where the words and the overlay come from -------------------------------------------------------

test('a dev page takes the words and the overlay from kw.medieval unsigned, and adds no line for them', () => {
  const s = started();
  assert.deepEqual([s.W.words.source, s.W.overlay.source], ['pack', 'pack']);
  assert.deepEqual(s.lines, [['info', 'knightwatcher: the scenes battlement, camp, yard, cellar, smithy, house and court are drawn from the pack kw.medieval 0.7.1, unsigned']]);
});

test('a deployed page refuses kw.medieval unsigned: the collector\'s text and display.css\'s colours, until it is signed', () => {
  const s = sandbox();
  s.W.start([TEXT], false);
  assert.deepEqual(plain(s.W.words), { source: 'code', set: null, name: null, watcher: null, labels: null, quiet: null, captions: null, faults: [] });
  assert.deepEqual(plain(s.W.overlay), { source: 'code', id: null, name: null, font: null, props: {}, faults: [] });
  assert.equal(s.W.quietLine(quiet('4,812', '4,812'), 'ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked'), 'ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked');
  assert.equal(s.W.caption('ip_banned', { addr: '203.0.113.77', jail: 'sshd' }, 'BANNED 203.0.113.77 · sshd'), 'BANNED 203.0.113.77 · sshd');
  // signed with a key it knows
  s.W.start([signedText(TEXT)], false, { keys: keysIn(s) });
  assert.deepEqual([s.W.words.source, s.W.overlay.source], ['pack', 'pack']);
  assert.equal(s.W.caption('ip_banned', { addr: '203.0.113.77', jail: 'sshd' }, 'BANNED 203.0.113.77 · sshd'), 'BANISHED 203.0.113.77 · sshd');
  // and starting again from a refused pack puts the code's back
  s.W.start([TEXT], false);
  assert.deepEqual([s.W.words.source, s.W.overlay.source, Object.keys(s.W.overlay.props).length], ['code', 'code', 0]);
});

test('words or an overlay that fail to compile are the code\'s, each with a line of its own before the scenes\' line', () => {
  const s = sandbox(), lib = s.KW.pack, real = lib.read(TEXT, { allowUnsigned: true });
  const broken = JSON.parse(JSON.stringify(real.data));
  broken.overlays['overlay.phosphor'].font = 'comic';
  broken.words['words.medieval'].quiet.ads = 'not a list';
  s.KW.pack = Object.assign({}, lib, { read: () => Object.assign({}, real, { data: broken }) });
  s.W.start([TEXT], true);
  assert.equal(s.W.words.source, 'code');
  assert.deepEqual(plain(s.W.words.faults), [{ set: 'words.medieval', reason: 'words.words.medieval.quiet.ads: is not a list of templates' }]);
  assert.deepEqual(plain(s.W.overlay.faults), [{ overlay: 'overlay.phosphor', reason: 'overlays.overlay.phosphor.font: the font "comic" is not built in this engine yet' }]);
  assert.deepEqual([s.W.overlay.source, Object.keys(s.W.overlay.props).length], ['code', 0]);
  assert.deepEqual(s.lines, [
    ['warn', 'knightwatcher: the words are the collector\'s: the word set words.medieval could not be compiled: words.words.medieval.quiet.ads: is not a list of templates'],
    ['warn', 'knightwatcher: the overlay is drawn from code: the overlay overlay.phosphor could not be compiled: overlays.overlay.phosphor.font: the font "comic" is not built in this engine yet'],
    ['info', 'knightwatcher: the scenes battlement, camp, yard, cellar, smithy, house and court are drawn from the pack kw.medieval 0.7.1, unsigned']]);
  assert.equal(s.W.quietLine(quiet('4,812', '4,812'), 'OWN'), 'OWN');
});

// ---- The demo -----------------------------------------------------------------------------------------

test('the demo sends the quiet line\'s parts as the collector does, and its quiet_line in the collector\'s words', () => {
  const s = started(), D = s.KW.demo;
  const q = D.quietFor(4812);
  assert.deepEqual(plain(q.parts), [{ k: 'quiet' }, { k: 'up', n: '29' }, { k: 'backup', at: '03:12' }, { k: 'ads', n: '4,812', short: '4,812' }]);
  assert.equal(q.text, 'ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked');
  assert.equal(s.W.quietLine(q.parts, q.text), 'ALL QUIET · 29 up · backup 03:12 · 4,812 ads slain');
  // the collector's short counts, and its line at each
  const at = n => { const x = D.quietFor(n); return [x.parts[3].n, x.parts[3].short, x.text, s.W.quietLine(x.parts, x.text)]; };
  assert.deepEqual(at(9999), ['9,999', '9,999', 'ALL QUIET · 29 up · backup 03:12 · 9,999 ads blocked', 'ALL QUIET · 29 up · backup 03:12 · 9,999 ads slain']);
  assert.deepEqual(at(11283), ['11,283', '11.3k', 'ALL QUIET · 29 up · backup 03:12 · 11.3k ads blocked', 'ALL QUIET · 29 up · backup 03:12 · 11,283 ads slain']);
  assert.deepEqual(at(240512), ['240,512', '240k', 'ALL QUIET · 29 up · backup 03:12 · 240k ads blocked', 'ALL QUIET · 29 up · backup 03:12 · 240,512 ads slain']);
  assert.deepEqual(at(1412345), ['1,412,345', '1.4M', 'ALL QUIET · 29 up · backup 03:12 · 1.4M ads blocked', 'ALL QUIET · 29 up · backup 03:12 · 1.4M ads slain']);
});

test('the demo\'s three events carry the collector\'s text and parts, and show the medieval captions', () => {
  const s = started(), D = s.KW.demo;
  assert.deepEqual(plain(D.EVENTS), {
    goblin: { name: 'IP banned', type: 'ip_banned', text: 'BANNED 203.0.113.77 · sshd', parts: { addr: '203.0.113.77', jail: 'sshd' } },
    crate: { name: 'Import', type: 'import', text: 'IMPORTED · The Night Shift S02E04', parts: { title: 'The Night Shift S02E04' } },
    feast: { name: 'Backup done', type: 'backup_done', text: 'BACKUP DONE 03:12', parts: { at: '03:12' } } });
  assert.deepEqual(['goblin', 'crate', 'feast'].map(D.captionOf), ['BANISHED 203.0.113.77 · sshd', 'DELIVERED · The Night Shift S02E04', 'STORES SAFE 03:12']);
  // the demo's events are types the state file maps to the same acts
  for (const [act, e] of Object.entries(D.EVENTS)) assert.equal(s.KW.state.EVENTS[e.type], act);
  // without the words, as on a deployed page before the signing run, the collector's text
  const d = sandbox();
  d.W.start([TEXT], false);
  assert.deepEqual(['goblin', 'crate', 'feast'].map(d.KW.demo.captionOf), ['BANNED 203.0.113.77 · sshd', 'IMPORTED · The Night Shift S02E04', 'BACKUP DONE 03:12']);
  const q = d.KW.demo.quietFor(4812);
  assert.equal(d.W.quietLine(q.parts, q.text), 'ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked');
});
