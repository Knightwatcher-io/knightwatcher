// Tests for the demo's devices, web/js/demo.js: the default set, the review bar's Devices panel (add
// by kind, name, remove, up and down, the page's limits of places, the set kept in this browser's
// storage and restored, Reset), device_down's words held to the collector's, the Pi added for
// pi_silent, the address's dv= hook and the demo loop taking the set's place, nothing sent anywhere,
// and nothing done once the demo has stopped for live mode. Run with:
// node --test 'tests/web/**/*.test.js'
//
// demo.js runs in a sandbox with the real KW.state, a small stand-in for the document (elements
// that keep their children, attributes, listeners and focus) and stand-ins for the engine, the
// words and the settings. Every name here is invented.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');
const WEB = path.join(ROOT, 'web');
const STATE = fs.readFileSync(path.join(WEB, 'js/state.js'), 'utf8');
const DEMO = fs.readFileSync(path.join(WEB, 'js/demo.js'), 'utf8');
const KEY = 'knightwatcher.demo-devices';
const plain = v => JSON.parse(JSON.stringify(v));

/* ---- A small document -------------------------------------------------------------------------- */
class El {
  constructor(doc, tag) {
    Object.assign(this, { doc, tagName: tag.toUpperCase(), children: [], parent: null, dataset: {}, attrs: {}, listeners: {},
      className: '', id: '', value: '', disabled: false, title: '', own: '', style: {} });
  }
  set textContent(v) { for (const c of this.children) c.parent = null; this.children = []; this.own = String(v); }
  get textContent() { return this.own + this.children.map(c => c.textContent).join(''); }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get classList() { const el = this; return { toggle(c, on) { const s = new Set(el.className.split(' ').filter(Boolean)); if (on) s.add(c); else s.delete(c); el.className = [...s].join(' '); } }; }
  appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); return c; }
  insertBefore(c, ref) { this.appendChild(c); if (ref) { this.children.pop(); this.children.splice(this.children.indexOf(ref), 0, c); } return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t) { for (const f of this.listeners[t] || []) f({ type: t, target: this, stopPropagation() {} }); }
  click() { if (!this.disabled) this.fire('click'); }
  focus() { this.doc.activeElement = this; }
  contains(e) { for (; e; e = e.parent) if (e === this) return true; return false; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  querySelectorAll(sel) {
    const key = /^\[data-key="([^"]*)"\]$/.exec(sel);
    if (key) return this.all().filter(e => e.dataset.key === key[1]);
    if (/^#conds button\[data-id\]$/.test(sel)) return this.doc.byId.conds.children.filter(e => e.dataset.id);
    if (/^[a-z]+$/.test(sel)) return this.all().filter(e => e.tagName === sel.toUpperCase());
    return [];
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function makeDocument() {
  const doc = { activeElement: null, byId: {} };
  const make = (tag, id) => { const e = new El(doc, tag); if (id) { e.id = id; doc.byId[id] = e; } return e; };
  const root = make('html'), body = root.appendChild(make('body')), rv = body.appendChild(make('div', 'rv'));
  for (const id of ['conds', 'evs']) rv.appendChild(make('div', id));
  for (const id of ['demo', 'full', 'hide']) rv.appendChild(make('button', id));
  rv.appendChild(make('details'));
  body.appendChild(make('div', 'surface'));
  Object.assign(doc, { body, documentElement: root, createElement: tag => make(tag), getElementById: id => doc.byId[id] || null,
    querySelectorAll: sel => root.querySelectorAll(sel), querySelector: sel => root.querySelector(sel) });
  return doc;
}

/* A storage like the browser's, over a Map, or one that refuses every call. */
function memoryStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m };
}
const refusing = { getItem() { throw new Error('refused'); }, setItem() { throw new Error('refused'); }, removeItem() { throw new Error('refused'); } };

/* Starts the demo in a sandbox. o: { hash: the address's demo settings, dv: the dv= hook's text,
   storage }. Returns the sandbox's parts and what was sent. */
