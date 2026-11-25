// Tests for the page's reading of the state file, web/js/state.js. Run with: node --test tests/web/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ST = require('../../web/js/state.js');

// The example in docs/state.md, so that the contract and the page cannot drift apart unnoticed.
const doc = fs.readFileSync(path.join(__dirname, '../../docs/state.md'), 'utf8');
// The example from the docs, with its interval pinned: the times in these tests are worked out
// for a file written every 30 seconds, whatever interval the docs' example shows.
const BLOCKS = [...doc.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]));
const EXAMPLE = Object.assign(BLOCKS[0], { interval_s: 30 });
// The second example in the docs: a NAS and a camera down, under one device_down.
const DOWN = Object.assign(BLOCKS[1], { interval_s: 30 });
// The fourth: a generic check that holds, acted as cpu_hot.
const CHECK = Object.assign(BLOCKS[3], { interval_s: 30 });
// The fifth: this host under strain, short of memory.
const STRAIN = Object.assign(BLOCKS[4], { interval_s: 30 });
const GEN = Date.parse(EXAMPLE.generated_at);

// A copy of the example with some fields replaced.
const file = over => Object.assign(JSON.parse(JSON.stringify(EXAMPLE)), over);
const cond = (id, level, headline = id.toUpperCase(), detail = 'detail of ' + id) => ({ id, level, since: EXAMPLE.generated_at, headline, detail });
const at = s => GEN + s * 1000;

test('the example in docs/state.md maps to the unhealthy container in the house', () => {
  const v = ST.map(EXAMPLE, at(10));
  assert.equal(v.ok, true);
  assert.equal(v.problem, '');
  assert.deepEqual(v.w, { id: 'container_unhealthy', file: 'container_unhealthy', lv: 3, level: 'warning', st: 'warn', scene: 'house', hl: 'RADARR UNWELL', sub: 'unhealthy for 12 min · restarted twice', mem: false });
  assert.deepEqual(v.more, { n: 0, crit: false });
  assert.equal(v.quietLine, EXAMPLE.quiet_line);
  assert.deepEqual(v.devices, [
    { place: 'pie', kind: 'pi', ok: true, alert: true }, { place: 'g1', kind: 'machine', ok: true, alert: true },
    { place: 'h1', kind: 'camera', ok: true, alert: true }, { place: 'g2', kind: 'machine', ok: false, alert: false }]);
  assert.equal(v.tv, true);
  assert.equal(v.maxSeq, 4411);
  // the ban's text and parts as the docs give them, the parts null while the example has none
  const ban = EXAMPLE.events.find(e => e.seq === 4411);
  assert.deepEqual(v.events, [
    { seq: 4410, type: 'ad_blocked', act: 'flies', count: 3, text: '', parts: null },
    { seq: 4411, type: 'ip_banned', act: 'goblin', count: 1, text: ban.text, parts: ban.parts || null }]);
  assert.match(ban.text, /^BANNED 203\.0\.113\.77 · /);
  assert.deepEqual(v.quietParts, EXAMPLE.quiet_parts || null);
});

test('every id maps to the scene and rank docs/design.md gives it', () => {
  const want = {
    attack: ['battlement', 4], wan_down: ['battlement', 4], container_unhealthy: ['house', 3], disk_full: ['cellar', 3],
    backup_overdue: ['house', 3], pi_silent: ['house', 3], device_down: [null, 3], cpu_hot: ['yard', 3],
    ssh_session: ['court', 2], updating: ['smithy', 2], streaming: ['house', 2], night: ['house', 1] };
  assert.deepEqual(Object.keys(ST.CONDITIONS), Object.keys(want));
  for (const [id, [scene, lv]] of Object.entries(want)) {
    const v = ST.map(file({ conditions: [cond(id, 'warning')] }), at(0));
    assert.equal(v.w.scene, scene, id);
    assert.equal(v.w.lv, lv, id);
  }
});

test('the level sets the colour, and a missing level takes the design\'s', () => {
  const colours = { critical: 'crit', warning: 'warn', work: 'info', quiet: 'ok', sleep: 'sleep' };
  for (const [level, st] of Object.entries(colours)) assert.equal(ST.map(file({ conditions: [cond('cpu_hot', level)] }), at(0)).w.st, st);
  assert.equal(ST.map(file({ conditions: [{ id: 'attack', headline: 'X', detail: '' }] }), at(0)).w.st, 'crit');
  assert.equal(ST.map(file({ conditions: [cond('night', 'toString')] }), at(0)).w.st, 'sleep');
});

test('an unknown id is skipped and the next one is used', () => {
  const v = ST.map(file({ conditions: [cond('volcano', 'critical'), cond('ssh_session', 'work', 'AT COURT', 'admin from 192.0.2.10')] }), at(0));
  assert.equal(v.w.id, 'ssh_session');
  assert.equal(v.w.hl, 'AT COURT');
  assert.equal(v.w.sub, 'admin from 192.0.2.10');
  assert.deepEqual(v.more, { n: 0, crit: false });
});

