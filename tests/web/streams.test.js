// Tests for the streams on the page: the detail line that takes each stream in turn by the clock,
// its words held to the collector's streams.line(), the fallback to the collector's detail, the
// badge while a higher condition hides streaming, and the demo's invented streams. Every name and
// title here is invented. Run with: node --test tests/web/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ST = require('../../web/js/state.js');

const ROOT = path.join(__dirname, '../..');
const GEN = Date.parse('2026-01-15T21:42:10Z');
const plain = v => JSON.parse(JSON.stringify(v));
const len = s => Array.from(s).length;

/* A valid state file with these conditions and this streams section. */
const cond = (id, level, headline = id.toUpperCase(), detail = 'detail of ' + id) => ({ id, level, since: '2026-01-15T21:40:00Z', headline, detail });
function file(conditions, streams) {
  return { schema: 1, generated_at: '2026-01-15T21:42:10Z', interval_s: 10, conditions, quiet_line: 'ALL QUIET', events: [],
    facts: streams === undefined ? {} : { streams }, sources: {}, defaults: { look: {}, display: {}, quiet: {}, scenes: {} } };
}
const THREE = {
  count: 3,
  titles: ['The Lantern Keepers S01E03', 'Harbour of Glass', 'Fen Owls - Low Tide'],
  sessions: [{ who: 'Robin', title: 'The Lantern Keepers S01E03' }, { who: 'Sam', title: 'Harbour of Glass' }, { who: 'Alex', title: 'Fen Owls - Low Tide' }] };
const STREAMING = cond('streaming', 'quiet', 'STREAMING', 'Robin · The Lantern Keepers S01E03 · 1 of 3');

test('the line takes each stream in turn, eight seconds each, by the clock alone', () => {
  const v = ST.streamsOf(THREE), line = t => ST.streamWords(v, t).line;
  assert.equal(ST.STREAM_MS, 8000);
  assert.equal(line(0), 'Robin · The Lantern Keepers S01E03 · 1 of 3');
  assert.equal(line(2300), 'Robin · The Lantern Keepers S01E03 · 1 of 3');
  assert.equal(line(7999), 'Robin · The Lantern Keepers S01E03 · 1 of 3');
  assert.equal(line(8000), 'Sam · Harbour of Glass · 2 of 3');
  assert.equal(line(10300), 'Sam · Harbour of Glass · 2 of 3');
  assert.equal(line(16000), 'Alex · Fen Owls - Low Tide · 3 of 3');
  assert.equal(line(24000), line(0));
  // the wall clock, as a display shows it: the same moment gives the same stream on every display
  const now = Date.UTC(2026, 0, 15, 21, 42, 12);
  assert.equal(line(now), ['Robin · The Lantern Keepers S01E03 · 1 of 3', 'Sam · Harbour of Glass · 2 of 3', 'Alex · Fen Owls - Low Tide · 3 of 3'][Math.floor(now / 8000) % 3]);
  // a time before the epoch still picks a stream
  assert.equal(line(-1), 'Alex · Fen Owls - Low Tide · 3 of 3');
  // the order is the collector's, whatever the count says
  assert.equal(ST.streamWords(ST.streamsOf(Object.assign({}, THREE, { count: 5 })), 8000).line, 'Sam · Harbour of Glass · 2 of 3');
});

test('one stream has no "1 of 1", and a stream without a name or a title shows what it has', () => {
  const one = s => ST.streamWords(ST.streamsOf({ count: 1, sessions: [s] }), 9000).line;
  assert.equal(one({ who: 'Robin', title: 'Harbour of Glass' }), 'Robin · Harbour of Glass');
  assert.equal(one({ title: 'Harbour of Glass' }), 'Harbour of Glass');
  assert.equal(one({ who: 'Sam' }), 'Sam');
  const two = ST.streamsOf({ count: 2, sessions: [{ title: 'Harbour of Glass' }, { who: 'Sam' }] });
  assert.equal(ST.streamWords(two, 0).line, 'Harbour of Glass · 1 of 2');
  assert.equal(ST.streamWords(two, 8000).line, 'Sam · 2 of 2');
});

test('the title gives way, and the name, cut at 16, and the count survive within 60', () => {
  const title = 'An Extraordinarily Long Film Title: The Sequel to the Sequel';
  const at = (sessions, t = 0) => ST.streamWords(ST.streamsOf({ count: sessions.length, sessions }), t).line;
  const cut = at([{ who: 'Robin', title }, { who: 'Sam', title }, { who: 'Alex', title }], 8000);
  assert.equal(cut, 'Sam · An Extraordinarily Long Film Title: The Sequ… · 2 of 3');
  assert.equal(len(cut), 60);
  const twelve = Array.from({ length: 12 }, () => ({ who: 'A Name Far Too Long', title }));
  const far = at(twelve, 11 * 8000);
  assert.ok(far.startsWith('A Name Far Too… · An Extraordinarily'), far);
  assert.ok(far.endsWith('… · 12 of 12'), far);
  assert.equal(len(far), 60);
  const alone = at([{ title: title + ' and More' }]);
  assert.equal(len(alone), 60);
  assert.ok(alone.endsWith('…'));
  // characters are counted as the collector counts them, by code point
  const wide = at([{ who: 'Robin', title: '🎬'.repeat(70) }]);
  assert.equal(len(wide), 60);
});