function start(o = {}) {
  const doc = makeDocument(), sent = [], shown = [];
  const storage = o.storage || memoryStorage(o.seed);
  const engine = { input: null, addFly() {}, startSwat() {}, fireEvent() {}, restartTurns() {} };
  const ctx = {
    console, document: doc, navigator: { sendBeacon: u => { sent.push('beacon ' + u); return true; } },
    history: { replaceState() {} }, performance: { now: () => 0 }, Math, JSON, Set, Map, Object, Array, String, Number,
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1,
    fetch: u => { sent.push('fetch ' + u); return new Promise(() => {}); },
    XMLHttpRequest: function () { sent.push('xhr'); this.open = () => {}; this.send = () => {}; },
    WebSocket: function (u) { sent.push('socket ' + u); },
    EventSource: function (u) { sent.push('events ' + u); }
  };
  ctx.window = ctx;
  // the window's own listeners, and its address's hash, which hashTo changes as a browser does
  const listeners = {};
  ctx.addEventListener = (t, f) => (listeners[t] = listeners[t] || []).push(f);
  ctx.location = { hash: '' };
  Object.defineProperty(ctx, 'localStorage', { get: () => storage });
  vm.createContext(ctx);
  vm.runInContext(STATE, ctx, { filename: 'state.js' });
  const KW = ctx.KW;
  KW.opts = Object.assign({ on: '', is: 'auto', h: 'auto', hs: 'm', bar: '1', demo: '0' }, o.hash || {});
  KW.OPTS = {};
  KW.hooks = { hv: () => undefined, frozen: true, t: 0, dv: o.dv == null ? null : KW.state.listFromHook(o.dv), fixed: new Set() };
  KW.engine = engine;
  KW.ui = { extras: () => ({}), show: t => shown.push(t), quietText() {} };
  KW.world = { join: () => 'ALL QUIET', QUIET_MAX: 52, quietLine: (p, t) => t, caption: (t, p, x) => x };
  vm.runInContext(DEMO, ctx, { filename: 'demo.js' });
  const D = KW.demo;
  D.start();
  const $ = sel => doc.querySelector(sel);
  const key = k => $('[data-key="' + k + '"]');
  return {
    KW, D, doc, storage, sent, engine, $, key,
    placed: () => Array.from(engine.input.devices, d => d.place + ':' + d.kind + (d.ok ? '' : '!')),
    words: () => { const t = shown[shown.length - 1]; return [t.hl, t.sub]; },
    devs: () => doc.documentElement.all().find(e => e.id === 'devs'),
    stored: () => (storage.map && storage.map.has(KEY) ? JSON.parse(storage.map.get(KEY)) : null),
    names: () => Array.from(D.devices(), d => d.kind + ':' + d.name + (d.state === 'down' ? '!' : '')),
    cond: id => doc.byId.conds.children.find(b => b.dataset.id === id),
    clear: () => doc.byId.conds.children.find(b => b.textContent === 'Clear'),
    note: () => doc.documentElement.all().find(e => e.id === 'devs').lastChild.textContent,
    type(i, text) { const input = key('name:' + i); input.value = text; input.fire('input'); return input; },
    hashTo(h) { ctx.location.hash = h; for (const f of listeners.hashchange || []) f(); },
    // which of the review bar's rows show: the Devices row by its id, the rest by their own
    rows: () => doc.byId.rv.children.filter(c => c.style.display !== 'none').map(c => c.id || c.tagName.toLowerCase())
  };
}

// ---- The default set ---------------------------------------------------------------------------

test('the panel offers every kind the page draws, and nothing else', () => {
  // the page's own drawings of the kinds, from props.js in a sandbox of the drawing scripts
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const box = vm.createContext({ window: {}, document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }, console });
  for (const f of ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js']) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const s = start();
  assert.deepEqual(Object.keys(s.D.KINDS).sort(), Object.keys(box.window.KW.props.KINDS).sort());
  assert.deepEqual(Object.keys(s.D.KINDS), ['machine', 'camera', 'vm', 'box', 'pi']);
  assert.deepEqual(Object.values(s.D.KINDS).map(k => k.name), ['NAS', 'Cam', 'VM', 'Router', 'Pi']);
  // one add button for each, in that order
  assert.deepEqual(s.devs().querySelectorAll('button').filter(b => /^add:/.test(b.dataset.key)).map(b => b.textContent), ['Machine', 'Camera', 'VM', 'Other', 'Pi']);
});

