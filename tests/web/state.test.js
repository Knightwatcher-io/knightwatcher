// Tests for the page's reading of the state file, web/js/state.js. Run with: node --test tests/web/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ST = require('../../web/js/state.js');

// The example in docs/state.md, so that the contract and the page cannot drift apart unnoticed.
const doc = fs.readFileSync(path.join(__dirname, '../../docs/state.md'), 'utf8');
const EXAMPLE = JSON.parse(doc.match(/```json\n([\s\S]*?)\n```/)[1]);
const GEN = Date.parse(EXAMPLE.generated_at);

// A copy of the example with some fields replaced.
const file = over => Object.assign(JSON.parse(JSON.stringify(EXAMPLE)), over);
const cond = (id, level, headline = id.toUpperCase(), detail = 'detail of ' + id) => ({ id, level, since: EXAMPLE.generated_at, headline, detail });
const at = s => GEN + s * 1000;

test('the example in docs/state.md maps to the unhealthy container in the house', () => {
  const v = ST.map(EXAMPLE, at(10));
  assert.equal(v.ok, true);
  assert.equal(v.problem, '');
  assert.deepEqual(v.w, { id: 'container_unhealthy', lv: 3, level: 'warning', st: 'warn', scene: 'house', hl: 'RADARR UNWELL', sub: 'unhealthy for 12 min · restarted twice' });
  assert.deepEqual(v.more, { n: 0, crit: false });
  assert.equal(v.quietLine, EXAMPLE.quiet_line);
  assert.equal(v.piOK, true);
  assert.equal(v.tv, true);
  assert.equal(v.maxSeq, 4411);
  assert.deepEqual(v.events, [
    { seq: 4410, act: 'flies', count: 3, text: '' },
    { seq: 4411, act: 'goblin', count: 1, text: 'BANNED 203.0.113.77 · 6 probes for /.env' }]);
});

test('every id maps to the scene and rank docs/design.md gives it', () => {
  const want = {
    attack: ['battlement', 4], wan_down: ['battlement', 4], container_unhealthy: ['house', 3], disk_full: ['cellar', 3],
    backup_overdue: ['house', 3], pi_silent: ['house', 3], cpu_hot: ['yard', 3], memory_tight: [null, 3],
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

test('the pie goes when the Pi is down or silent', () => {
  const facts = pi => Object.assign({}, EXAMPLE.facts, { pi });
  assert.equal(ST.map(file({ facts: facts({ up: false }) }), at(0)).piOK, false);
  assert.equal(ST.map(file({ facts: facts(null) }), at(0)).piOK, true);
  assert.equal(ST.map(file({ facts: null }), at(0)).piOK, true);
  assert.equal(ST.map(file({ conditions: [cond('attack', 'critical'), cond('pi_silent', 'warning')] }), at(0)).piOK, false);
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