test('the page words the streams as the collector does', t => {
  let python;
  try { python = execFileSync('python3', ['--version'], { encoding: 'utf8' }); } catch (e) { python = null; }
  if (!python) { t.skip('python3 is not on the path'); return; }
  const title = 'An Extraordinarily Long Film Title: The Sequel to the Sequel';
  const cases = [
    [{ who: 'Robin', title: 'The Lantern Keepers S01E03' }, 1, 3], [{ who: 'Robin', title: 'Harbour of Glass' }, 1, 1],
    [{ title: 'Harbour of Glass' }, 2, 3], [{ who: 'Sam' }, 2, 2], [{ who: 'Robin', title }, 2, 3],
    [{ who: 'A Name Far Too Long', title }, 12, 12], [{ title: title + ' and More' }, 1, 1], [{ who: 'Alex', title: '🎬'.repeat(70) }, 3, 4],
    [{ who: 'Sam', title: 'x'.repeat(44) }, 30, 32]];
  const script = 'import json, sys\nsys.path.insert(0, sys.argv[1])\nfrom collector.sources.streams import line\n' +
    'print(json.dumps([line(s, i, n) for s, i, n in json.loads(sys.argv[2])], ensure_ascii=False))';
  const collector = JSON.parse(execFileSync('python3', ['-I', '-c', script, ROOT, JSON.stringify(cases)], { encoding: 'utf8' }));
  const page = cases.map(([s, i, n]) => {
    const sessions = Array.from({ length: n }, () => ({ title: 'other' }));
    sessions[i - 1] = s;
    return ST.streamWords(ST.streamsOf({ count: n, sessions }), (i - 1) * 8000).line;
  });
  assert.deepEqual(page, collector);
});

test('the sessions are read as strings, and a session with nothing to show is passed over', () => {
  assert.equal(ST.streamsOf(null), null);
  assert.equal(ST.streamsOf('3'), null);
  assert.deepEqual(plain(ST.streamsOf({ count: 2 })), { n: 2, sessions: null });
  assert.deepEqual(plain(ST.streamsOf({ count: '2', sessions: [] })), { n: null, sessions: null });
  assert.deepEqual(plain(ST.streamsOf({ count: 1.5 })), { n: null, sessions: null });
  assert.deepEqual(plain(ST.streamsOf({ count: 4, sessions: [{ who: 3, title: 'Harbour  of\nGlass' }, null, 'Sam', {}, { who: ' ' }, { who: 'Sam', device: 'TV' }] })),
    { n: 4, sessions: [{ who: '', title: 'Harbour of Glass' }, { who: 'Sam', title: '' }] });
  assert.deepEqual(plain(ST.streamsOf({ count: 1, sessions: 'Robin' })), { n: 1, sessions: null });
  // at most 32 sessions are read
  const many = ST.streamsOf({ count: 40, sessions: Array.from({ length: 40 }, (_, i) => ({ title: 'Title ' + i })) });
  assert.equal(many.sessions.length, 32);
});

test('without sessions the page shows the collector\'s detail: an older collector, the setting count, no streams section', () => {
  // the view keeps the collector's detail as the condition's, and gives no line of its own
  for (const streams of [undefined, null, { count: 3 }, { count: 3, titles: THREE.titles }]) {
    const v = ST.map(file([cond('streaming', 'quiet', 'STREAMING', '3 streams')], streams), GEN);
    assert.equal(v.w.sub, '3 streams');
    assert.equal(ST.streamWords(v.streams, 0).line, null, JSON.stringify(streams));
  }
  // with sessions the line is the page's, and the detail stays the collector's beside it
  const v = ST.map(file([STREAMING], THREE), GEN);
  assert.equal(v.w.sub, STREAMING.detail);
  assert.deepEqual(plain(v.streams), { n: 3, sessions: THREE.sessions });
  assert.equal(ST.streamWords(v.streams, 8000).line, 'Sam · Harbour of Glass · 2 of 3');
});