test('the demo starts with a NAS, a camera and a router, the Pi absent, in three places', () => {
  const s = start();
  assert.deepEqual(plain(s.D.DEFAULT_SET), [{ kind: 'machine', name: 'NAS' }, { kind: 'camera', name: 'Cam' }, { kind: 'box', name: 'Router' }]);
  assert.deepEqual(s.names(), ['machine:NAS', 'camera:Cam', 'box:Router']);
  assert.deepEqual(s.placed(), ['g1:machine', 'h1:camera', 'g2:box']);
  assert.deepEqual(s.words(), ['', '']);
  // nothing is stored until the visitor changes something
  assert.equal(s.stored(), null);
  // the panel: a chip for each, with its kind, its name and Down not pressed
  const chips = s.devs().children.filter(e => e.className.startsWith('dev'));
  assert.deepEqual(chips.map(c => [c.children[0].textContent, c.children[1].value, c.children[2].getAttribute('aria-pressed')]),
    [['Machine', 'NAS', 'false'], ['Camera', 'Cam', 'false'], ['Other', 'Router', 'false']]);
});

test('device_down from the address names the NAS, which shows down, and the knight looks to it', () => {
  const s = start({ hash: { on: 'device' } });
  assert.deepEqual(s.words(), ['NAS DOWN', 'no answer for 6 min']);
  assert.deepEqual(s.placed(), ['g1:machine!', 'h1:camera', 'g2:box']);
  assert.equal(s.engine.input.w.place, 'g1');
  // shown down for this page alone: nothing stored
  assert.equal(s.stored(), null);
});

test('pi_silent puts the Pi in the pie\'s place, down, and moves nothing else', () => {
  const s = start({ hash: { on: 'pi' } });
  assert.deepEqual(s.placed(), ['pie:pi!', 'g1:machine', 'h1:camera', 'g2:box']);
  assert.deepEqual(s.words(), ['PI SILENT', 'no heartbeat from the Raspberry Pi for 22 min']);
  // the silent Pi raises pi_silent alone, not device_down
  assert.equal(s.KW.opts.on, 'pi_silent');
  // with a Pi of the set's own, that Pi is the silent one, and no second is put in
  s.key('add:pi').click();
  assert.deepEqual(s.placed(), ['g1:machine', 'h1:camera', 'g2:box', 'pie:pi!']);
  s.cond('pi_silent').click();
  assert.deepEqual(s.placed(), ['g1:machine', 'h1:camera', 'g2:box', 'pie:pi']);
});

// ---- The panel ------------------------------------------------------------------------------------

test('a device is added by kind, named after its kind, placed at once and kept', () => {
  const s = start();
  s.key('add:camera').click();
  s.key('add:camera').click();
  s.key('add:vm').click();
  assert.deepEqual(s.names(), ['machine:NAS', 'camera:Cam', 'box:Router', 'camera:Cam 2', 'camera:Cam 3', 'vm:VM']);
  assert.deepEqual(s.placed(), ['g1:machine', 'h1:camera', 'g2:box', 'h2:camera', 'h3:camera', 'g3:vm']);
  assert.deepEqual(plain(s.stored()), { v: 1, list: [
    { kind: 'machine', name: 'NAS', state: 'up' }, { kind: 'camera', name: 'Cam', state: 'up' }, { kind: 'box', name: 'Router', state: 'up' },
    { kind: 'camera', name: 'Cam 2', state: 'up' }, { kind: 'camera', name: 'Cam 3', state: 'up' }, { kind: 'vm', name: 'VM', state: 'up' }] });
  // the focus stays on the add button while it is enabled, and goes to the new name when it is not
  assert.equal(s.doc.activeElement.dataset.key, 'name:5');
});