test('no known condition leaves the quiet line', () => {
  for (const conditions of [[], [cond('volcano', 'critical')], undefined, 'nonsense']) {
    const v = ST.map(file({ conditions, quiet_line: 'ALL QUIET · 12 up' }), at(0));
    assert.equal(v.ok, true);
    assert.equal(v.w, null);
    assert.equal(v.quietLine, 'ALL QUIET · 12 up');
  }
});

test('the badge counts the other conditions at warning or critical', () => {
  const v = ST.map(file({ conditions: [cond('attack', 'critical'), cond('disk_full', 'warning'), cond('ssh_session', 'work'),
    cond('volcano', 'critical'), cond('cpu_hot', 'warning')] }), at(0));
  assert.equal(v.w.id, 'attack');
  assert.deepEqual(v.more, { n: 2, crit: false });
  const w = ST.map(file({ conditions: [cond('ssh_session', 'work'), cond('wan_down', 'critical'), cond('night', 'sleep')] }), at(0));
  assert.equal(w.w.id, 'ssh_session');
  assert.deepEqual(w.more, { n: 1, crit: true });
});

test('a schema other than 1 is refused', () => {
  for (const schema of [2, 0, '1', undefined]) assert.equal(ST.map(file({ schema }), at(0)).problem, 'schema');
});

test('a file older than three intervals is stale', () => {
  assert.equal(ST.map(EXAMPLE, at(90)).ok, true);
  const v = ST.map(EXAMPLE, at(91));
  assert.equal(v.ok, false);
  assert.equal(v.problem, 'stale');
  assert.equal(v.generatedAt, GEN);
  assert.equal(ST.map(file({ interval_s: 5 }), at(16)).problem, 'stale');
  assert.equal(ST.map(EXAMPLE, at(-120)).ok, true);
});

test('a file the page cannot read is malformed', () => {
  for (const f of [null, [], 'text', 7]) assert.equal(ST.map(f, at(0)).problem, 'malformed');
  assert.equal(ST.map(file({ generated_at: 'yesterday' }), at(0)).problem, 'malformed');
  assert.equal(ST.map(file({ interval_s: 0 }), at(0)).problem, 'malformed');
  assert.equal(ST.map(file({ interval_s: '30' }), at(0)).problem, 'malformed');
});

// A copy of the example whose facts.devices is replaced (undefined leaves it out).
const withDevices = (devices, over) => {
  const f = file(over);
  f.facts = Object.assign({}, f.facts);
  if (devices === undefined) delete f.facts.devices; else f.facts.devices = devices;
  return f;
};
const PIE = (ok = true) => [{ place: 'pie', kind: 'pi', ok, alert: true }];
const entry = (kind, state = 'up', alert = true) => ({ name: kind + state, kind, state, alert, seen: true, since: null });
const drawn = list => ST.map(withDevices({ list }), at(0)).devices;

test('without a devices section the pie stands alone, gone while the Pi is down or silent', () => {
  const pi = (p, over) => { const f = withDevices(undefined, over); f.facts.pi = p; return ST.map(f, at(0)).devices; };
  assert.deepEqual(pi({ up: true }), PIE(true));
  assert.deepEqual(pi({ up: false }), PIE(false));
  assert.deepEqual(pi(null), PIE(true));
  assert.deepEqual(pi({ up: true }, { conditions: [cond('attack', 'critical'), cond('pi_silent', 'warning')] }), PIE(false));
  // an older file with neither section, and one with no facts at all
  assert.deepEqual(pi(undefined), PIE(true));
  assert.deepEqual(ST.map(file({ facts: null }), at(0)).devices, PIE(true));
});

test('a devices section of the wrong shape falls back to the pie', () => {
  for (const bad of [null, 'list', 3, [], [{ kind: 'machine', state: 'down' }], { list: null }, { list: 'pi' }, { list: { 0: {} } }, { items: [] }]) {
    const f = withDevices(bad); f.facts.pi = { up: false };
    assert.deepEqual(ST.map(f, at(0)).devices, PIE(false), JSON.stringify(bad));
  }
});

test('with a devices list the pie leaves only when the Pi is judged down, whatever facts.pi says', () => {
  const f1 = withDevices({ list: [entry('pi', 'up')] }); f1.facts.pi = { up: false };
  assert.deepEqual(ST.map(f1, at(0)).devices, PIE(true));
  const f2 = withDevices({ list: [entry('pi', 'down')] }); f2.facts.pi = { up: true };
  assert.deepEqual(ST.map(f2, at(0)).devices, PIE(false));
  // pi_silent no longer empties the dish once there is a list: the list carries the state
  assert.deepEqual(ST.map(withDevices({ list: [entry('pi')] }, { conditions: [cond('pi_silent', 'warning')] }), at(0)).devices, PIE(true));
  assert.deepEqual(drawn([]), []);
});