test('the badge shows while streaming is up behind a higher condition, and counts the streams in every mode', () => {
  const behind = (conds, streams) => ST.map(file(conds, streams), GEN).streamsBehind;
  assert.equal(behind([cond('disk_full', 'warning'), STREAMING], THREE), true);
  assert.equal(behind([cond('ssh_session', 'work'), STREAMING], THREE), true);
  assert.equal(behind([cond('attack', 'critical'), cond('cpu_hot', 'warning'), STREAMING], { count: 2 }), true);
  // streaming shown, or not up, or with only an id the page does not know above it
  assert.equal(behind([STREAMING], THREE), false);
  assert.equal(behind([cond('streaming_soon', 'warning'), STREAMING], THREE), false);
  assert.equal(behind([cond('disk_full', 'warning')], THREE), false);
  assert.equal(behind([], THREE), false);
  // +N MORE counts the warnings and the critical alone; streaming has its own badge
  const v = ST.map(file([cond('disk_full', 'warning'), cond('cpu_hot', 'warning'), STREAMING], THREE), GEN);
  assert.deepEqual(v.more, { n: 1, crit: false });
  assert.equal(v.streamsBehind, true);
  // the badge's words: the count in every mode of the collector's setting show
  const badge = streams => ST.streamWords(ST.streamsOf(streams), 0).badge;
  assert.equal(badge(THREE), '3 STREAMING');
  assert.equal(badge({ count: 2, titles: ['Harbour of Glass'], sessions: [{ title: 'Harbour of Glass' }] }), '2 STREAMING');
  assert.equal(badge({ count: 2 }), '2 STREAMING');
  assert.equal(badge({ count: 1 }), '1 STREAMING');
  // a count the page cannot read, none at all, or nothing playing while the condition is held
  assert.equal(badge({ count: 'two' }), 'STREAMING');
  assert.equal(ST.streamWords(null, 0).badge, 'STREAMING');
  assert.equal(badge({ count: 0 }), 'STREAMING');
});

test('main.js writes the streams\' words with textContent, from KW.state.streamWords alone', () => {
  const MAIN = fs.readFileSync(path.join(ROOT, 'web/js/main.js'), 'utf8');
  assert.ok(MAIN.includes("ST.streamWords(t.streams, streamClock()).line || t.sub"));
  assert.ok(MAIN.includes('sub.textContent = subOf(t)'));
  assert.ok(MAIN.includes('streamsEl.textContent = ST.streamWords(t.streams || null, 0).badge'));
  assert.ok(MAIN.includes("const streamClock = () => (freeze ? KW.hooks.t : Date.now());"));
  assert.ok(/<span id="more"><\/span><span id="streams"><\/span>/.test(fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8')));
  // the badge is muted: outlined in a colour of the overlay, never filled like +N MORE
  const CSS = fs.readFileSync(path.join(ROOT, 'web/css/display.css'), 'utf8');
  const rule = (/#streams \{([^}]*)\}/.exec(CSS) || [])[1];
  assert.ok(rule && !/background/.test(rule), 'no fill');
  assert.match(rule, /color: var\(--kw-sleep2, #1c8a3a\)/);
  assert.match(rule, /font-size: calc\(var\(--hs\) \* [.\d]+cqh\)/, 'sized with the headline');
});

test('the demo\'s invented streams, as the collector would send them in each mode', () => {
  const box = vm.createContext({ window: { KW: { state: ST } } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'web/js/demo.js'), 'utf8'), box, { filename: 'js/demo.js' });
  const D = box.window.KW.demo;
  assert.deepEqual(plain(D.STREAMS).map(s => s.who), ['Robin', 'Sam', 'Alex']);
  assert.deepEqual(plain(D.streamsFor(3, 'names')), THREE);
  assert.deepEqual(plain(D.streamsFor(2, 'titles')), { count: 2, titles: THREE.titles.slice(0, 2), sessions: [{ title: THREE.titles[0] }, { title: THREE.titles[1] }] });
  assert.deepEqual(plain(D.streamsFor(3, 'count')), { count: 3 });
  // the detail the collector would write, which a page shows without sessions
  assert.equal(D.detailFor(D.streamsFor(3, 'names')), 'Robin · The Lantern Keepers S01E03 · 1 of 3');
  assert.equal(D.detailFor(D.streamsFor(1, 'names')), 'Robin · The Lantern Keepers S01E03');
  assert.equal(D.detailFor(D.streamsFor(3, 'titles')), 'The Lantern Keepers S01E03 · 1 of 3');
  assert.equal(D.detailFor(D.streamsFor(3, 'count')), '3 streams');
  assert.equal(D.detailFor(D.streamsFor(1, 'count')), '1 stream');
  // and its headline is the collector's
  const demo = fs.readFileSync(path.join(ROOT, 'web/js/demo.js'), 'utf8');
  assert.match(demo, /id: 'streaming', +alias: 'plex', +name: '[^']+', hl: 'STREAMING'/);
  assert.ok(!/NOW SHOWING|direct play/.test(demo));
});