test('a name is typed in place, cleaned, and kept to the room its kind\'s word leaves in the headline', () => {
  const s = start();
  // the room: 16 characters less the word and a space; the pie's SILENT leaves 9
  assert.deepEqual(['machine', 'camera', 'vm', 'box', 'pi'].map(s.D.nameMax), [11, 11, 11, 11, 9]);
  assert.equal(s.key('name:0').maxLength, 11);
  const input = s.type(0, '  Store\u0007room \n NAS  ');
  assert.equal(s.D.devices()[0].name, 'Store room');
  // the panel is not built again under the caret
  assert.equal(s.key('name:0'), input);
  assert.equal(s.key('remove:0').getAttribute('aria-label'), 'Remove Store room');
  s.type(0, 'A very long name indeed');
  assert.equal(s.D.devices()[0].name, 'A very long');
  // an empty name is the kind's own, shown again when the field is left
  s.type(0, '   ');
  assert.equal(s.D.devices()[0].name, 'NAS');
  input.fire('change');
  assert.equal(input.value, 'NAS');
  s.type(0, 'NAS 2');
  assert.equal(s.stored().list[0].name, 'NAS 2');
  // the headline follows the name while the device is down
  s.key('down:0').click();
  assert.deepEqual(s.words(), ['NAS 2 DOWN', 'no answer for 6 min']);
  s.type(0, 'Archive');
  assert.deepEqual(s.words(), ['ARCHIVE DOWN', 'no answer for 6 min']);
});

test('a device is removed, and the focus goes to the next control left', () => {
  const s = start();
  s.key('remove:1').click();
  assert.deepEqual(s.names(), ['machine:NAS', 'box:Router']);
  assert.deepEqual(s.placed(), ['g1:machine', 'g2:box']);
  assert.equal(s.doc.activeElement.dataset.key, 'remove:1');
  s.key('remove:1').click();
  assert.equal(s.doc.activeElement.dataset.key, 'remove:0');
  s.key('remove:0').click();
  assert.deepEqual(s.names(), []);
  assert.deepEqual(s.placed(), []);
  assert.equal(s.doc.activeElement.dataset.key, 'add:machine');
  assert.deepEqual(plain(s.stored()), { v: 1, list: [] });
  assert.equal(s.note(), 'No devices: add one to see it in the scene.');
});