test('cameras fill the high places and the other devices the ground places, each in the order of the list', () => {
  const places = list => drawn(list).map(t => t.place + ':' + t.kind);
  assert.deepEqual(places([entry('machine'), entry('camera'), entry('pi'), entry('vm'), entry('camera'), entry('box')]),
    ['g1:machine', 'h1:camera', 'pie:pi', 'g2:vm', 'h2:camera', 'g3:box']);
  // six cameras: three are drawn, the rest wait for a high place that never comes
  assert.deepEqual(places(Array.from({ length: 6 }, () => entry('camera'))), ['h1:camera', 'h2:camera', 'h3:camera']);
  // five machines and a camera: three machines on the ground, the camera high whatever its position
  assert.deepEqual(places([entry('machine'), entry('machine'), entry('machine'), entry('machine'), entry('machine'), entry('camera')]),
    ['g1:machine', 'g2:machine', 'g3:machine', 'h1:camera']);
  // kinds the page does not know are devices too, and stand on the ground
  assert.deepEqual(places([entry('printer'), entry('acme.devices/nas'), entry('camera'), entry(''), entry('__proto__')]),
    ['g1:printer', 'g2:acme.devices/nas', 'h1:camera', 'g3:']);
  // only the first pi has a place
  assert.deepEqual(places([entry('pi'), entry('pi'), entry('camera')]), ['pie:pi', 'h1:camera']);
});

test('a place depends only on the list, never on which devices are up', () => {
  const list = [entry('camera'), entry('machine'), entry('camera'), entry('vm'), entry('pi')];
  const where = l => drawn(l).map(t => t.place);
  const before = where(list);
  for (let i = 0; i < list.length; i++) for (const state of ['down', 'unknown', 'mystery']) {
    const l = list.map((e, j) => (j === i ? Object.assign({}, e, { state }) : e));
    assert.deepEqual(where(l), before, `${i} ${state}`);
  }
});

test('an entry the page cannot read takes no place, and the others keep their order', () => {
  const list = [null, 'NAS', entry('machine', 'down'), 7, [], entry('camera', 'up', false), { kind: 'vm' }];
  assert.deepEqual(drawn(list), [
    { place: 'g1', kind: 'machine', ok: false, alert: true }, { place: 'h1', kind: 'camera', ok: true, alert: false },
    { place: 'g2', kind: 'vm', ok: true, alert: false }]);
  // the page reads 32 entries at most
  const long = Array.from({ length: 40 }, () => entry('box')).concat([entry('camera')]);
  assert.deepEqual(drawn(long).map(t => t.place), ['g1', 'g2', 'g3']);
});

test('each field of an entry is read on its own, and only "down" draws a device gone', () => {
  const one = e => drawn([e])[0];
  assert.deepEqual(one({ kind: 'vm', state: 'unknown', alert: true }), { place: 'g1', kind: 'vm', ok: true, alert: true });
  assert.deepEqual(one({ kind: 'vm', state: 'DOWN', alert: 'true' }), { place: 'g1', kind: 'vm', ok: true, alert: false });
  assert.deepEqual(one({ kind: 'vm', alert: 1 }), { place: 'g1', kind: 'vm', ok: true, alert: false });
  assert.deepEqual(one({ state: 'down', alert: true }), { place: 'g1', kind: '', ok: false, alert: true });
  assert.deepEqual(one({ kind: 42, state: 'down' }), { place: 'g1', kind: '', ok: false, alert: false });
  assert.deepEqual(one({ kind: 'k'.repeat(200) }), { place: 'g1', kind: 'k'.repeat(200), ok: true, alert: false });
  assert.deepEqual(one({ kind: 'k'.repeat(201) }), { place: 'g1', kind: '', ok: true, alert: false });
  assert.equal(one({ kind: 'camera', state: 'down' }).place, 'h1');
});

test('device_down from the docs: the quiet scene, the words, and the place the knight looks to', () => {
  const v = ST.map(DOWN, Date.parse(DOWN.generated_at));
  assert.deepEqual(v.w, { id: 'device_down', file: 'device_down', lv: 3, level: 'warning', st: 'warn', scene: null, hl: '2 DOWN', sub: 'NAS, Gate cam', mem: false, place: 'g1' });
  assert.deepEqual(v.devices, [
    { place: 'pie', kind: 'pi', ok: true, alert: true }, { place: 'g1', kind: 'machine', ok: false, alert: true },
    { place: 'h1', kind: 'camera', ok: false, alert: true }, { place: 'g2', kind: 'machine', ok: true, alert: false }]);
  assert.deepEqual(v.more, { n: 0, crit: false });
});

test('the knight looks to the place of the first named device that is drawn, or straight ahead', () => {
  // positions: 0..3 machines (g1, g2, g3, none), 4 unreadable, 5 camera (h1), 6 pi (pie), 7 pi (none)
  const list = [entry('machine'), entry('machine'), entry('machine'), entry('machine'), 'x', entry('camera'), entry('pi'), entry('pi')];
  const place = (devices, l = list) => ST.map(withDevices({ list: l }, { conditions: [Object.assign(cond('device_down', 'warning'), devices === undefined ? {} : { devices })] }), at(0)).w.place;
  assert.equal(place([5, 0]), 'h1');
  assert.equal(place([3, 7, 2]), 'g3');
  assert.equal(place([4, 6]), 'pie');
  assert.equal(place([3]), null);
  assert.equal(place([4]), null);
  assert.equal(place([2.5, -1, '0', null, 1]), 'g2');
  assert.equal(place([40]), null);
  assert.equal(place([]), null);
  assert.equal(place(undefined), null);
  assert.equal(place('0'), null);
  // without a devices list the positions name nothing
  assert.equal(ST.map(withDevices(undefined, { conditions: [Object.assign(cond('device_down', 'warning'), { devices: [0] })] }), at(0)).w.place, null);
});