test('a device set down raises device_down with the collector\'s words, and up again clears it', () => {
  const s = start();
  s.key('down:1').click();
  assert.deepEqual(s.names(), ['machine:NAS', 'camera:Cam!', 'box:Router']);
  assert.equal(s.KW.opts.on, 'device_down');
  assert.equal(s.cond('device_down').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(s.words(), ['CAM DARK', 'no answer for 6 min']);
  assert.equal(s.engine.input.w.place, 'h1');
  assert.equal(s.key('down:1').getAttribute('aria-pressed'), 'true');
  assert.equal(s.doc.activeElement.dataset.key, 'down:1');
  s.key('down:2').click();
  assert.deepEqual(s.words(), ['2 DOWN', 'Cam, Router']);
  assert.deepEqual(s.placed(), ['g1:machine', 'h1:camera!', 'g2:box!']);
  s.key('down:1').click();
  assert.deepEqual(s.words(), ['ROUTER DOWN', 'no answer for 6 min']);
  s.key('down:2').click();
  assert.equal(s.KW.opts.on, '');
  assert.deepEqual(s.words(), ['', '']);
  assert.deepEqual(s.stored().list.map(d => d.state), ['up', 'up', 'up']);
});

test('the conditions\' Device down and Clear follow the set', () => {
  const s = start();
  // on with nothing down: the first device goes down
  s.cond('device_down').click();
  assert.deepEqual(s.names(), ['machine:NAS!', 'camera:Cam', 'box:Router']);
  assert.deepEqual(s.words(), ['NAS DOWN', 'no answer for 6 min']);
  // off: every device up
  s.key('down:2').click();
  s.cond('device_down').click();
  assert.deepEqual(s.names(), ['machine:NAS', 'camera:Cam', 'box:Router']);
  assert.equal(s.KW.opts.on, '');
  // Clear sets every device up with the conditions
  s.key('down:0').click(); s.cond('cpu_hot').click();
  assert.equal(s.KW.opts.on, 'device_down,cpu_hot');
  s.clear().click();
  assert.deepEqual([s.KW.opts.on, s.names().join(' ')], ['', 'machine:NAS camera:Cam box:Router']);
  // with no device at all, Device down says what it needs
  for (let i = 0; i < 3; i++) s.key('remove:0').click();
  s.cond('device_down').click();
  assert.equal(s.KW.opts.on, '');
  assert.equal(s.note(), 'Device down needs a device: add one first.');
});

test('the page\'s limits: one Pi, three cameras high, three other devices on the ground, and the panel says when full', () => {
  const s = start();
  const enabled = () => ['machine', 'camera', 'vm', 'box', 'pi'].filter(k => !s.key('add:' + k).disabled);
  s.key('add:pi').click();
  assert.deepEqual(enabled(), ['machine', 'camera', 'vm', 'box']);
  assert.equal(s.note(), 'Full: the pie\'s place, which holds one Pi.');
  s.key('add:camera').click(); s.key('add:camera').click();
  assert.deepEqual(enabled(), ['machine', 'vm', 'box']);
  assert.equal(s.note(), 'Full: the pie\'s place, which holds one Pi and the three high places for cameras.');
  s.key('add:vm').click();
  assert.deepEqual(enabled(), []);
  assert.equal(s.note(), 'Every place is full: one Pi, three cameras and three other devices are all a scene can show.');
  assert.deepEqual(s.placed(), ['g1:machine', 'h1:camera', 'g2:box', 'pie:pi', 'h2:camera', 'h3:camera', 'g3:vm']);
  // a disabled button does nothing, and the rule is the page's own (KW.state.arrange)
  s.key('add:box').click();
  assert.equal(s.D.devices().length, 7);
  for (const kind of Object.keys(s.D.KINDS)) assert.equal(s.D.fits(s.D.devices(), kind), false);
  // a stored set beyond the limits keeps what has a place, and drops the rest
  const list = ['pi', 'pi', 'camera', 'camera', 'camera', 'camera', 'machine', 'vm', 'box', 'machine', 'toaster'].map((kind, i) => ({ kind, name: 'D' + i, state: 'up' }));
  assert.deepEqual(plain(s.D.readSet(JSON.stringify({ v: 1, list }))).map(d => d.name), ['D0', 'D2', 'D3', 'D4', 'D6', 'D7', 'D8']);
});

test('the set is kept in this browser and restored when the demo starts again', () => {
  const first = start();
  first.key('remove:2').click();
  first.key('add:vm').click();
  first.type(2, 'Build box');
  first.key('down:2').click();
  const again = start({ storage: first.storage });
  assert.deepEqual(again.names(), ['machine:NAS', 'camera:Cam', 'vm:Build box!']);
  // restored down, so device_down is up with it
  assert.deepEqual(again.words(), ['BUILD BOX DOWN', 'no answer for 6 min']);
  assert.equal(again.key('name:2').value, 'Build box');
});

test('a stored text the panel cannot read is ignored, and refused storage changes nothing but keeping', () => {
  for (const text of ['not json', '{"v":2,"list":[]}', '{"v":1}', '[]', 'null']) {
    assert.deepEqual(start({ seed: { [KEY]: text } }).names(), ['machine:NAS', 'camera:Cam', 'box:Router'], text);
  }
  // entries the panel cannot read are dropped one by one
  const s = start({ seed: { [KEY]: JSON.stringify({ v: 1, list: [null, { kind: 'printer', name: 'P' }, { kind: 'camera', name: 7 },
    { kind: 'camera', name: '  Gate\tcam ', state: 'down' }, { kind: 'vm', name: '', state: 'sideways' }, { kind: 'pi', name: 'Pie of the kitchen' }] }) } });
  assert.deepEqual(s.names(), ['camera:Gate cam!', 'vm:VM', 'pi:Pie of th']);
  // refused storage: the default set, and every control still works
  const r = start({ storage: refusing });
  assert.deepEqual(r.names(), ['machine:NAS', 'camera:Cam', 'box:Router']);
  r.key('add:pi').click(); r.key('down:3').click();
  assert.deepEqual(r.words(), ['PI SILENT', 'no answer for 6 min']);
  r.key('reset').click();
  assert.deepEqual(r.names(), ['machine:NAS', 'camera:Cam', 'box:Router']);
});

test('Reset goes back to the default set and forgets the stored one', () => {
  const s = start();
  s.key('remove:0').click(); s.key('add:pi').click(); s.key('down:0').click();
  assert.notEqual(s.stored(), null);
  s.key('reset').click();
  assert.deepEqual(s.names(), ['machine:NAS', 'camera:Cam', 'box:Router']);
  assert.equal(s.stored(), null);
  assert.equal(s.KW.opts.on, '');
  assert.deepEqual(s.placed(), ['g1:machine', 'h1:camera', 'g2:box']);
  assert.equal(s.doc.activeElement.dataset.key, 'reset');
});

test('every change from the panel stops the demo loop, which draws the set every device up', () => {
  const s = start({ hash: { demo: '1' } });
  // the loop's steps without devices of their own draw the set, every device up
  s.D.tick(0);
  assert.deepEqual(s.placed(), ['g1:machine', 'h1:camera', 'g2:box']);
  assert.equal(s.note(), 'The demo loop draws every device up; a change here stops it.');
  // its device_down step brings its own devices, the machine named NAS
  let t = 0; while (s.KW.opts.on !== 'device_down') { t += 60000; s.D.tick(t); }
  assert.deepEqual(s.words(), ['NAS DOWN', 'no answer for 6 min']);
  assert.deepEqual(s.placed(), ['pie:pi', 'h1:camera', 'h2:camera', 'g1:machine!', 'g2:vm', 'g3:box']);
  // its pi_silent step draws the set with the Pi put in
  while (s.KW.opts.on !== 'pi_silent') { t += 60000; s.D.tick(t); }
  assert.deepEqual(s.placed(), ['pie:pi!', 'g1:machine', 'h1:camera', 'g2:box']);
  s.key('down:0').click();
  assert.equal(s.KW.opts.demo, '0');
  assert.deepEqual(s.placed(), ['pie:pi!', 'g1:machine!', 'h1:camera', 'g2:box']);
  assert.equal(s.KW.opts.on, 'pi_silent,device_down');
});

test('the address\'s dv= hook takes the set\'s place: its devices named by kind, the panel shown but disabled', () => {
  const s = start({ dv: 'pi,camera,camera,machine!,vm,x', hash: { on: 'device' } });
  assert.deepEqual(s.placed(), ['pie:pi', 'h1:camera', 'h2:camera', 'g1:machine!', 'g2:vm', 'g3:x']);
  assert.deepEqual(s.words(), ['NAS DOWN', 'no answer for 6 min']);
  assert.ok(s.devs().all().filter(e => e.dataset.key).every(e => e.disabled));
  assert.equal(s.note(), 'The address\'s dv= sets the devices; open the page without it to change them here.');
  // the set is untouched, and device_down stays as the address has it
  assert.deepEqual(s.names(), ['machine:NAS', 'camera:Cam', 'box:Router']);
  assert.equal(s.KW.opts.on, 'device_down');
  // names by kind, numbered where the kind repeats, for the words of several down
  assert.deepEqual(plain(s.D.named(s.KW.state.listFromHook('camera!,camera!,x!,machine-,machine!'))).map(e => e.name), ['Cam', 'Cam 2', 'Router', 'NAS', 'NAS 2']);
  assert.deepEqual(plain(s.D.downWords(s.D.named(s.KW.state.listFromHook('camera!,camera!,x!,machine-,machine!')))), { hl: '4 DOWN', sub: 'Cam, Cam 2, Router, NAS 2' });
});

// ---- Nothing sent, nothing in live mode -----------------------------------------------------------

test('the panel sends nothing anywhere, and demo.js names no way to', () => {
  const s = start({ hash: { on: 'pi,device' } });
  for (const k of ['add:camera', 'add:vm', 'add:pi', 'down:0', 'down:4', 'remove:1', 'reset']) s.key(k).click();
  s.type(0, 'Anything');
  s.cond('device_down').click(); s.clear().click();
  assert.deepEqual(s.sent, []);
  for (const word of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'import(', 'postMessage']) assert.ok(!DEMO.includes(word), word);
});