test('device_down counts once in the badge, and carries no place when it does not win', () => {
  const v = ST.map(file({ conditions: [cond('attack', 'critical'), Object.assign(cond('device_down', 'warning'), { devices: [1, 2, 3] }), cond('cpu_hot', 'warning')] }), at(0));
  assert.equal(v.w.id, 'attack');
  assert.equal('place' in v.w, false);
  assert.deepEqual(v.more, { n: 2, crit: false });
});

test('the dv= hook gives a list in the contract\'s shape, placed by the same rule', () => {
  assert.deepEqual(ST.listFromHook('pi,camera!,machine,vm-,x'), [
    { kind: 'pi', state: 'up', alert: false }, { kind: 'camera', state: 'down', alert: true }, { kind: 'machine', state: 'up', alert: false },
    { kind: 'vm', state: 'down', alert: false }, { kind: 'x', state: 'up', alert: false }]);
  assert.deepEqual(ST.listFromHook('pi,,my-kind,-'), [{ kind: 'pi', state: 'up', alert: false }, null, { kind: 'my-kind', state: 'up', alert: false }, null]);
  assert.deepEqual(ST.listFromHook('camera%21'), [{ kind: 'camera', state: 'down', alert: true }]);
  assert.deepEqual(ST.listFromHook('%zz'), [null]);
  assert.deepEqual(ST.listFromHook('a b,<x>'), [null, null]);
  const r = ST.arrange(ST.listFromHook('camera,pi,machine-,camera!'));
  assert.deepEqual(r.at, ['h1', 'pie', 'g1', 'h2']);
  assert.equal(ST.lookPlace([2, 3], r.at), 'g1');
});

test('a check from the docs is acted as the condition it borrows, with its own words', () => {
  const v = ST.map(CHECK, Date.parse(CHECK.generated_at));
  assert.equal(v.ok, true);
  assert.deepEqual(v.w, { id: 'cpu_hot', file: 'check:nas-temp', lv: 3, level: 'warning', st: 'warn', scene: 'yard', hl: 'NAS HOT', sub: 'disk at 71 C', mem: false });
  assert.deepEqual(v.more, { n: 0, crit: false });
});

test('Under strain from the docs is short of memory: the knight trains in the yard, bloated', () => {
  const v = ST.map(STRAIN, Date.parse(STRAIN.generated_at));
  assert.equal(v.ok, true);
  assert.deepEqual(v.w, { id: 'cpu_hot', file: 'cpu_hot', lv: 3, level: 'warning', st: 'warn', scene: 'yard', hl: 'HOST MEMORY 93%', sub: '93% for 12 min · CPU 41% · load 3.1', mem: true });
});

test('Under strain is bloated while any machine it lists is short of memory', () => {
  const pair = { pct: 93.4, threshold: 90, since: EXAMPLE.generated_at };
  const strain = machines => Object.assign(cond('cpu_hot', 'warning'), machines === undefined ? {} : { machines });
  const mem = machines => ST.map(file({ conditions: [strain(machines)] }), at(0)).w.mem;
  assert.equal(mem([{ name: 'Host', window_s: 30, cpu: pair }]), false);
  assert.equal(mem([{ name: 'Host', window_s: 30, memory: pair }]), true);
  assert.equal(mem([{ name: 'Host', window_s: 30, cpu: pair }, { name: 'NAS', window_s: 30, cpu: pair, memory: pair }]), true);
  // a collector from before, or an entry the page cannot read, trains without the bloat
  for (const bad of [undefined, null, [], 'NAS', [null], [{ name: 'NAS', memory: 'yes' }], { memory: pair }]) assert.equal(mem(bad), false, JSON.stringify(bad));
});

test('memory_tight from a collector from before is Under strain on memory, in cpu_hot\'s scene', () => {
  const v = ST.map(file({ conditions: [cond('memory_tight', 'warning', 'MEMORY TIGHT', '8% available for 30 s')] }), at(0));
  assert.deepEqual(v.w, { id: 'cpu_hot', file: 'memory_tight', lv: 3, level: 'warning', st: 'warn', scene: 'yard', hl: 'MEMORY TIGHT', sub: '8% available for 30 s', mem: true });
  assert.deepEqual(Object.keys(ST.RETIRED), ['memory_tight']);
  assert.equal(ST.CONDITIONS.memory_tight, undefined);
  // with cpu_hot from that collector too, the knight that trains for it is bloated for both
  const both = ST.map(file({ conditions: [cond('cpu_hot', 'warning', 'CPU HOT'), cond('memory_tight', 'warning')] }), at(0));
  assert.deepEqual([both.w.file, both.w.hl, both.w.mem], ['cpu_hot', 'CPU HOT', true]);
  assert.deepEqual(both.more, { n: 1, crit: false });
  const behind = ST.map(file({ conditions: [cond('attack', 'critical'), cond('cpu_hot', 'warning'), cond('memory_tight', 'warning')] }), at(0));
  assert.deepEqual([behind.w.id, behind.w.mem], ['attack', false]);
});

test('a check that borrows Under strain is never bloated, whichever id it borrows', () => {
  const check = (as, over = {}) => Object.assign({ id: 'check:nas-mem', as, level: 'warning', since: EXAMPLE.generated_at, headline: 'NAS MEMORY', detail: '' }, over);
  const pair = { pct: 93.4, threshold: 90, since: EXAMPLE.generated_at };
  for (const c of [check('cpu_hot', { machines: [{ name: 'NAS', window_s: 30, memory: pair }] }), check('memory_tight')]) {
    const v = ST.map(file({ conditions: [c] }), at(0));
    assert.deepEqual([v.w.id, v.w.file, v.w.scene, v.w.mem], ['cpu_hot', 'check:nas-mem', 'yard', false], c.as);
  }
});

test('a check borrows the scene and rank of any condition but device_down', () => {
  const check = (as, over = {}) => Object.assign({ id: 'check:nas', as, level: ST.CONDITIONS[as] ? ST.CONDITIONS[as].level : 'warning', since: EXAMPLE.generated_at, headline: 'NAS', detail: 'its words' }, over);
  for (const [as, k] of Object.entries(ST.CONDITIONS)) {
    const v = ST.map(file({ conditions: [check(as)] }), at(0));
    if (as === 'device_down') { assert.equal(v.w, null, as); continue; }
    assert.deepEqual(v.w, { id: as, file: 'check:nas', lv: k.lv, level: k.level, st: ST.LEVELS[k.level], scene: k.scene, hl: 'NAS', sub: 'its words', mem: false }, as);
  }
  // one the page cannot act is skipped, and the next condition is used
  for (const bad of [check('nas_hot'), check(undefined), check('cpu_hot', { id: 'check:NAS' }), check('cpu_hot', { id: 'check:' + 'x'.repeat(21) }), check('cpu_hot', { id: 'nas' }), check('__proto__')]) {
    const v = ST.map(file({ conditions: [bad, cond('ssh_session', 'work')] }), at(0));
    assert.equal(v.w.id, 'ssh_session', JSON.stringify(bad));
  }
  // its colour is the file's level, as for any condition
  assert.equal(ST.map(file({ conditions: [check('cpu_hot', { level: 'critical' })] }), at(0)).w.st, 'crit');
});

test('a check counts in the badge by its level, and sits where the file puts it', () => {
  const check = (name, as, level) => ({ id: 'check:' + name, as, level, since: EXAMPLE.generated_at, headline: name.toUpperCase(), detail: '' });
  const v = ST.map(file({ conditions: [cond('disk_full', 'warning'), check('raid', 'disk_full', 'warning'), check('ups', 'attack', 'critical'), check('door', 'ssh_session', 'work')] }), at(0));
  assert.equal(v.w.file, 'disk_full');
  assert.deepEqual(v.more, { n: 2, crit: true });
  const first = ST.map(file({ conditions: [check('raid', 'disk_full', 'warning'), cond('cpu_hot', 'warning')] }), at(0));
  assert.deepEqual([first.w.id, first.w.file, first.w.hl], ['disk_full', 'check:raid', 'RAID']);
});

test('a check never reads the facts of the condition it borrows', () => {
  const check = as => ({ id: 'check:x', as, level: ST.CONDITIONS[as].level, since: EXAMPLE.generated_at, headline: 'X', detail: 'its own' });
  // borrowing streaming: no television, no streams badge, and its own detail
  const noStreams = Object.assign({}, EXAMPLE.facts, { streams: { count: 0 } });
  let v = ST.map(file({ facts: noStreams, conditions: [check('streaming')] }), at(0));
  assert.deepEqual([v.w.id, v.w.file, v.w.sub, v.tv], ['streaming', 'check:x', 'its own', false]);
  v = ST.map(file({ facts: noStreams, conditions: [cond('attack', 'critical'), check('streaming')] }), at(0));
  assert.equal(v.streamsBehind, false);
  // borrowing pi_silent: the pie keeps its dish while the Pi answers
  const noDevices = Object.assign({}, EXAMPLE.facts, { devices: undefined, pi: { up: true } });
  v = ST.map(file({ facts: noDevices, conditions: [check('pi_silent')] }), at(0));
  assert.deepEqual(v.devices, [{ place: 'pie', kind: 'pi', ok: true, alert: true }]);
  assert.equal(ST.map(file({ facts: noDevices, conditions: [cond('pi_silent', 'warning')] }), at(0)).devices[0].ok, false);
  // and one borrowing a condition with a place never carries one
  assert.equal('place' in ST.map(file({ conditions: [check('cpu_hot')] }), at(0)).w, false);
});