test('once the demo has stopped for live mode, the panel changes nothing', () => {
  const s = start();
  s.key('add:camera').click();
  const before = JSON.stringify(s.stored()), input = s.engine.input;
  s.D.stop();
  for (const k of ['add:vm', 'down:0', 'remove:1', 'reset']) s.key(k).click();
  s.type(0, 'Live');
  s.cond('device_down').click();
  assert.equal(JSON.stringify(s.stored()), before);
  assert.equal(s.engine.input, input);
  assert.deepEqual(s.names(), ['machine:NAS', 'camera:Cam', 'box:Router', 'camera:Cam 2']);
});

// ---- Held to the collector --------------------------------------------------------------------------

test('device_down\'s words are the collector\'s for the same devices', t => {
  let python;
  try { python = execFileSync('python3', ['--version'], { encoding: 'utf8' }); } catch (e) { python = null; }
  if (!python) { t.skip('python3 is not on the path'); return; }
  const s = start();
  const cases = [[['machine', 'NAS']], [['camera', 'Gate cam']], [['pi', 'Pi']], [['vm', 'Build box']], [['box', 'Router']],
    [['camera', 'Gatehouse camera']], [['pi', 'Pie of the kitchen']], [['machine', 'NAS'], ['camera', 'Gate cam']],
    [['camera', 'Back garden cam 0'], ['camera', 'Back garden cam 1'], ['camera', 'Back garden cam 2'], ['camera', 'Back garden cam 3'], ['camera', 'Back garden cam 4'], ['camera', 'Back garden cam 5']]];
  const script = 'import json, sys\nsys.path.insert(0, sys.argv[1])\nfrom collector import conditions as c, text\n' +
    'out = []\nfor down in json.loads(sys.argv[2]):\n' +
    '    if len(down) > 1: out.append([f"{len(down)} DOWN", c._names([n for k, n in down], text.DETAIL_MAX)])\n' +
    '    else:\n        k, n = down[0]\n        w = c.KIND_WORDS.get(k, c.OTHER_KIND_WORD)\n' +
    '        cut = len(n) > text.HEADLINE_MAX - len(w) - 1\n        out.append([c._named(n, w), f"{n}{text.SEP}no answer for 6 min" if cut else "no answer for 6 min"])\n' +
    'print(json.dumps(out, ensure_ascii=False))';
  const collector = JSON.parse(execFileSync('python3', ['-I', '-c', script, ROOT, JSON.stringify(cases)], { encoding: 'utf8' }));
  const page = cases.map(down => { const w = s.D.downWords(down.map(([kind, name]) => ({ kind, name, state: 'down', alert: true }))); return [w.hl, w.sub]; });
  assert.deepEqual(page, collector);
});