test('the television is on while something streams', () => {
  const facts = streams => Object.assign({}, EXAMPLE.facts, { streams });
  assert.equal(ST.map(file({ facts: facts({ count: 0, titles: [] }) }), at(0)).tv, false);
  assert.equal(ST.map(file({ facts: facts(null) }), at(0)).tv, false);
  assert.equal(ST.map(file({ facts: facts({ count: 2, titles: [] }) }), at(0)).tv, true);
  assert.equal(ST.map(file({ facts: facts(null), conditions: [cond('streaming', 'quiet')] }), at(0)).tv, true);
});

test('events of an unknown type count towards the highest seq but are not played', () => {
  const v = ST.map(file({ events: [
    { seq: 12, type: 'backup_done', at: EXAMPLE.generated_at, count: 1, text: 'BACKUP DONE · 2.1 GB' },
    { seq: 10, type: 'import', at: EXAMPLE.generated_at, count: 1, text: 'IMPORTED · Example Film' },
    { seq: 13, type: 'eclipse', at: EXAMPLE.generated_at, count: 1, text: '' },
    { seq: 11, type: 'ad_blocked', at: EXAMPLE.generated_at, count: 5000, text: '' },
    { seq: 'x', type: 'ad_blocked', count: 1 }, null] }), at(0));
  assert.equal(v.maxSeq, 13);
  assert.deepEqual(v.events.map(e => [e.seq, e.act, e.count]), [[10, 'crate', 1], [11, 'flies', ST.MAX_FLIES], [12, 'feast', 1]]);
  assert.equal(ST.map(file({ events: [] }), at(0)).maxSeq, null);
});

test('the first file adopts its events without playing them, later ones play what is new', () => {
  const v1 = ST.map(EXAMPLE, at(0));
  let r = ST.takeEvents(v1, null);
  assert.deepEqual(r, { play: [], lastSeq: 4411 });
  r = ST.takeEvents(v1, r.lastSeq);
  assert.deepEqual(r.play, []);
  const v2 = ST.map(file({ events: EXAMPLE.events.concat([
    { seq: 4413, type: 'import', at: EXAMPLE.generated_at, count: 1, text: 'IMPORTED · Example Film' },
    { seq: 4412, type: 'ad_blocked', at: EXAMPLE.generated_at, count: 2, text: '' }]) }), at(0));
  r = ST.takeEvents(v2, r.lastSeq);
  assert.deepEqual(r.play.map(e => e.seq), [4412, 4413]);
  assert.equal(r.lastSeq, 4413);
});

test('a seq that goes backwards is adopted without playing, as a restarted collector', () => {
  const v = ST.map(file({ events: [{ seq: 3, type: 'ip_banned', at: EXAMPLE.generated_at, count: 1, text: 'BANNED 198.51.100.4' }] }), at(0));
  assert.deepEqual(ST.takeEvents(v, 4411), { play: [], lastSeq: 3 });
  const none = ST.map(file({ events: [] }), at(0));
  assert.deepEqual(ST.takeEvents(none, 4411), { play: [], lastSeq: 4411 });
});

test('the quiet line\'s parts and an event\'s parts are read beside the text, as strings, or not at all', () => {
  const parts = [{ k: 'quiet' }, { k: 'up', n: '29' }, { k: 'backup', at: '03:12' }, { k: 'ads', n: '4,812', short: '4,812' }];
  assert.deepEqual(ST.map(file({ quiet_parts: parts }), at(0)).quietParts, parts);
  // a value of another kind, or too long, is left out of its part
  assert.deepEqual(ST.map(file({ quiet_parts: [{ k: 'up', n: 29 }, { k: 'backup', at: 'x'.repeat(201) }] }), at(0)).quietParts, [{ k: 'up' }, { k: 'backup' }]);
  // no parts, or a list the page cannot read: the quiet line as it is
  for (const bad of [undefined, null, 'ALL QUIET', {}, [], [{ n: '29' }], [{ k: '' }], [null], [{ k: 7 }], Array(17).fill({ k: 'quiet' })]) {
    assert.equal(ST.map(file({ quiet_parts: bad }), at(0)).quietParts, null, JSON.stringify(bad));
  }
  const v = ST.map(file({ events: [
    { seq: 1, type: 'ip_banned', at: EXAMPLE.generated_at, count: 1, text: 'BANNED 203.0.113.77 · sshd', parts: { addr: '203.0.113.77', jail: 'sshd' } },
    { seq: 2, type: 'import', at: EXAMPLE.generated_at, count: 1, text: 'IMPORTED · A Film', parts: { title: 'A Film', n: 3 } },
    { seq: 3, type: 'backup_done', at: EXAMPLE.generated_at, count: 1, text: 'BACKUP DONE 03:12', parts: 'at 03:12' },
    { seq: 4, type: 'ip_banned', at: EXAMPLE.generated_at, count: 1, text: 'BANNED 198.51.100.4' }] }), at(0));
  assert.deepEqual(v.events.map(e => [e.type, e.act, e.parts]), [
    ['ip_banned', 'goblin', { addr: '203.0.113.77', jail: 'sshd' }], ['import', 'crate', { title: 'A Film' }], ['backup_done', 'feast', null], ['ip_banned', 'goblin', null]]);
});

test('no signal keeps the knight\'s state under a red headline', () => {
  const w = ST.map(EXAMPLE, at(0)).w, n = ST.noSignal(w, 7 * 60 + 59);
  assert.equal(n.id, 'container_unhealthy');
  assert.equal(n.scene, 'house');
  assert.equal(n.st, 'crit');
  assert.equal(n.hl, 'NO SIGNAL');
  assert.equal(n.sub, 'collector silent for 7 min');
  assert.equal(w.hl, 'RADARR UNWELL');
  assert.equal(ST.noSignal(null, 30).id, 'idle');
  assert.equal(ST.noSignal(null, -30).sub, 'collector silent for 0 min');
});

test('a valid view carries the interval it was written at', () => {
  assert.equal(ST.map(EXAMPLE, at(0)).intervalS, 30);
  assert.equal(ST.map(file({ interval_s: 12.5 }), at(0)).intervalS, 12.5);
});

test('a valid file is shown, and before the first one the page runs the demo', () => {
  const good = ST.map(EXAMPLE, at(0));
  assert.deepEqual(ST.judge(good, null, at(0)), { kind: 'live', ageS: 0 });
  assert.equal(ST.judge(ST.map(EXAMPLE, at(20)), good, at(20)).kind, 'live');
  for (const v of [{ ok: false, problem: 'unreachable', generatedAt: null }, ST.map(EXAMPLE, at(91)), ST.map(file({ schema: 2 }), at(0)), ST.map(null, at(0))]) {
    assert.deepEqual(ST.judge(v, null, at(0)), { kind: 'demo', ageS: null });
  }
});

test('a failed or unreadable fetch keeps the last valid state while that file is young enough', () => {
  const good = ST.map(EXAMPLE, at(0)), failed = { ok: false, problem: 'unreachable', generatedAt: null };
  assert.deepEqual(ST.judge(failed, good, at(5)), { kind: 'hold', ageS: 5 });
  assert.deepEqual(ST.judge(failed, good, at(90)), { kind: 'hold', ageS: 90 });
  assert.deepEqual(ST.judge(ST.map(file({ generated_at: 'soon' }), at(30)), good, at(30)), { kind: 'hold', ageS: 30 });
});

test('a failed fetch shows NO SIGNAL once the last valid file is older than three of its intervals', () => {
  const failed = { ok: false, problem: 'unreachable', generatedAt: null };
  assert.deepEqual(ST.judge(failed, ST.map(EXAMPLE, at(0)), at(91)), { kind: 'silent', ageS: 91 });
  const slow = ST.map(file({ interval_s: 300 }), at(0));
  assert.equal(ST.judge(failed, slow, at(899)).kind, 'hold');
  assert.deepEqual(ST.judge(failed, slow, at(901)), { kind: 'silent', ageS: 901 });
});

test('a stale file or an unknown schema shows NO SIGNAL at once', () => {
  const good = ST.map(EXAMPLE, at(0));
  assert.deepEqual(ST.judge(ST.map(file({ schema: 2 }), at(10)), good, at(10)), { kind: 'silent', ageS: 10 });
  // a stale file older than the last valid one: the age is the last valid file's
  const old = ST.map(file({ generated_at: new Date(GEN - 600e3).toISOString() }), at(10));
  assert.equal(old.problem, 'stale');
  assert.deepEqual(ST.judge(old, good, at(10)), { kind: 'silent', ageS: 10 });
  // the same file grown stale: its own age
  assert.deepEqual(ST.judge(ST.map(EXAMPLE, at(120)), good, at(120)), { kind: 'silent', ageS: 120 });
});

test('version.json names a version only as a plain string', () => {
  assert.equal(ST.versionOf({ version: 'd73439586760' }), 'd73439586760');
  for (const f of [null, [], 'd73439586760', {}, { version: 7 }, { version: '' }, { version: 'a b' }, { version: '<html>' }, { version: 'x'.repeat(65) }]) {
    assert.equal(ST.versionOf(f), null, JSON.stringify(f));
  }
});

test('a deployed page reloads when the deployed version differs from its own', () => {
  const now = 1e12;
  assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'bbbbbbbbbbbb', null, now), true);
  assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'aaaaaaaaaaaa', null, now), false);
  // a failed or malformed fetch does nothing
  for (const fetched of [null, undefined, '', 7, 'a b']) assert.equal(ST.reloadDue('aaaaaaaaaaaa', fetched, null, now), false);
});

test('the repository\'s own page never reloads', () => {
  const now = 1e12;
  for (const own of ['dev', '', null, undefined]) assert.equal(ST.reloadDue(own, 'bbbbbbbbbbbb', null, now), false, String(own));
  assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'dev', null, now), false);
});