// ---- Under strain in the demo -------------------------------------------------------------------

test('Under strain has four entries of one id, in the collector\'s words, the memory ones bloated', () => {
  const shown = on => { const s = start({ hash: { on } }); return [s.engine.input.w.id, s.engine.input.w.mem, ...s.words()]; };
  assert.deepEqual(shown('cpu'), ['cpu_hot', false, 'HOST CPU 96%', '96% for 9 min · memory 61% · load 14.2']);
  assert.deepEqual(shown('cpu_hot'), shown('cpu'));
  assert.deepEqual(shown('mem'), ['cpu_hot', true, 'NAS MEMORY 93%', '93% for 6 min · CPU 41%']);
  // swap and memory_tight, the older names, show memory under strain
  assert.deepEqual(shown('swap'), shown('mem'));
  assert.deepEqual(shown('memory_tight'), shown('mem'));
  assert.deepEqual(shown('cpumem'), ['cpu_hot', true, 'NAS UNDER STRAIN', 'memory 93% and CPU 97% for 12 min']);
  assert.deepEqual(shown('strained'), ['cpu_hot', true, '3 UNDER STRAIN', 'NAS memory 93%, Host CPU 97%, Buildbox CPU 91%']);
  // two of them given: the first shows, and counts once
  const s = start({ hash: { on: 'cpu,mem' } });
  assert.deepEqual([s.engine.input.w.hl, s.engine.input.w.mem], ['HOST CPU 96%', false]);
  // the headlines are the collector's: at most 16 characters, in capitals
  for (const on of ['cpu', 'mem', 'cpumem', 'strained']) { const [, , hl, sub] = shown(on); assert.ok(hl.length <= 16 && hl === hl.toUpperCase() && sub.length <= 60, on); }
});