test('a reload for one version holds back another for 30 minutes', () => {
  const now = 1e12, G = ST.RELOAD_GUARD_MS, mark = at => ({ version: 'bbbbbbbbbbbb', at });
  assert.equal(G, 30 * 60 * 1000);
  // reloaded for this version and still not on it: wait out the 30 minutes
  assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'bbbbbbbbbbbb', mark(now), now), false);
  assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'bbbbbbbbbbbb', mark(now - G + 1), now), false);
  assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'bbbbbbbbbbbb', mark(now - G), now), true);
  // a mark for another version holds nothing back
  assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'cccccccccccc', mark(now), now), true);
  // a mark from the future, as after the clock was set back, holds nothing back
  assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'bbbbbbbbbbbb', mark(now + 60e3), now), true);
  // a mark that cannot be read holds nothing back
  for (const last of ['junk', 7, [], { version: 'bbbbbbbbbbbb' }, { version: 'bbbbbbbbbbbb', at: 'now' }]) {
    assert.equal(ST.reloadDue('aaaaaaaaaaaa', 'bbbbbbbbbbbb', last, now), true, JSON.stringify(last));
  }
  // once on the new version, nothing to do whatever the mark says
  assert.equal(ST.reloadDue('bbbbbbbbbbbb', 'bbbbbbbbbbbb', mark(now), now), false);
});

// ---- The usage counts and the display's id ----------------------------------------------------

test('the file says whether the usage counts are on, and a file that does not say gives null', () => {
  assert.equal(ST.map(file({ analytics: { on: true } }), at(10)).analytics, true);
  assert.equal(ST.map(file({ analytics: { on: false } }), at(10)).analytics, false);
  for (const bad of [undefined, null, true, 'on', {}, { on: 'yes' }, { on: 1 }, [true]]) {
    const f = file({}); if (bad !== undefined) f.analytics = bad; else delete f.analytics;
    assert.equal(ST.map(f, at(10)).analytics, null, JSON.stringify(bad));
  }
});

/* A storage like the browser's; get or set may throw, and storage() itself may throw. */
function idStorage(held, o = {}) {
  const m = new Map(held === undefined ? [] : [[ST.DISPLAY_KEY, held]]);
  const st = { getItem: k => { if (o.getThrows) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (o.setThrows) throw new Error('QuotaExceededError'); m.set(k, v); } };
  return { m, get: () => { if (o.none) throw new Error('SecurityError'); return st; } };
}
const bytes = n => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);

test('a display makes its id once, 32 lowercase hex characters, and keeps it in its storage', () => {
  const s = idStorage();
  const id = ST.displayId(s.get, bytes);
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(id, Array.from(bytes(16), b => b.toString(16).padStart(2, '0')).join(''));
  assert.equal(s.m.get(ST.DISPLAY_KEY), id);
  // the next load finds it and makes none
  assert.equal(ST.displayId(s.get, () => { throw new Error('not called'); }), id);
  // a stored value of another form is replaced
  for (const held of ['', 'ABCDEF0123456789ABCDEF0123456789', 'a'.repeat(31), 'Robin']) {
    const t = idStorage(held), got = ST.displayId(t.get, bytes);
    assert.match(got, /^[0-9a-f]{32}$/); assert.equal(t.m.get(ST.DISPLAY_KEY), got, held);
  }
});

test('with no storage, or one that refuses, a display makes a fresh id each load', () => {
  let n = 0;
  const rnd = k => Uint8Array.from({ length: k }, () => n++ & 255);
  for (const o of [{ none: true }, { getThrows: true }, { setThrows: true }]) {
    const s = idStorage(undefined, o), a = ST.displayId(s.get, rnd), b = ST.displayId(s.get, rnd);
    assert.match(a, /^[0-9a-f]{32}$/); assert.match(b, /^[0-9a-f]{32}$/);
    assert.notEqual(a, b, JSON.stringify(o));
  }
  // a random source that fails still gives an id
  assert.match(ST.displayId(idStorage().get, () => { throw new Error('no crypto'); }), /^[0-9a-f]{32}$/);
});

test('the page posts its id to api/displays at load and every 30 minutes, and a failed post changes nothing', async () => {
  const posts = [], timers = [];
  const id = ST.reportDisplay({ storage: idStorage().get, random: bytes, every: (f, ms) => timers.push([f, ms]),
    fetch: (url, init) => { posts.push([url, init]); return Promise.reject(new Error('offline')); } });
  assert.equal(ST.DISPLAY_EVERY_MS, 30 * 60 * 1000);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0], ['api/displays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), cache: 'no-store' }]);
  assert.equal(timers.length, 1); assert.equal(timers[0][1], ST.DISPLAY_EVERY_MS);
  timers[0][0]();
  assert.equal(posts.length, 2); assert.equal(posts[1][1].body, posts[0][1].body);
  // the body holds the id alone, well inside the server's 256 bytes
  assert.deepEqual(Object.keys(JSON.parse(posts[0][1].body)), ['id']);
  // a fetch that throws at once is swallowed as well
  assert.doesNotThrow(() => ST.reportDisplay({ storage: idStorage().get, random: bytes, every: () => {}, fetch: () => { throw new Error('refused'); } }));
  await new Promise(r => setTimeout(r, 0));
});