test('turning one of Under strain\'s buttons on turns the others off', () => {
  const s = start({ hash: { on: 'attack,cpu_hot' } });
  s.cond('mem').click();
  assert.equal(s.KW.opts.on, 'attack,mem');
  assert.deepEqual([s.cond('cpu_hot').getAttribute('aria-pressed'), s.cond('mem').getAttribute('aria-pressed')], ['false', 'true']);
  s.cond('strained').click();
  assert.equal(s.KW.opts.on, 'attack,strained');
  s.cond('strained').click();
  assert.equal(s.KW.opts.on, 'attack');
  assert.deepEqual(s.doc.byId.conds.children.filter(b => b.dataset.id).map(b => b.textContent).filter(t => t.startsWith('Strain')),
    ['Strain: CPU', 'Strain: memory', 'Strain: both', 'Strain: several']);
});

// ---- bar=dev, for the website's Your devices button --------------------------------------------

test('bar=dev shows the review bar\'s Devices row alone, at load or on a change of the hash', () => {
  const all = ['conds', 'evs', 'demo', 'full', 'hide', 'devs', 'details'];
  const s = start({ hash: { bar: '0', demo: '1' } });
  assert.equal(s.doc.body.className, 'nobar');
  assert.deepEqual(s.rows(), all);
  // the website sets the frame's hash; the demo takes up bar= and keeps the rest
  s.hashTo('#on=&is=auto&bar=dev&demo=1');
  assert.equal(s.KW.opts.bar, 'dev');
  assert.equal(s.doc.body.className, '');
  assert.deepEqual(s.rows(), ['devs']);
  assert.equal(s.KW.opts.demo, '1', 'the demo loop goes on');
  // the row works as ever: a change stops the loop and is kept
  s.key('add:camera').click();
  assert.deepEqual(s.names(), ['machine:NAS', 'camera:Cam', 'box:Router', 'camera:Cam 2']);
  assert.equal(s.KW.opts.demo, '0');
  // bar=0 hides the bar again, and bar=1 shows all of it
  s.hashTo('#bar=0');
  assert.equal(s.doc.body.className, 'nobar');
  s.hashTo('#bar=1');
  assert.equal(s.doc.body.className, '');
  assert.deepEqual(s.rows(), all);
  // a value it does not know, or none, changes nothing
  s.hashTo('#bar=devices');
  s.hashTo('#demo=1');
  assert.equal(s.KW.opts.bar, '1');
  // given at load, as the address
  assert.deepEqual(start({ hash: { bar: 'dev' } }).rows(), ['devs']);
  // nothing once the demo has stopped for live mode
  const live = start({ hash: { bar: '0' } });
  live.D.stop();
  live.hashTo('#bar=dev');
  assert.equal(live.KW.opts.bar, '0');
});
