/* Knightwatcher: the engine. Each frame it chooses the scene, walks the knight between the scene's
   spots, plays the swat and the events, and draws everything in order. What it shows comes from
   KW.engine.input, which the demo (demo.js) or the state file (main.js) sets:
     w       the condition that wins, as KW.state makes it: { id, lv, st, scene, hl, sub, mem }, mem
             whether Under strain (cpu_hot) is short of memory, which bloats the knight
     is      'auto' for the quiet scenes to take turns, or the name of the one to keep
     turns   the quiet scenes that take turns, in that order; all five (TURNS) when it is left out
             or empty
     turnMs  how long each quiet scene lasts while they take turns
     devices  the devices standing in the scene's places, as KW.state.map() gives them:
             { place, kind, ok, alert }, place naming one of the scene's places
     tv      whether the television in the house is on
     helmet  'auto' (off indoors), 'on' or 'off'
     patron  the patron at court, the monarch: { id, skin, hair, robe }. id is 'a', 'b' or 'c',
             or another world's patron by its long name, 'a' when it is left out; skin is { id, face, cheek } from one of the base pack's skin
             swatches, or null for the skin the court draws by default; hair is { id, bands, brow }
             from one of its hair swatches, or null for the hair each monarch is drawn with; robe
             is { id, bands } from one of its tabard swatches, or null for the robe each monarch
             is drawn with
     scenes  the scene chosen for a condition, by its id: { cpu_hot: 'camp' }. A condition left out,
             or given a scene that does not list it in its can, plays in its own scene
     homes   each condition's own scene in the world in use, by its id, as the settings resolve it
             from the world's preset (KW.settings.engineInput). A condition left out, or given a
             scene the page has not loaded or that cannot act it, plays in the scene KW.state gives
             it, the code's own
     pet     the pet, the mouser cat: { id, coat }. id names a pet of KW.cast.pets, the first when
             it is left out or names none; coat one of its coats, its first when it names none
     foe     the foe of the event with one (the banned address's), by its name in KW.cast.foes or
             another world's by its long name; the event's own (the goblin) when it names none
     critter what a blocked advert becomes, by its name in KW.cast.critters or another world's by
             its long name; the fly when it names none */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, K = KW.knight, P = KW.props, SP = KW.sprites, C = D.C, U = V.U;
  const { alpha, Rh, strip, lerp, clamp01, ease, hash } = D;

  const E = KW.engine = {
    input: { w: KW.state.IDLE, is: 'auto', turnMs: 60000, devices: [{ place: 'pie', kind: 'pi', ok: true, alert: true }], tv: false, helmet: 'auto' },
    note: ''
  };
  /* Whether the address's t= hook freezes time; KW.hooks.t is then the frozen time. */
  const frozen = () => KW.hooks.frozen;

  /* The quiet scenes take turns, each for the input's turnMs: those the input's turns lists, which
     the settings fill from the world's preset, or these five, the medieval world's in code. */
  const TURNS = ['battlement', 'camp', 'house', 'yard', 'smithy'];
  /* Each event lasts dur ms and plays only in the scenes listed. An event with a foe names it (in
     KW.cast.foes, below) and the exit it leaves by (in FOE.exits, below) when the foe names none of
     them. */
  const OUTDOORS = Object.keys(KW.scenes).filter(k => KW.scenes[k].outdoors);
  const EVENTS = {
    goblin: { dur: 3400, where: ['battlement', 'camp'], foe: 'goblin', exit: 'poof' },
    crate:  { dur: 4200, where: OUTDOORS },
    feast:  { dur: 3600, where: ['battlement', 'camp', 'yard', 'house'] } };
  /* Whether the scene name plays the event type: by the scene's hosts, which name the flies, the
     crate, the feast and the foe (an event with a foe is hosted as 'foe'), so that a scene of any
     world says what it plays; a scene that gives no hosts plays the events whose where names it,
     the medieval world's lists, which its scenes' hosts repeat. */
  const hostOf = type => (EVENTS[type].foe ? 'foe' : type);
  function hosts(name, type) {
    if (!Object.prototype.hasOwnProperty.call(EVENTS, type)) return false;
    const sc = name ? KW.scenes[name] : null;
    return sc && Array.isArray(sc.hosts) ? sc.hosts.includes(hostOf(type)) : EVENTS[type].where.includes(name);
  }

  let main = null, kx = 96 * U, ev = null, curScene = '', fadeAt = -1e9, sceneT0 = 0, round = { i: 0, arr: 0 };
  const flies = []; let swat = null, lastSwat = -1e9, pendingFlies = 0;
  // the pet's catches, in the order its flies came, the time it is free again after the last, and
  // the flies leaving the scene under a warning
  const catches = [], leaving = []; let petFree = -1e9;
  const bgCache = { key: '', changes: 0, cv: document.createElement('canvas') };

  /* The scene the winning condition w plays in at t: the one the input's scenes chose for it,
     when that scene can act it, else the condition's own in the world in use (the input's homes),
     else its own in code (w.scene), else the quiet scene of the moment. */
  const own = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null);
  const acts = (name, id) => !!(name && KW.scenes[name] && (KW.scenes[name].can || []).includes(id));
  function sceneOf(w, t) {
    const pick = own(E.input.scenes, w.id), home = own(E.input.homes, w.id);
    if (pick && w.scene && acts(pick, w.id)) return pick;
    if (home && w.scene && acts(home, w.id)) return home;
    return w.scene || idleScene(t);
  }
  function idleScene(t) {
    const { is, turnMs, turns } = E.input, list = Array.isArray(turns) && turns.length && turns.every(n => KW.scenes[n]) ? turns : TURNS;
    return is === 'auto' ? list[Math.floor((t - sceneT0) / turnMs) % list.length] : is;
  }

  /* A blocked advert becomes a fly, which belongs to whoever can take it when it comes: the knight
     outdoors while free, the pet (the mouser cat) indoors and while the knight is busy with an
     event. The knight's flies gather, eight at most on screen, the rest waiting for the next swat;
     the pet takes its flies one at a time, three at most on screen, and a fly past that is only
     counted, in the quiet line's count of adverts the collector writes. Under a warning or worse a
     blocked advert adds no fly at all, and the flies on screen leave (see draw). A page without a
     pet, or a scene where it has no spot, gives every fly to the knight, to wait indoors as before
     there was a pet. The engine keeps where the flies hover, the swat, the catch, the poof and the
     fall; the fly's drawing is the critter's, from KW.cast, which the world's cast fills
     (world.js), or from the code's own, KW.props.CRITTERS, on a page without the compiler. */
  const critters = () => (KW.cast ? KW.cast.critters : P.CRITTERS);
  /* The critter the input names (by its name or long name), else the fly. */
  function critterNow() {
    const C = critters(), want = E.input.critter;
    return typeof want === 'string' && Object.prototype.hasOwnProperty.call(C, want) ? C[want] : C.fly;
  }
  const flyOf = (list, t, salt) => {
    const live = list.filter(f => !f.dead), side = live.filter(f => f.side > 0).length <= live.filter(f => f.side < 0).length ? 1 : -1, h = hash(list.length * 13 + salt + Math.floor(t));
    return { side, r: 130 + (h % 110), th: .35 + ((h >> 5) % 100) / 100 * 1.1, ph: (h >> 9) % 7, born: t, dead: 0, h };
  };
  function addFly(t) {
    const w = E.input.w;
    if (w.lv >= 3) return;
    // the scene on screen, or before the first frame the one the input gives
    const name = curScene || sceneOf(w, frozen() ? KW.hooks.t : t), sc = KW.scenes[name], pet = petNow(), spot = pet && sc ? spotOf(pet, name, sc, w) : null;
    if (spot && (!sc.outdoors || ev)) {
      const live = catches.filter(k => k.hitAt > t).map(k => k.f);
      if (live.length >= PET.most) return;
      const f = flyOf(live, t, 7);
      f.buzz = PET.buzz[0] + (f.h >>> 3) % (PET.buzz[1] - PET.buzz[0] + 1);
      catches.push(catchPlan(f, pet, spot, name, petFree));
      petFree = catches[catches.length - 1].end;
      return;
    }
    const live = flies.filter(f => !f.dead);
    if (live.length >= 8) { pendingFlies++; return; }
    const f = flyOf(flies, t, 5); delete f.h;
    flies.push(f);
  }
  function flyPos(f, t) {
    const hx = kx + f.side * (50 + f.r * Math.sin(f.th)) + Math.sin(t / 420 + f.ph) * 20, hy = V.HFL - 80 - f.r * Math.cos(f.th) + Math.cos(t / 330 + f.ph * 2) * 15;
    const q = ease(clamp01((t - f.born) / 1300));
    return [lerp(f.side > 0 ? V.HR + 30 : V.HL - 30, hx, q), lerp(hy - 70, hy, q)];
  }
  /* ---- The pet's catch ------------------------------------------------------------------------
     The pet is KW.cast.pets, which the world's cast fills (world.js), or the code's own,
     KW.props.PETS (cat.js), on a page without the compiler. It rests at its spot in each scene the
     whole time; a fly of its own buzzes round the knight for PET.buzz, then the pet sits up alert
     while the fly comes down to the scene's catch point, stalks to where it takes off, wiggles,
     pounces, and its paw meets the fly at the top of the leap, where the fly goes in the sword's
     poof and falls; the pet lands with a swipe, is pleased, walks back and settles. A fly whose buzz
     ends while the pet is busy waits until it has settled. Each catch is worked out when its fly
     comes (catchPlan), so that with time frozen the picture depends on the time alone. Times in ms,
     speeds in pixels a ms: notice, the look up at a fly as it comes; alert, how long before the
     end of the buzz it sits up; creep, the least time it stalks; then wiggle, rise (the leap up),
     fall, land (the swipe), pleased, settle. */
  const PET = { buzz: [10000, 20000], most: 3, notice: 1600, alert: 2500, creep: 1200, stalk: 60 / 1000, wiggle: 600, rise: 380, fall: 320, land: 450,
    pleased: 1800, walk: 55 / 1000, settle: 700, after: 400, poof: 260, drop: 900, leave: 1300 };
  const pets = () => (KW.cast ? KW.cast.pets : P.PETS) || {};
  /* The pet the input names, or the first; null on a page with none. */
  function petNow() {
    const all = pets(), want = E.input.pet && E.input.pet.id, ids = Object.keys(all);
    return want && Object.prototype.hasOwnProperty.call(all, want) ? all[want] : ids.length ? all[ids[0]] : null;
  }
  const owns = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  /* The pet's spot in the scene name, its spot by the bed while the knight is in bed, or null. */
  function spotOf(pet, name, sc, w) {
    const sp = owns(pet.spots, name) ? pet.spots[name] : null;
    if (!sp) return null;
    return !!sc.bed && (w.id === 'night' || w.id === 'container_unhealthy') && sp.bed ? sp.bed : sp;
  }
  function floorAt(sp, x) { for (const [a, b, y] of sp.floors) if (x >= a && x <= b) return y; return sp.lane; }
  /* The pet's y at x on its way from x0 along the floors, with a hop where the floor steps up or
     down. */
  function yAlong(sp, x0, x) {
    const H = 16, dir = Math.sign(x - x0) || 1;
    for (let b = Math.round(x0); dir > 0 ? b <= x : b >= x; b += dir) {
      const y1 = floorAt(sp, b), y2 = floorAt(sp, b + dir);
      if (y1 !== y2 && Math.abs(x - (b + dir / 2)) < H) {
        const q = clamp01((x - (b + dir / 2 - dir * H)) * dir / (2 * H));
        return { y: lerp(y1, y2, q) - (12 + Math.abs(y1 - y2) * .35) * Math.sin(q * Math.PI), hop: true };
      }
    }
    return { y: floorAt(sp, x), hop: false };
  }
  /* The catch of the fly f by the pet at its spot sp in the scene name, the pet free from free: the
     top of the leap puts the paw on the catch point, a leap lower than the pet's lift is raised to
     it, and the fly comes down to where the paw will be. */
  function catchPlan(f, pet, sp, name, free) {
    const go = Math.max(f.born + f.buzz, free + PET.after), [fx, fy] = sp.fly, face = Math.sign(fx - sp.rest[0]) || sp.face, paw = pet.paw;
    const apex = [fx - paw[0] * face, fy - paw[1]], take = apex[0] - pet.take * face, landX = apex[0] + pet.land * face;
    apex[1] = Math.min(apex[1], floorAt(sp, take) - pet.lift);
    const k = { f, sp, name, face, go, alertAt: Math.max(go - PET.alert, free), take, apex, landX, hit: [apex[0] + paw[0] * face, apex[1] + paw[1]] };
    k.stalkEnd = go + Math.max(PET.creep, Math.abs(take - sp.rest[0]) / PET.stalk);
    k.jump = k.stalkEnd + PET.wiggle; k.hitAt = k.jump + PET.rise; k.down = k.hitAt + PET.fall; k.pleased = k.down + PET.land;
    k.walk = k.pleased + PET.pleased; k.home = k.walk + Math.abs(sp.rest[0] - landX) / PET.walk; k.end = k.home + PET.settle;
    return k;
  }
  /* What the pet does at t: { pose, x, y, face }. */
  function petAt(sp, t) {
    const rx = sp.rest[0], ry = sp.rest[1], at = (pose, x, y, face) => ({ pose, x, y, face });
    for (const k of catches) {
      if (t < k.alertAt) {
        // a fly has just come: the pet looks up at it for a moment
        for (const j of catches) if (t >= j.f.born && t < j.f.born + PET.notice && j.f.born < k.alertAt) return at('alert' + (Math.floor(t / 400) % 2), rx, ry, Math.sign(flyPos(j.f, t)[0] - rx) || sp.face);
        return at('rest', rx, ry, sp.face);
      }
      if (t >= k.end) continue;
      const face = k.face;
      if (t < k.go) return at('alert' + (Math.floor(t / 400) % 2), rx, ry, face);
      if (t < k.stalkEnd) {
        const x = lerp(rx, k.take, (t - k.go) / Math.max(1, k.stalkEnd - k.go)), a = yAlong(sp, rx, x), back = Math.sign(k.take - rx) === -face, f = Math.floor(t / 250) % 2;
        // a take-off point behind the pet: it walks there first, then turns
        return at(a.hop ? 'pounce' : back ? 'walk' + f : 'stalk' + f, x, a.y, back ? -face : face);
      }
      if (t < k.jump) { const f = Math.floor(t / 110) % 2; return at('stalk' + f, k.take + (f ? 1 : -1), floorAt(sp, k.take), face); }
      const y0 = floorAt(sp, k.take), yl = floorAt(sp, k.landX);
      if (t < k.hitAt) { const q = (t - k.jump) / PET.rise; return at('pounce', lerp(k.take, k.apex[0], q), lerp(y0, k.apex[1], ease(q)), face); }
      if (t < k.down) { const q = (t - k.hitAt) / PET.fall; return at(q < .5 ? 'pounce' : 'land', lerp(k.apex[0], k.landX, q), lerp(k.apex[1], yl, q * q), face); }
      if (t < k.pleased) return at('land', k.landX, yl, face);
      if (t < k.walk) return at('pleased', k.landX, yl, face);
      if (t < k.home) {
        const x = lerp(k.landX, rx, (t - k.walk) / Math.max(1, k.home - k.walk)), a = yAlong(sp, k.landX, x);
        return at(a.hop ? 'pounce' : 'walk' + (Math.floor(t / 260) % 2), x, a.y, Math.sign(rx - k.landX) || -face);
      }
      return at('settle', rx, ry, sp.face);
    }
    return at('rest', rx, ry, sp.face);
  }
  /* The pet as the world's words name it, lower case: the label the word set gives the pet (the
     cat), or the cat without one. */
  function petWord() {
    const w = KW.world && KW.world.words, l = w && w.labels && typeof w.labels.pet === 'string' && w.labels.pet ? w.labels.pet : 'The cat';
    return l.charAt(0).toLowerCase() + l.slice(1);
  }
  const wob = (f, t) => [Math.sin(t / 260 + f.ph) * 5, Math.cos(t / 210 + f.ph) * 4];
  /* Where the pet's fly of the catch k is at t: [x, y], or { dead, x, y } once caught, or null once
     it has fallen. It hovers round the knight, comes down to the catch point and wobbles there, and
     from the jump drifts the last few pixels to where the paw meets it. */
  function preyAt(k, t) {
    const f = k.f;
    if (t >= k.hitAt) { const a = t - k.hitAt; return a < PET.drop + 100 ? { dead: a, x: k.hit[0], y: k.hit[1] } : null; }
    const hover = tt => { const [wx, wy] = wob(f, tt); return [k.hit[0] + wx, k.hit[1] + wy]; };
    if (t < k.alertAt) return flyPos(f, t);
    if (t >= k.jump) { const a = hover(k.jump), q = (t - k.jump) / PET.rise; return [lerp(a[0], k.hit[0], q), lerp(a[1], k.hit[1], q)]; }
    const q = ease(clamp01((t - k.alertAt) / (k.go - k.alertAt || 1))), dip = hover(t), o = flyPos(f, Math.min(t, k.alertAt));
    return [lerp(o[0], dip[0], q), lerp(o[1], dip[1], q)];
  }
  /* The pet at its spot, after the knight and before the devices in front of it: its pose's canvas,
     painted once, mirrored when it faces left. */
  function petHD(pet, coat, c) {
    const cv = pet.pose(coat, c.pose), [ax, ay] = pet.anchor;
    main.save(); main.translate(Math.round(c.x), Math.round(c.y)); if (c.face < 0) main.scale(-1, 1); main.drawImage(cv, -ax, -ay); main.restore();
  }
  /* Under a warning the flies on screen leave: the knight's, and the pet's that it has not leapt
     for yet, each from where it is out to the side it came from. */
  function leaveAll(t) {
    for (const f of flies) if (!f.dead) leaving.push({ from: flyPos(f, t), side: f.side, ph: f.ph, t0: t });
    for (let i = flies.length - 1; i >= 0; i--) if (!flies[i].dead) flies.splice(i, 1);
    pendingFlies = 0;
    for (let i = catches.length - 1; i >= 0; i--) {
      const k = catches[i];
      if (t >= k.jump) continue;
      leaving.push({ from: preyAt(k, t), side: k.f.side, ph: k.f.ph, t0: t });
      catches.splice(i, 1);
    }
    petFree = catches.length ? catches[catches.length - 1].end : t;
  }
  function leavingPos(l, t) {
    const q = ease(clamp01((t - l.t0) / PET.leave));
    return [lerp(l.from[0], l.side > 0 ? V.HR + 30 : V.HL - 30, q), lerp(l.from[1], l.from[1] - 70, q)];
  }
  function startSwat(t) {
    const live = flies.filter(f => !f.dead && t - f.born > 1300); if (!live.length) return;
    // a weapon that only fires shoots the flies, one shot each (volleyPlan, below)
    if (firesOnly()) { swat = { t0: frozen() ? 0 : t, shots: volleyPlan(live) }; return; }
    const segs = []; if (live.some(f => f.side > 0)) segs.push(1); if (live.some(f => f.side < 0)) segs.push(-1);
    swat = { t0: frozen() ? 0 : t, segs };
  }
  /* Stroll to the next spot, stand there a while doing what the spot is for, move on. The walk
     moves the knight a step each frame, so with time frozen the knight stays where they are, in
     mid-stride. With a weapon that fires, the spot for training stands PRACTICE short of
     the scene's target instead (practiceX, below). */
  function stroll(list, t, o, busy, sc) {
    const st = list[round.i % list.length], px = st.act === 'train' ? practiceX(sc) : null, dx = (px === null ? st.x * U : px) - kx;
    if (busy) return null;
    if (Math.abs(dx) > 2) { if (!frozen()) kx += Math.sign(dx) * 1.5; o.walk = true; round.arr = 0; return null; }
    if (!round.arr) round.arr = frozen() ? 1 : t;
    const el = Math.max(0, t - round.arr); if (el > st.dur * 1000) { round.i++; round.arr = 0; }
    return { act: st.act, el };
  }

  /* An event: the caption shows whatever happens, and the event plays out only while nothing at
     warning or above is up, in a scene that suits it, and with no swat under way. */
  function fireEvent(type, text) {
    const e = EVENTS[type], w = E.input.w; if (!e) return;
    if (text) KW.ui.caption(text, e.dur + 1500);
    if (w.lv >= 3 || !hosts(sceneOf(w, frozen() ? KW.hooks.t : performance.now()), type) || swat) return;
    ev = { type, t0: frozen() ? 0 : performance.now(), dur: e.dur };
  }

  /* ---- Shots -------------------------------------------------------------------------------------
     The engine's effects for a weapon that fires (format 1.2), drawn in the shot's colours: the
     flash, a small star at the muzzle for SHOT.flash ms in the shot's flash colour, or the pale snap
     (SHOT.snap) when it gives none; and the shot itself, by its kind: a bolt, a short streak flying
     at SHOT.speed pixels a ms; a tracer, a line from the muzzle drawn at once and fading over
     SHOT.tracer ms; a beam, a line drawn at once for SHOT.beam ms. Where a shot lands the engine
     draws its burst for burst ms (poofHD), the same cartoon burst as a blade's blow. A frame draws at
     most SHOT.most shots, the oldest first. Each shot is kept by a key and made once, so that the
     picture at a moment depends on the moment alone, and leaves once nothing of it shows: the last
     SPENT that have ended are remembered, so that an act asking for one again within its beat gets
     it back rather than a second shot. Times in ms. The acts that fire call shoot() and read when a
     shot lands. */
  const SHOT = Object.freeze({ speed: 1.6, flash: 60, tracer: 120, beam: 80, most: 8, burst: 260, streak: 26, star: 7, snap: '#eef3f9' });
  const SHOT_KINDS = ['bolt', 'tracer', 'beam'];
  const shots = new Map(), spent = new Map(), SPENT = 32;
  const clearShots = () => { shots.clear(); spent.clear(); };
  /* The shot of key, made by make() the first time it is asked for: make returns { kind, colour,
     flash, from, to, t0, burst }, flash optional, from the muzzle and to where it lands as [x, y],
     t0 the moment it leaves and burst the ms its landing burst shows (0 for none). The shot comes
     back with lands, the moment it reaches to (at once for a tracer or a beam), and end, the moment
     nothing of it shows. */
  function shoot(key, make) {
    let r = shots.get(key) || spent.get(key);
    if (!r) {
      r = Object.assign({}, make());
      if (!SHOT_KINDS.includes(r.kind)) throw new Error('a shot is a bolt, a tracer or a beam, not ' + r.kind);
      if (!(r.burst > 0)) r.burst = 0;
      r.len = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]) || 1;
      r.u = [(r.to[0] - r.from[0]) / r.len, (r.to[1] - r.from[1]) / r.len];
      r.lands = r.t0 + (r.kind === 'bolt' ? r.len / SHOT.speed : 0);
      r.end = Math.max(r.t0 + SHOT.flash, r.kind === 'tracer' ? r.t0 + SHOT.tracer : r.kind === 'beam' ? r.t0 + SHOT.beam : r.lands, r.lands + r.burst);
      shots.set(key, r);
    }
    return r;
  }
  /* Draws the shots at t: those that have left and still show, at most SHOT.most, in the order they
     were made, and forgets those that have ended. */
  function shotsHD(t) {
    let n = 0;
    for (const [k, r] of shots) {
      if (t >= r.end) {
        shots.delete(k); spent.set(k, r);
        if (spent.size > SPENT) spent.delete(spent.keys().next().value);
        continue;
      }
      const e = t - r.t0;
      if (e < 0 || n >= SHOT.most) continue;
      n++;
      const [fx, fy] = r.from, [tx, ty] = r.to;
      if (r.kind === 'bolt' && t < r.lands) {
        // the streak, its head in the flash colour
        const d = e * SHOT.speed, hx = fx + r.u[0] * d, hy = fy + r.u[1] * d, tl = Math.min(SHOT.streak, d), bx = hx - r.u[0] * tl, by = hy - r.u[1] * tl;
        strip(bx, by, hx, hy, 3, 3, C.K); strip(bx, by, hx, hy, 1.5, 1.5, r.colour); strip(hx - r.u[0] * 5, hy - r.u[1] * 5, hx, hy, 1.5, 1.5, r.flash || SHOT.snap);
      } else if (r.kind === 'tracer' && e < SHOT.tracer) {
        alpha(1 - e / SHOT.tracer); strip(fx, fy, tx, ty, 2.5, 2.5, C.K); strip(fx, fy, tx, ty, 1, 1, r.colour); alpha(1);
      } else if (r.kind === 'beam' && e < SHOT.beam) {
        strip(fx, fy, tx, ty, 4, 4, C.K); strip(fx, fy, tx, ty, 2.5, 2.5, r.colour); strip(fx, fy, tx, ty, .5, .5, C.W);
      }
      if (e < SHOT.flash) P.starHD(fx, fy, SHOT.star, r.flash || SHOT.snap);
      if (r.burst && t >= r.lands && t < r.lands + r.burst) P.poofHD(tx, ty);
    }
  }

  /* ---- The acts with a weapon that fires ----------------------------------------------------------
     A weapon that fires (KW.knight.fired()) plays the acts by shot, and one that only swings plays
     them as before. One that is both swung and fired (use "both") swings where a blade reaches and
     fires where it does not: it swings at the flies and at a foe within its blade's reach (foeGaps),
     and fires at a foe beyond it and at the practice target; in the attack it aims (knight.js).
       the swat     one shot per settled fly, VOLLEY.gap apart after a raise of VOLLEY.raise: the
                    flies on the oldest fly's side first, each side oldest first, so the watcher
                    turns once; aimed up to AIM.swatAbove over level; a fly is popped when its shot
                    reaches it. After the last, the recoil and the return (VOLLEY.after)
       practice     the training spot stands PRACTICE short of the scene's target (sc.target, the
                    middle of the target), and while the CPU runs hot the watcher walks there; the
                    scene's act fires at the target on its own beats (practice(), below) and the
                    target is struck when the shot arrives, with the burst
       the foe      shotPlan(): the foe at the shot's gap, the watcher stepping back while it
                    climbs in, aiming from FOE.shot.aim and firing at FOE.shot.fire (foeShot)
     Times in ms. */
  const VOLLEY = Object.freeze({ raise: 450, gap: 300, after: Object.freeze([80, 560]) });
  const PRACTICE = 300;
  const firing = () => (K.fired ? K.fired() : null);
  /* Whether the look's weapon only fires, and so shoots the flies rather than swing at them. */
  const firesOnly = () => { const f = firing(); return !!f && f.use === 'fire'; };
  /* The x the watcher shoots at the target from, PRACTICE short of its middle, with a weapon that
     fires in a scene with a target; null otherwise. The target always lies to the right, as the
     training swing cuts to the right. */
  const practiceX = sc => (firing() && sc && Array.isArray(sc.target) ? sc.target[0] - PRACTICE : null);
  /* The swat's shots for the settled flies live: the oldest fly's side first, then the other, each
     side oldest first, VOLLEY.gap apart after the raise. */
  function volleyPlan(live) {
    const old = live.slice().sort((a, b) => a.born - b.born), side = old[0].side;
    return old.filter(f => f.side === side).concat(old.filter(f => f.side !== side)).map((f, i) => ({ f, dir: f.side, t: VOLLEY.raise + i * VOLLEY.gap }));
  }
  /* The shot of a weapon that fires, as shoot() takes it, from from to to, leaving at t0. */
  const shotOf = (fw, from, to, t0, burst) => ({ kind: fw.shot.kind, colour: fw.shot.colour, flash: fw.shot.flash, from, to, t0, burst });
  /* The swat by shot at t, on the knight's pose o: the pose of the volley, each shot made as its
     moment comes, from the muzzle as the pose stood aimed at its fly, to where the fly was then, and
     the fly popped where the shot reaches it. A fly's mark is where it is now until its shot leaves,
     and where the shot went after. */
  function volleyAt(o, t) {
    const el = t - swat.t0, list = swat.shots, fw = firing();
    const marks = list.map(s => ({ dir: s.dir, t: s.t, at: flyPos(s.f, swat.t0 + (el >= s.t ? s.t : el)) }));
    K.volley(o, el, marks, VOLLEY.raise, VOLLEY.after);
    list.forEach((s, i) => {
      if (el < s.t) return;
      const at = marks[i].at, r = shoot('fly|' + Math.round(swat.t0) + '|' + s.t, () => {
        const p = K.aim.pose(Object.assign({}, o), s.dir, K.aim.angle(o, s.dir, at, K.aim.AIM.swatAbove));
        return shotOf(fw, K.muzzle(p), at.slice(), swat.t0 + s.t, 0);
      });
      if (!s.f.dead && t >= r.lands) { s.f.dead = Math.max(1, Math.round(r.lands)); s.f.at = r.to; }
    });
    if (list.every(s => s.f.dead) && el > list[list.length - 1].t + 200) { o.eyes = 'happy'; o.mouth = 'smile'; }
  }
  /* Practice by shot, for a scene's act: the shot of the beat that began at t0 and lasts len ms, at
     the target's middle at, with the pose of fire() at q (t - t0) / len on o, which stands at
     o.x. The shot leaves at the middle of the beat from the muzzle as the pose stood aimed, and lands
     on the target with the burst. Returns the moment it lands once it has, and null before. */
  function practice(o, t, t0, len, at) {
    const fw = firing();
    if (!fw) return null;
    K.fire(o, (t - t0) / len, 1, at);
    if (t - t0 < len / 2) return null;
    const r = shoot('practice|' + Math.round(t0), () => {
      const p = K.aim.pose(Object.assign({}, o), 1, K.aim.angle(o, 1, at));
      return shotOf(fw, K.muzzle(p), at.slice(), t0 + len / 2, SHOT.burst);
    });
    return t >= r.lands ? r.lands : null;
  }

  /* ---- Foes -------------------------------------------------------------------------------------
     An event with a foe (the goblin of ip_banned) plays in three parts, each read from a table so
     that a later foe reuses them with only its own description, which gives its poses, height,
     half width, middle and crown, and may name one of the exits: KW.cast.foes, which the world's
     cast fills (world.js), or the code's own, KW.props.FOES, on a page without the compiler. A world
     gives only the drawings and the measures; the motion is the engine's, and so is every exit:
       the entrance  up from behind the scene's wall (wallAt) or out of a hole in the ground, a
                     peek, a hop to the ground, a face pulled at the knight, a flinch;
       the strike    the knight's own swing (KW.knight.swing), stopped where the blade first meets
                     the foe's crown, then a bounce back and a return to the stance, so the blade
                     never passes through the foe; or, with a weapon that fires, a shot from range
                     (shotPlan and foeShot, below);
       the exit      what the foe leaves by; the one exit built is the poof.
     A foe that fires (format 1.2) also aims in place of its taunt and fires once before the strike
     (foeFires, below); the watcher is never hit, and flinches.
     Times are in ms from the start of the event; an exit's are from the moment of the hit. */
  const FOE = {
    // the distance from the knight's middle to the foe's, least, wanted and most. The least keeps
    // the foe clear of the knight; the weapon's reach can bring the other two in (foeGaps), so the
    // blade always meets the foe, whatever the weapon
    gap: [150, 210, 240],
    // how far inside the weapon's furthest reach the foe wants to stand, as a share of the blade's
    // length, so the blade meets it a little short of the point
    reachIn: .12,
    // how far a foe keeps from the box of a device's place, beyond its own half width
    clear: 0,
    enter: { open: [60, 260], rise: [250, 650], peek: [650, 850], hop: [850, 1150], land: [1150, 1230], taunt: [1230, 1480], brace: 1480,
      // how high above the line it peeks (its feet below the line by this), and clears the line in its hop
      peekBelow: 72, hopOver: 26, squash: [.14, .1], tauntFrame: 110,
      // the line a foe is clipped to while in its hole: the hole's middle, below the ground
      holeLine: 4 },
    // the knight's swing from at over dur, stopped at the hit; the bounce back over rebound and the
    // return to the stance over recover. In the bounce the blade lifts a little and, with a weapon in
    // one hand, rocks back by kick (radians); a weapon in both hands does not rock back, since its
    // crossguard would swing into the foe's flung hand
    strike: { at: 1250, dur: 900, rebound: 80, recover: 560, kick: .32, eyes: 500 },
    // with a weapon that fires (shotPlan): the gap from the watcher's middle to the foe's, least,
    // wanted and most, the most no more than the weapon's range or most; the least raised to keep
    // the foe clear of the muzzle by clear; how far the watcher may step back from the foe's side for
    // the gap, over stepMs while the foe climbs in; the aim from aim and the shot at fire. The recoil
    // and the return are the strike's rebound and recover
    shot: { gap: [200, 300, 320], most: 420, clear: 30, step: 160, stepMs: 900, aim: 1250, fire: 1400 },
    // a foe that fires (its fires, format 1.2; foeFires): it aims in place of its taunt from aim and
    // fires once at fire, before the watcher's strike or shot. The shot misses over the watcher's
    // head, aimed over px above the corner of the head group nearest the foe; or with a shield
    // carried on the foe's side it stops at the shield's face, face of the way down its edge nearest
    // the foe, with the spark, the burst of a blade's blow, for spark ms. As the shot passes or
    // stops the watcher's eyes are wide for flinch ms
    fires: { aim: 1230, fire: 1350, over: 40, face: .4, spark: 80, flinch: 200 },
    exits: {
      // gone in a puff of smoke: struck (squashed for 120 ms, a burst on the pot for the 80 ms the
      // blade bounces off it), the cloud at 140, the foe hidden at 170 behind it, sparkles from
      // 240, the knight pleased at 640, a hole closed by 1190. Struck by a blade, the foe holds its
      // brace for the first hitPose ms and only then flings into its hit pose, so the blade lands on
      // the pose it was planned against; the squash and the burst start at the hit all the same
      poof: { struck: 140, squash: [120, .1, .08], cloud: 140, gone: 170, sparkles: 240, pleased: 640, close: [840, 1190], impact: 80, hitPose: 16 }
    }
  };
  const segQ = (el, a, b) => clamp01((el - a) / (b - a));
  /* Whether the scene shows the weapon at rest: one of its rests is a frame (it gives an angle a),
     as the house's pegs, the smithy's anvil and a workbench are. Where it does not and the weapon is
     put away, the watcher wears the weapon's stowed view (draw). */
  const restsWeapon = sc => !!(sc && sc.rests) && Object.keys(sc.rests).some(k => sc.rests[k] && typeof sc.rests[k].a === 'number');
  /* Where the crate of an import lands, its left edge: in a scene that gives the stretch of floor
     it may land on (crate.span, docs/scenes.md), its middle as near 160 left of the knight as the
     stretch allows; elsewhere 320 left of the knight, and never past the screen's left edge. */
  function crateX(sc, kx) {
    const sp = sc && sc.crate && sc.crate.span;
    if (!sp) return Math.max(V.HL + 70, kx - 320);
    return Math.min(sp[1] - 30, Math.max(sp[0] + 30, kx - 160)) - 30;
  }
  const foesNow = () => (KW.cast ? KW.cast.foes : P.FOES);
  /* The foe of the event e: the one the input names (a foe of KW.cast.foes, by its name or long
     name), else the event's own. */
  function foeFor(e) {
    const F = foesNow(), want = E.input.foe;
    return typeof want === 'string' && Object.prototype.hasOwnProperty.call(F, want) ? F[want] : F[e.foe];
  }

  /* Each class of place's box, as pack.js's CLASS_BOX gives it ([x0, y0, x1, y1] from the base):
     what any device of the class may paint. */
  const CLASS_BOX = { pie: [-46, -107, 45, 33], high: [-34, -64, 32, 0], ground: [-66, -93, 56, 2] };
  /* Where the foe F stands with the knight at kx in scene sc, as { x, side }, or null when there is
     no room. The scene's foeZone gives the side tried first and the spans of ground clear of its
     own props; the places that hold a device on the ground or the pie's are kept clear too, each
     across the whole of its class box and its place's width, mirrored where the place is flipped.
     The spot is the one nearest the wanted gap on the first side that has room. */
  function foeSpot(F, sc, devices, places, kx, gaps) {
    const z = sc.foeZone; if (!z) return null;
    const m = F.w + FOE.clear, blocked = [];
    for (const dv of devices || []) {
      const pl = dv && places && places[dv.place];
      if (!pl || !(pl.cls === 'pie' || pl.cls === 'ground')) continue;
      const b = CLASS_BOX[pl.cls], x0 = pl.flip ? -b[2] : b[0], x1 = pl.flip ? -b[0] : b[2];
      blocked.push([pl.x + Math.min(-pl.w / 2, x0) - m, pl.x + Math.max(pl.w / 2, x1) + m]);
    }
    const first = z.side < 0 ? -1 : 1;
    for (const side of [first, -first]) {
      const g = gaps ? gaps[side] : FOE.gap; if (!g) continue;
      const [gMin, gWant, gMax] = g, want = kx + side * gWant, lo = side > 0 ? kx + gMin : kx - gMax, hi = side > 0 ? kx + gMax : kx - gMin;
      const ok = x => x >= lo && x <= hi && z.spans.some(([a, b]) => x >= a && x <= b) && !blocked.some(([a, b]) => x > a && x < b);
      const cands = [want, lo, hi];
      for (const sp of z.spans.concat(blocked)) cands.push(sp[0], sp[1]);
      let pick = null;
      for (const x of cands) if (ok(x) && (pick === null || Math.abs(x - want) < Math.abs(pick - want))) pick = x;
      if (pick !== null) return { x: Math.round(pick), side };
    }
    return null;
  }

  /* The blade in the knight's pose o: its frame and its extent along it, outline included. The
     outline is 4 pixels wide along the edges, so the band is half and 4 across; it keeps that width
     as far as the drawn point starts (point, KW.knight.rest.point's at) and tapers from there to the
     drawn tip (to): from s 236 to 270 on the greatsword, 198 to 228 on the longsword and 150 to 180
     on the arming sword. Without a drawn point (a pack's blade the knight cannot measure) the band
     runs full width to the outline's end, longer than the blade as the blade is broader: 7 on the
     greatsword, 5 on the arming sword. The frame is the rig's on the build being drawn
     (KW.knight.rig takes the look's build), so foeGaps, contactQ and the foe's plan measure the blade
     as it is drawn on every build. A weapon with a head the outline does not describe (the mace's,
     KW.knight.rest.head) is measured by its drawing instead: head is the drawing's pieces and the
     circle around them, and to and half are as far as they reach along the frame and across it. */
  function bladeOf(o) {
    const b = K.rest.reach() || { from: 34, to: 263, half: 15 }, m = K.rig(o).anchors.main, h = K.rest.head ? K.rest.head() : null;
    if (h) return { x: m[0], y: m[1], a: m[2], from: b.from - 3, to: h.to, half: h.half, head: h };
    const pt = K.rest.point ? K.rest.point() : null;
    if (pt) return { x: m[0], y: m[1], a: m[2], from: b.from - 3, to: pt.to, half: b.half + 4, point: pt.at };
    return { x: m[0], y: m[1], a: m[2], from: b.from - 3, to: b.to + Math.round(b.half * 7 / 15), half: b.half + 4 };
  }
  /* How far the point s along the blade's frame and p across it lies from the band's outline, in
     pixels, 0 or below once it is within: across the band, or past where the point starts, from the
     slanted edge running to the tip. */
  function bandGap(bl, s, p) {
    if (bl.point == null || s <= bl.point) return Math.abs(p) - bl.half;
    const len = bl.to - bl.point;
    return ((s - bl.point) * bl.half + (Math.abs(p) - bl.half) * len) / Math.hypot(len, bl.half);
  }
  /* How far the point s along the weapon's frame and p across it lies from the head's drawing, in
     pixels, 0 or below once it is within: the least over the head's pieces, each a circle or a convex
     polygon counter-clockwise, whose nearest edge gives the distance inside it and out. A piece
     whose circle (bc, br) lies further off than the least so far cannot give less, and is passed by. */
  function headGap(head, s, p) {
    let gap = Infinity;
    for (const pc of head.pieces) {
      if (Math.hypot(s - pc.bc[0], p - pc.bc[1]) - pc.br >= gap) continue;
      if (pc.c) { gap = Math.min(gap, Math.hypot(s - pc.c[0], p - pc.c[1]) - pc.r); continue; }
      const q = pc.pts;
      let inside = true, d = Infinity;
      for (let i = 0; i < q.length; i++) {
        const [us, up] = q[i], [vs, vp] = q[(i + 1) % q.length], es = vs - us, ep = vp - up, t = clamp01(((s - us) * es + (p - up) * ep) / (es * es + ep * ep));
        if (es * (p - up) - ep * (s - us) < 0) inside = false;
        d = Math.min(d, Math.hypot(s - us - t * es, p - up - t * ep));
      }
      gap = Math.min(gap, inside ? -d : d);
    }
    return gap;
  }
  /* The nearest point of the foe's crown that lies beside the blade, as { gap, x, y }: gap is how
     far the blade's outline (or the head's drawing) is from it in pixels, 0 or below once it is
     within, and x and y where it is on the grid. A point beyond either end of the blade is not
     beside it. The crown is given as drawn, facing left: a foe right of the knight (side 1) faces
     left, one left of it is drawn the other way round. */
  function crownNear(bl, F, fx, side, floor) {
    const sx = Math.sin(bl.a), sy = -Math.cos(bl.a), nx = Math.cos(bl.a), ny = Math.sin(bl.a);
    let near = { gap: Infinity, x: fx, y: floor };
    for (const [cx, cy] of F.crown) {
      const x = fx + side * cx, y = floor + cy, px = x - bl.x, py = y - bl.y, along = px * sx + py * sy;
      if (along < bl.from || along > bl.to) continue;
      // a point further from the whole head than the nearest so far is passed by
      if (bl.head && Math.hypot(along - bl.head.bc[0], px * nx + py * ny - bl.head.bc[1]) - bl.head.br >= near.gap) continue;
      const gap = bl.head ? headGap(bl.head, along, px * nx + py * ny) : bandGap(bl, along, px * nx + py * ny);
      if (gap < near.gap) near = { gap, x, y };
    }
    return near;
  }
  const bladeGap = (bl, F, fx, side, floor) => crownNear(bl, F, fx, side, floor).gap;
  /* How far through the swing (0 to 1) the blade meets the foe's crown, the knight in pose o (at
     rest, its bob still) at o.x; 1 when it never does. Found to a thousandth of the swing. */
  function contactQ(F, fx, side, o) {
    const p = Object.assign({}, o, { bob: 0 }), at = q => { Object.assign(p, { gx: o.gx, gy: o.gy, wang: o.wang }); K.swing(p, q, side); return bladeGap(bladeOf(p), F, fx, side, o.floor); };
    let lo = 0, hi = null;
    for (let q = 0; q <= .55 + 1e-9; q += .005) { if (at(q) <= 0) { hi = q; break; } lo = q; }
    if (hi === null) return 1;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (at(mid) <= 0) hi = mid; else lo = mid; }
    return lo;
  }
  /* The gaps at which the equipped weapon, cutting towards side, meets the foe F: [least, wanted,
     most], or null when it cannot meet it even at the least. The most is the furthest gap at which
     the blade still reaches the crown, to a pixel, and no more than FOE.gap's; the wanted is
     FOE.reachIn of the blade's length inside that, and no more than FOE.gap's. With the greatsword
     they are FOE.gap's own. */
  function foeGaps(F, o, side) {
    const [gMin, gWant, gMax] = FOE.gap, meets = g => contactQ(F, o.x + side * g, side, o) < 1;
    if (!meets(gMin)) return null;
    let most = gMax;
    if (!meets(gMax)) { let lo = gMin, hi = gMax; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (meets(mid)) lo = mid; else hi = mid; } most = lo; }
    const b = K.rest.reach() || { from: 34, to: 263 }, inside = Math.round(FOE.reachIn * (b.to - b.from));
    return [gMin, Math.max(gMin, Math.min(gWant, most - inside)), most];
  }
  /* The plan of a foe's event, worked out once on its first frame: the foe, where it stands, the
     line it comes over, and when the weapon meets it. null when it has no room within the weapon's
     reach, so a foe never plays a hit the weapon did not give. A weapon that only fires shoots
     (shotPlan); one that is both swung and fired swings where its blade reaches the foe and shoots
     where it does not; one that only swings swings. */
  function foePlan(type, sc, s, o) {
    const e = EVENTS[type], F = foeFor(e); if (!F) return null;
    const fw = firing();
    if (fw && fw.use === 'fire') return shotPlan(e, F, sc, s, o);
    return swingPlan(e, F, sc, s, o) || (fw ? shotPlan(e, F, sc, s, o) : null);
  }
  /* The plan by the blade: the foe within its reach, met where the blade first touches its crown. */
  function swingPlan(e, F, sc, s, o) {
    const gaps = { 1: foeGaps(F, o, 1), '-1': foeGaps(F, o, -1) }, spot = foeSpot(F, sc, s.devices, s.places, o.x, gaps);
    if (!spot) return null;
    const q = contactQ(F, spot.x, spot.side, o), S = FOE.strike; if (q >= 1) return null;
    const burrow = !sc.wallAt, lineAt = burrow ? () => V.HFL + FOE.enter.holeLine : sc.wallAt;
    // where the blade touches, for the burst
    const p = Object.assign({}, o, { bob: 0 }); K.swing(p, q, spot.side);
    const touch = crownNear(bladeOf(p), F, spot.x, spot.side, o.floor);
    return { F, x: spot.x, side: spot.side, burrow, lineAt, q, hit: Math.round(S.at + q * S.dur), touch: [Math.round(touch.x), Math.round(touch.y)],
      exit: exitOf(F, e) };
  }
  const exitOf = (F, e) => FOE.exits[typeof F.exit === 'string' && Object.prototype.hasOwnProperty.call(FOE.exits, F.exit) ? F.exit : e.exit];
  /* The plan by shot. On each side the least gap is FOE.shot's or, when more, the muzzle's reach
     from the watcher's middle aimed level plus the foe's half width and FOE.shot.clear, so that the
     shot leaves the muzzle clear of the foe; the most is FOE.shot's, or the least when that is more
     (a long barrel), and no more than the weapon's range or FOE.shot.most. Where the foe's zone has no room at the wanted gap from where the
     watcher stands, the watcher steps back from the zone's side, 4 pixels at a time up to
     FOE.shot.step, to the least step that gives the wanted gap, or else the widest gap found; never
     nearer the screen's edge than 90. The shot is aimed at the foe's mid and the hit is where it
     meets the foe's body, its half width short of the mid: the moment a bolt reaches it, or at once
     for a tracer or a beam. shot holds what the event plays: the watcher's x before and after the
     step, the point aimed at, the muzzle, and the gaps. */
  function shotPlan(e, F, sc, s, o) {
    const fw = firing(), S = FOE.shot, p0 = Object.assign({}, o, { bob: 0 }), gaps = {};
    for (const side of [1, -1]) {
      const reach = Math.abs(K.muzzle(K.aim.pose(Object.assign({}, p0), side, side * Math.PI / 2))[0] - p0.x);
      const least = Math.max(S.gap[0], Math.ceil(reach + F.w + S.clear)), most = Math.min(Math.max(S.gap[2], least), fw.range, S.most);
      gaps[side] = least > most ? null : [least, Math.min(most, Math.max(least, S.gap[1])), most];
    }
    const away = sc.foeZone && sc.foeZone.side < 0 ? 1 : -1;
    let spot = null, kx2 = o.x;
    for (let d = 0; d <= S.step; d += 4) {
      const x = o.x + away * d;
      if (x < V.HL + 90 || x > V.HR - 90) break;
      const sp = foeSpot(F, sc, s.devices, s.places, x, gaps);
      if (sp && (!spot || Math.abs(sp.x - x) > Math.abs(spot.x - kx2))) { spot = sp; kx2 = x; }
      if (spot && Math.abs(spot.x - kx2) >= gaps[spot.side][1]) break;
    }
    if (!spot) return null;
    const mid = [spot.x, V.HFL - F.mid], p = Object.assign({}, p0, { x: kx2 });
    K.aim.pose(p, spot.side, K.aim.angle(p, spot.side, mid));
    const from = K.muzzle(p), len = Math.hypot(mid[0] - from[0], mid[1] - from[1]) || 1, stop = Math.max(0, len - F.w);
    const touch = [Math.round(from[0] + (mid[0] - from[0]) * stop / len), Math.round(from[1] + (mid[1] - from[1]) * stop / len)];
    const burrow = !sc.wallAt, lineAt = burrow ? () => V.HFL + FOE.enter.holeLine : sc.wallAt;
    return { F, x: spot.x, side: spot.side, burrow, lineAt, q: .5, hit: Math.round(S.fire + (fw.shot.kind === 'bolt' ? stop / SHOT.speed : 0)), touch,
      exit: exitOf(F, e), shot: { kx0: o.x, kx: kx2, mid, from, gaps: gaps[spot.side] } };
  }
  /* The event by shot on the knight's pose o at el, with the plan pl: the watcher steps back while
     the foe climbs in, over FOE.shot.stepMs, then aims from FOE.shot.aim, fires at FOE.shot.fire
     (fire() at q .5), recoils for the strike's rebound and returns over its recover. The shot flies
     from the muzzle to where it meets the foe; the hit's burst is the exit's. Returns the watcher's
     x. */
  function foeShot(o, el, pl, t0) {
    const S = FOE.shot, R = FOE.strike, f = pl.shot, k = clamp01(el / S.stepMs);
    const x = f.kx === f.kx0 ? f.kx : lerp(f.kx0, f.kx, ease(k));
    o.x = x;
    if (f.kx !== f.kx0 && k < 1) o.walk = true;
    const q = el < S.aim ? -1 : el < S.fire ? .5 * (el - S.aim) / (S.fire - S.aim) : el < S.fire + R.rebound ? .5 + .1 * (el - S.fire) / R.rebound
      : Math.min(1, .6 + .4 * (el - S.fire - R.rebound) / R.recover);
    if (q >= 0) K.fire(o, q, pl.side, f.mid);
    if (el >= S.fire) { const fw = firing(); if (fw) shoot('foe|' + Math.round(t0), () => shotOf(fw, f.from, pl.touch.slice(), t0 + S.fire, 0)); }
    return x;
  }

  /* The strike on the knight's pose o at el: the swing until the hit, then the bounce back (a lift,
     and with a weapon in one hand a rock back by FOE.strike.kick) and the return to the stance the
     pose began in. With a weapon in one hand the shield hand (fx, fy) comes back with it. Where the
     swing comes back by a return of its own (K.ownReturn: the swings to the left, which bring the
     blade back low so that it does not pass the face again), the strike's return plays that return
     over its own time, offset by where the bounce left the blade against the cut's end, the offset
     easing out; otherwise it goes straight back to the stance. */
  function strike(o, el, pl) {
    const S = FOE.strike, one = o.fx != null, base = { gx: o.gx, gy: o.gy, wang: o.wang, fx: o.fx, fy: o.fy };
    if (el < S.at) return;
    if (el < pl.hit) { K.swing(o, (el - S.at) / S.dur, pl.side); return; }
    const r = el - pl.hit; if (r >= S.rebound + S.recover) return;
    const c = { gx: 0, gy: 0, wang: 0, fx: o.fx, fy: o.fy }; K.swing(c, pl.q, pl.side);
    const b = { gx: c.gx - pl.side * .5, gy: c.gy - 2, wang: c.wang - (one ? pl.side * S.kick : 0), fx: c.fx, fy: c.fy };
    if (r >= S.rebound && K.ownReturn(pl.side)) {
      const u = clamp01((r - S.rebound) / S.recover), w = 1 - ease(u), h = { fx: o.fx, fy: o.fy }, p = { fx: o.fx, fy: o.fy };
      K.swing(h, .55, pl.side); K.swing(p, .55 + .45 * u, pl.side);
      let da = b.wang - h.wang; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
      o.gx = p.gx + (b.gx - h.gx) * w; o.gy = p.gy + (b.gy - h.gy) * w; o.wang = p.wang + da * w; o.eyes = 'angry';
      if (one) { o.fx = p.fx + (b.fx - h.fx) * w; o.fy = p.fy + (b.fy - h.fy) * w; }
      return;
    }
    const [f, t, k] = r < S.rebound ? [c, b, ease(r / S.rebound)] : [b, base, ease(clamp01((r - S.rebound) / S.recover))];
    o.gx = lerp(f.gx, t.gx, k); o.gy = lerp(f.gy, t.gy, k); o.wang = lerp(f.wang, t.wang, k); o.eyes = 'angry';
    if (one) { o.fx = lerp(f.fx, t.fx, k); o.fy = lerp(f.fy, t.fy, k); }
  }

  /* What the foe looks like at el: its pose, its feet, which way it faces, its squash, whether it
     is still behind the line (and clipped to above it), the hole's opening, and what it leaves.
     Struck by a blade it holds its brace for the exit's hitPose ms after the hit, then takes its hit
     pose; struck by a shot it takes its hit pose at once. */
  function foeAt(el, pl) {
    const N = FOE.enter, X = pl.exit, HFL = V.HFL, F = pl.F, L = pl.burrow ? HFL : pl.lineAt(pl.x), deep = L + F.h + 12;
    const st = { pose: 'climb', x: pl.x, y: deep, face: -pl.side, sx: 1, sy: 1, behind: true, show: el >= N.rise[0], hole: 0, fx: [] };
    if (pl.burrow) st.hole = ease(segQ(el, N.open[0], N.open[1]));
    if (el < N.peek[0]) st.y = lerp(deep, L + N.peekBelow, ease(segQ(el, N.rise[0], N.rise[1])));
    else if (el < N.hop[0]) st.y = L + N.peekBelow + (Math.floor(el / 110) % 2);
    else if (el < N.hop[1]) {
      const q = segQ(el, N.hop[0], N.hop[1]), top = L - N.hopOver;
      st.y = q < .5 ? lerp(L + N.peekBelow, top, ease(q * 2)) : lerp(top, HFL, (q - .5) * 2 * (q - .5) * 2);
      st.behind = q < .5;
    } else { st.y = HFL; st.behind = false; st.pose = 'stand'; }
    if (el >= N.land[0] && el < N.land[1]) { const k = Math.sin(segQ(el, N.land[0], N.land[1]) * Math.PI); st.sy = 1 - N.squash[0] * k; st.sx = 1 + N.squash[1] * k; }
    if (el >= N.taunt[0] && el < N.taunt[1]) st.pose = Math.floor((el - N.taunt[0]) / N.tauntFrame) % 2 ? 'taunt1' : 'taunt0';
    // a foe that fires aims in place of its taunt
    if (F.fires && el >= FOE.fires.aim && el < N.taunt[1]) st.pose = 'aim';
    if (el >= N.brace && el < pl.hit) st.pose = 'brace';
    if (el < pl.hit) return st;
    const r = el - pl.hit;
    st.pose = !pl.shot && r < X.hitPose ? 'brace' : 'hit';
    const k = Math.sin(segQ(r, 0, X.squash[0]) * Math.PI); st.sy = 1 - X.squash[1] * k; st.sx = 1 + X.squash[2] * k;
    if (r < X.impact) st.fx.push({ kind: 'impact', x: pl.touch[0], y: pl.touch[1] - 2 });
    if (r >= X.gone) st.show = false;
    if (r >= X.cloud && r < X.cloud + P.CLOUD_MS) st.fx.push({ kind: 'cloud', x: pl.x, y: HFL - F.mid, el: r - X.cloud });
    if (r >= X.sparkles && r < X.sparkles + P.SPARKLE_MS) st.fx.push({ kind: 'sparkles', x: pl.x, y: HFL - F.mid, el: r - X.sparkles });
    if (pl.burrow) st.hole = 1 - ease(segQ(r, X.close[0], X.close[1]));
    return st;
  }

  /* A foe that fires: its one shot, made at FOE.fires.fire, from its muzzle as drawn (fires.muzzle
     is given as the foe is drawn facing left, and mirrors with it), in the shot's kind and colours.
     o is the watcher's pose as it stands at that moment. With a shield carried and the foe on its
     side, the left, since the shield is always in the left hand, the shot stops at the shield's
     face (KW.knight.shieldFace), on its edge nearest the foe, FOE.fires.face of the way down, with
     the spark. Otherwise it misses: aimed FOE.fires.over above the corner of the head group nearest
     the foe, as drawn (KW.knight.headBox), and carried on along that line until it is off the
     screen, with no burst. A foe on the right with a shield carried misses as with none, the known
     limit of a shield always on the left. The shot comes back with stop, whether the shield stopped it, and pass, the moment it
     stops there or, for a miss, reaches the point it was aimed at: at once for a tracer or a beam,
     when the bolt gets there for a bolt. */
  function foeShotOf(pl, o, t0) {
    const FI = FOE.fires, fi = pl.F.fires, st = foeAt(FI.fire, pl), sg = st.face > 0 ? -1 : 1;
    const from = [Math.round(st.x) + sg * st.sx * fi.muzzle[0], Math.round(st.y) + st.sy * fi.muzzle[1]], t = t0 + FI.fire;
    const shot = { kind: fi.shot.kind, colour: fi.shot.colour, flash: fi.shot.flash, from, t0: t };
    const sf = pl.side < 0 && K.shieldFace ? K.shieldFace(o) : null;
    if (sf) {
      const to = [Math.round(sf[0]), Math.round(sf[1] + sf[3] * FI.face)];
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      return Object.assign(shot, { to, burst: FI.spark, stop: true, pass: t + (fi.shot.kind === 'bolt' ? len / SHOT.speed : 0) });
    }
    const hb = K.headBox(o), aim = [pl.side > 0 ? hb[2] : hb[0], hb[1] - FI.over];
    const len = Math.hypot(aim[0] - from[0], aim[1] - from[1]) || 1, u = [(aim[0] - from[0]) / len, (aim[1] - from[1]) / len];
    // carried on to the screen's edge, and past it by the picture's sway and the bolt's streak
    const m = 8 + SHOT.streak, out = (p, v, lo, hi) => (v > 0 ? (hi + m - p) / v : v < 0 ? (lo - m - p) / v : Infinity);
    const far = Math.max(len, Math.min(out(from[0], u[0], V.HL, V.HR), out(from[1], u[1], V.HT, V.HH)));
    const to = [Math.round(from[0] + u[0] * far), Math.round(from[1] + u[1] * far)];
    return Object.assign(shot, { to, burst: 0, stop: false, aim, pass: t + (fi.shot.kind === 'bolt' ? len / SHOT.speed : 0) });
  }
  /* The foe's shot at el in the event that began at t0, on the watcher's pose o, which the strike or
     the shot has posed for el, and o0, the pose before them: from FOE.fires.fire, while the foe has
     not yet been hit, the shot is made once, from the watcher as the event poses it at that moment,
     and as it passes or stops the watcher flinches, eyes wide for FOE.fires.flinch. Nothing else of
     the watcher changes. */
  function foeFires(o, o0, el, pl, t0) {
    const FI = FOE.fires;
    if (!pl.F.fires || el < FI.fire || pl.hit <= FI.fire) return null;
    const r = shoot('foe-fires|' + Math.round(t0), () => {
      const p = Object.assign({}, o0, { t: t0 + FI.fire });
      if (pl.shot) foeShot(p, FI.fire, pl, t0); else strike(p, FI.fire, pl);
      return foeShotOf(pl, p, t0);
    });
    const k = t0 + el - r.pass;
    if (k >= 0 && k < FI.flinch) o.eyes = 'wide';
    return r;
  }

  /* Clips to above the line: for each column x from x0 to x1, from the top down to lineAt(x). */
  function clipAbove(lineAt, x0, x1) {
    main.beginPath(); let run = x0, y = lineAt(x0);
    for (let x = x0 + 1; x <= x1 + 1; x++) { const yy = x <= x1 ? lineAt(x) : NaN; if (yy !== y) { main.rect(run, V.HT, x - run, y - V.HT); run = x; y = yy; } }
    main.clip();
  }
  /* The hole and the foe, before the knight. */
  function foeHD(pl, st, el) {
    if (pl.burrow) { P.holeHD(pl.x, V.HFL, st.hole); P.clodsHD(pl.x, V.HFL, el - FOE.enter.open[0]); }
    if (!st.show) return;
    const F = pl.F, cv = F.pose(st.pose), [ax, ay] = F.anchor;
    main.save();
    if (st.behind) clipAbove(pl.lineAt, Math.round(st.x - ax), Math.round(st.x + ax));
    main.translate(Math.round(st.x), Math.round(st.y)); main.scale((st.face > 0 ? -1 : 1) * st.sx, st.sy); main.drawImage(cv, -ax, -ay);
    main.restore();
  }
  /* What the foe leaves by, after the knight. */
  function foeFxHD(pl, st) {
    for (const f of st.fx) {
      if (f.kind === 'impact') P.poofHD(f.x, f.y);
      else if (f.kind === 'cloud') P.cloudHD(f.x, f.y, f.el, pl.F.h);
      else if (f.kind === 'sparkles') P.sparklesHD(f.x, f.y, f.el, pl.F.h);
    }
  }

  /* ---- Devices in their places --------------------------------------------------------
     Each scene names its places in its places field (docs/page.md): the pie's, three high ones
     for cameras (h1 to h3) and three on the ground for every other device (g1 to g3). KW.state
     puts each device in one. The still part of each device, with the pole a high place may have, is
     painted once into a small canvas of its own, kept by place, kind and state, and drawn with one
     call where the scene's draw reaches its places, so the scene's drawing order stays as it was.
     Only what moves is drawn each frame: the pie's steam and a device's lamp, whose loop starts at
     a different moment in each place. The question mark over every gone device blinks, whether or not
     it alerts, and is kept in a canvas of its own too. The still part's canvas is 144 wide with 136
     above the base and 32 below it, room for the ground class's box, [-66, -93, 56, 2]. A place in front of the ground line (front) is drawn by the
     engine after the knight, and a place with flip shows its device the other way round. */
  const ORDER = ['pie', 'h1', 'h2', 'h3', 'g1', 'g2', 'g3'], PHASE_MS = 523;
  const SPRITES = new Map(), SPRITE_MAX = 64;
  /* The kinds of device: KW.kinds, which the world's prop set fills (world.js), or the code's own,
     KW.props.KINDS, on a page without the compiler. A kind neither knows is drawn as box. */
  const kindsNow = () => KW.kinds || P.KINDS;
  const kindName = k => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(kindsNow(), k) ? k : 'box');

  /* A wooden pole from the foot of a camera's wall plate down to foot, for a high place with
     nothing to mount on. */
  function poleHD(x, y, foot) {
    const len = foot - (y - 40) + 1;
    D.rrect(x + 23, y - 40, 9, len, 2, C.K); D.rrect(x + 25, y - 40, 5, len - 2, 1, [[.3, C.N0], [.7, C.N1], [1, C.N2]]);
    Rh(x + 21, foot - 3, 13, 4, C.K); Rh(x + 23, foot - 2, 9, 2, C.N2);
  }

  /* A canvas of w by h at (ox, oy) on the grid, painted once by paint() with the grid's
     coordinates, mirrored about x when flip is set. */
  function cached(key, ox, oy, w, h, flip, x, paint) {
    let sp = SPRITES.get(key);
    if (!sp) {
      if (SPRITES.size >= SPRITE_MAX) SPRITES.clear();
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const c = cv.getContext('2d'), was = D.getCtx();
      if (flip) c.setTransform(-1, 0, 0, 1, 2 * x - ox, -oy); else c.setTransform(1, 0, 0, 1, -ox, -oy);
      D.setCtx(c); alpha(1); paint(); D.setCtx(was);
      sp = { cv, ox, oy }; SPRITES.set(key, sp);
    }
    return sp;
  }

  function placeHD(name, pl, dv, t) {
    const kind = kindName(dv.kind), k = kindsNow()[kind], ctx = D.getCtx(), foot = pl.pole || 0;
    const ox = pl.x - 72, oy = pl.y - 136, h = Math.max(168, foot - oy + 8);
    // a kind from a pack is kept apart from the code's drawing of it, and from another compile's
    const sp = cached([pl.x, pl.y, pl.flip ? 'flip' : '', foot, k.from ? kind + '@' + k.from : kind, dv.ok ? 'up' : 'gone'].join('|'), ox, oy, 144, h, pl.flip, pl.x, () => {
      if (foot) poleHD(pl.x, pl.y, foot);
      k.draw(pl.x, pl.y, 0, dv.ok, 'still');
    });
    ctx.drawImage(sp.cv, sp.ox, sp.oy);
    const tt = t + Math.max(0, ORDER.indexOf(name)) * PHASE_MS;
    if (pl.flip) { ctx.save(); ctx.transform(-1, 0, 0, 1, 2 * pl.x, 0); k.draw(pl.x, pl.y, tt, dv.ok, 'moving'); ctx.restore(); }
    else k.draw(pl.x, pl.y, tt, dv.ok, 'moving');
    if (!dv.ok && Math.floor(t / 400) % 2) {
      const my = pl.y - k.mark, m = cached('mark|' + pl.x + ',' + my, pl.x - 32, my - 8, 64, 80, false, pl.x, () => SP.mark(pl.x, my, '?'));
      ctx.drawImage(m.cv, m.ox, m.oy);
    }
  }

  /* Draws the devices in the scene's places, those behind the knight (front false) or those in
     front of it (front true). */
  function placesHD(t, s, front) {
    const places = s.places; if (!places) return;
    for (const dv of s.devices) {
      const pl = dv && places[dv.place];
      if (pl && !pl.front === !front) placeHD(dv.place, pl, dv, t);
    }
  }

  /* The address's pl=1: every place's box outlined and named, for reviewing where they stand.
     The outer box is the place's, its w by h above the base; the inner one is its class's box,
     what a device may fill; the base is the white line. The pie's place is white, high places blue and
     ground places amber; a place in front of the knight has a broken outline. */
  const GLYPHS = { P: '111101111100100', H: '101101111101101', G: '111100101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111' };
  const CLASS_COLOUR = { pie: C.W, high: '#7fe9ff', ground: '#ffb000' };
  function outlineHD(s) {
    const places = s.places; if (!places) return;
    for (const name of ORDER) {
      const pl = places[name]; if (!pl) continue;
      const c = CLASS_COLOUR[pl.cls] || C.W, x0 = pl.x - pl.w / 2, y0 = pl.y - pl.h;
      const line = (x, y, w, h) => { if (!pl.front) { Rh(x, y, w, h, c); return; } for (let k = 0; k < Math.max(w, h); k += 12) Rh(x + (w > h ? k : 0), y + (w > h ? 0 : k), w > h ? Math.min(6, w - k) : w, w > h ? h : Math.min(6, h - k), c); };
      const box = (x, y, w, h, k) => { line(x, y, w, k); line(x, y + h - k, w, k); line(x, y, k, h); line(x + w - k, y, k, h); };
      const cb = CLASS_BOX[pl.cls] || CLASS_BOX.ground, cx0 = pl.flip ? -cb[2] : cb[0], cx1 = pl.flip ? -cb[0] : cb[2];
      box(x0, y0, pl.w, pl.h, 2); box(pl.x + cx0, pl.y + cb[1], cx1 - cx0, cb[3] - cb[1], 1); Rh(x0 - 6, pl.y - 1, pl.w + 12, 3, C.W);
      const label = name === 'pie' ? 'P' : name.toUpperCase();
      Rh(x0 + 3, y0 + 3, 4 + label.length * 12, 19, C.K);
      for (let n = 0; n < label.length; n++) for (let j = 0; j < 15; j++) if (GLYPHS[label[n]][j] === '1') Rh(x0 + 5 + n * 12 + (j % 3) * 3, y0 + 5 + Math.floor(j / 3) * 3, 3, 3, c);
    }
  }

  KW.devices = {
    /* For a scene's draw: the devices behind the knight. */
    draw(t, s) { placesHD(t, s, false); },
    /* The x of a place with a device in it, or null. */
    placeX(s, name) { const pl = s.places && name ? s.places[name] : null; return pl && s.devices.some(dv => dv && dv.place === name) ? pl.x : null; }
  };

  /* A scene's still part is painted once into its own canvas and kept until the key changes, the
     screen changes shape, or what the world draws changes (KW.world.changes: the world started
     again, or a part of a pack gave way to its code copy, perhaps while this canvas was being
     painted, which the count taken before the painting catches). */
  const worldChanges = () => (KW.world && typeof KW.world.changes === 'number' ? KW.world.changes : 0);
  function backdrop(key, sc, s, sway) {
    const n = worldChanges();
    if (bgCache.key !== key || bgCache.changes !== n) {
      bgCache.cv.width = V.LW + 32; bgCache.cv.height = V.LH; const c = bgCache.cv.getContext('2d');
      D.setCtx(c); c.setTransform(1, 0, 0, 1, V.X0 + 16, V.Y0); sc.paint(s); D.setCtx(main); bgCache.key = key; bgCache.changes = n;
    }
    main.setTransform(1, 0, 0, 1, 0, 0); main.drawImage(bgCache.cv, sway - 16, 0);
  }

  function draw(t) {
    const { HL, HR, HT, HH, HFL } = V, freeze = frozen();
    const inp = E.input, w = inp.w, scene = sceneOf(w, t), sc = KW.scenes[scene], devices = inp.devices || [];
    // a new scene starts with no flies, no catch, no shot and nothing waiting, so nothing spills into it
    if (scene !== curScene) { if (curScene) { flies.length = 0; swat = null; ev = null; fadeAt = t; catches.length = 0; leaving.length = 0; pendingFlies = 0; petFree = -1e9; clearShots(); } curScene = scene; kx = +(KW.hooks.kx || sc.spot) * U; round = { i: 0, arr: 0 }; }
    const serious = w.lv >= 3, inBed = !!sc.bed && (w.id === 'night' || w.id === 'container_unhealthy');
    if (serious) leaveAll(t);
    // the pet's spot: a catch worked out from another spot in this scene (by the bed, or not) is
    // worked out again from here, from now
    const pet = petNow(), spot = pet ? spotOf(pet, scene, sc, w) : null;
    if (catches.some(k => k.sp !== spot)) {
      let free = t;
      for (let i = 0; i < catches.length; i++) {
        const k = catches[i];
        if (!spot) { catches.splice(i--, 1); continue; }
        if (k.sp === spot) { free = Math.max(free, k.end); continue; }
        if (t >= k.hitAt) { k.end = Math.min(k.end, t); k.sp = spot; continue; }
        catches[i] = catchPlan(k.f, pet, spot, scene, free); free = catches[i].end;
      }
      petFree = catches.length ? Math.max(t, catches[catches.length - 1].end) : petFree;
    }
    const funOK = !serious && !!sc.outdoors;
    const o = K.pose(w.id, t, !!w.mem); o.floor = HFL;
    o.helmet = inp.helmet === 'on' ? true : inp.helmet === 'off' ? false : sc.helmet !== false;
    if (sc.sword === false) o.sword = false;
    if (ev && (serious || !hosts(scene, ev.type))) ev = null;

    // strolling, and what each spot is for
    const free = w.lv < 3 || w.id === 'disk_full';
    let here = null;
    if (sc.rounds && free && !inBed && w.lv !== 2 && w.id !== 'backup_overdue' && w.id !== 'pi_silent') {
      here = stroll(sc.rounds, t, o, !!ev || !!swat, sc);
      if (here) {
        const el = here.el;
        if (here.act === 'look') o.look = [0, -1, 0, 1][Math.floor(el / 2600) % 4];
        if (here.act === 'sniff') { o.look = 1; if (Math.floor(el / 2400) % 2) { o.eyes = 'happy'; o.mouth = 'smile'; } }
        if (here.act === 'yawn') { const c = el % 6500; if (c > 3800 && c < 5600) { o.eyes = 'closed'; o.mouth = 'o'; } }
      }
    }
    const pt = inp.patron || {};
    const s = { w, devices, places: sc.places || null, tv: inp.tv, kx, o, here, inBed, helmOff: inBed || o.helmet === false, strike: false, dx: 0,
      patron: { id: pt.id || 'a', skin: pt.skin || null, hair: pt.hair || null, robe: pt.robe || null } };
    // a device down: the knight stays put and looks towards its place, or straight ahead
    // when it is not drawn
    if (w.id === 'device_down') { const px = KW.devices.placeX(s, w.place); o.look = px === null ? 0 : Math.sign(px - kx); }
    // running hot with a weapon that fires, the watcher walks to where it shoots at the target from,
    // and the scene's act fires once it is there
    const hotX = w.id === 'cpu_hot' ? practiceX(sc) : null;
    if (hotX !== null && Math.abs(hotX - kx) > 2) { if (!freeze) kx += Math.sign(hotX - kx) * 1.5; s.kx = kx; o.walk = true; }
    // the acts aim on the rig, so the watcher stands at its x before they play
    o.x = kx;
    if (sc.act) sc.act(t, s);
    // an act may move the knight off its spot for the frame by s.dx (the smithy's walks), worked
    // out from t alone; kx, the spot and everything the scene counts from it stay where they are
    o.x = kx + (s.dx || 0);
    // a foe's event: where the foe stands and when the blade meets it, worked out on its first frame
    if (ev && ev.plan === undefined) ev.plan = EVENTS[ev.type].foe ? foePlan(ev.type, sc, s, o) : null;

    // the swat, the events. With time frozen a swat starts only from the address (sw=1), never by
    // itself, since one started by a frame would show only from the next.
    if (swat && swat.shots) {
      // the swat by shot (volleyAt), over when the last shot's return has ended
      const last = swat.shots[swat.shots.length - 1].t;
      if (!funOK || t - swat.t0 > last + VOLLEY.after[0] + VOLLEY.after[1]) { swat = null; lastSwat = t; while (pendingFlies > 0 && flies.filter(f => !f.dead).length < 8) { pendingFlies--; addFly(t); } }
      else { o.bob = 0; volleyAt(o, t); }
    } else if (swat) {
      const el = t - swat.t0, i = Math.floor(el / 900);
      if (!funOK || i >= swat.segs.length) { swat = null; lastSwat = t; while (pendingFlies > 0 && flies.filter(f => !f.dead).length < 8) { pendingFlies--; addFly(t); } }
      else {
        const dir = swat.segs[i], q = (el - i * 900) / 900, cutting = K.swing(o, q, dir);
        if (q >= .3) for (const f of flies) if (!f.dead && f.side === dir && t - f.born > 1300) { if (!cutting || o.wang * dir >= f.th - .15) { f.dead = t; f.at = flyPos(f, t); } }
        if (q > .7 && !flies.some(f => !f.dead && f.side === dir)) { o.eyes = 'happy'; o.mouth = 'smile'; }
      }
    } else if (!freeze && funOK && !ev && flies.some(f => !f.dead && t - f.born > 1300) && t - lastSwat > 30000) startSwat(t);
    let p = 0; const type = ev && ev.type;
    if (ev) { p = (t - ev.t0) / ev.dur; if (p >= 1) ev = null; }
    const live = ev ? type : null, el = ev ? t - ev.t0 : 0, crX = crateX(sc, kx);
    // a foe comes up from behind whatever the scene puts in its way, or out of the ground; the
    // knight stands still for it (no bob), glares, strikes and is pleased when it has gone
    const plan = ev ? ev.plan : null, foe = plan ? foeAt(el, plan) : null;
    if (plan) {
      o.bob = 0;
      if (el > FOE.strike.eyes) { o.eyes = 'angry'; o.look = plan.side; }
      const o0 = plan.F.fires ? Object.assign({}, o) : null;
      if (plan.shot) kx = foeShot(o, el, plan, ev.t0); else strike(o, el, plan);
      // a foe that fires: its shot, and the watcher's flinch
      if (o0) foeFires(o, o0, el, plan, ev.t0);
      if (el > plan.hit + plan.exit.pleased) { o.eyes = 'happy'; o.mouth = 'smile'; o.look = 0; }
    }
    if (live === 'crate') { o.look = -1; if (p < .6) o.eyes = 'wide'; else { o.eyes = 'happy'; o.mouth = 'smile'; } }
    if (live === 'feast') { o.eyes = 'happy'; o.mouth = 'chew'; o.food = 1; o.hearts = p > .25; }

    // draw, with a slow sway of the whole picture against burn-in
    const sway = freeze ? 0 : Math.round(Math.sin(t / 61000) * 8);
    const fine = () => main.setTransform(1, 0, 0, 1, V.X0 + sway, V.Y0);
    D.setCtx(main); main.setTransform(1, 0, 0, 1, 0, 0); main.imageSmoothingEnabled = false; alpha(1); main.fillStyle = '#000'; main.fillRect(0, 0, V.LW, V.LH);
    if (sc.paint) backdrop(scene + '|' + (sc.key ? sc.key(s) : ''), sc, s, sway);
    fine(); sc.draw(t, s); fine();
    if (foe) foeHD(plan, foe, el);
    if (live === 'crate') {
      const q = Math.min(1, p / .6), y = HT - 130 + (HFL - 50 - HT + 130) * q, x = crX + Math.sin(p * 14) * 15 * (1 - q);
      if (p < .9 || Math.floor(t / 110) % 2) { if (q < 1) P.chuteHD(x + 30, y); P.crateHD(x, y); }
    }
    // the weapon put away where the scene shows it at no rest place: its stowed view on the body
    if (o.sword === false && !restsWeapon(sc)) o.stowed = true;
    if (!inBed) K.draw(o);
    if (spot) petHD(pet, E.input.pet && E.input.pet.coat, petAt(spot, t));
    placesHD(t, s, true);
    const fly = critterNow();
    for (const f of flies) {
      if (!f.dead) { const [x, y] = flyPos(f, t); fly.draw(x, y, Math.floor(t / 90 + f.ph) % 2); }
      else { const a = t - f.dead; if (a < 260) P.poofHD(f.at[0], f.at[1]); if (a < 900) fly.dead(f.at[0], f.at[1] + a * a / 900); }
    }
    for (let i = flies.length - 1; i >= 0; i--) if (flies[i].dead && t - flies[i].dead > 1000) flies.splice(i, 1);
    // the pet's flies after the knight's, and the flies leaving under a warning
    for (const k of catches) {
      const p = preyAt(k, t);
      if (!p) continue;
      if (Array.isArray(p)) { fly.draw(p[0], p[1], Math.floor(t / 90 + k.f.ph) % 2); continue; }
      if (p.dead < PET.poof) P.poofHD(p.x, p.y);
      if (p.dead < PET.drop) fly.dead(p.x, p.y + p.dead * p.dead / 900);
    }
    for (let i = catches.length - 1; i >= 0; i--) if (t >= catches[i].end && t >= catches[i].hitAt + PET.drop + 100) catches.splice(i, 1);
    for (const l of leaving) { const [x, y] = leavingPos(l, t); fly.draw(x, y, Math.floor(t / 90 + l.ph) % 2); }
    for (let i = leaving.length - 1; i >= 0; i--) if (t - leaving[i].t0 > PET.leave) leaving.splice(i, 1);
    shotsHD(t);
    if (foe) foeFxHD(plan, foe);
    if (w.id === 'attack') { alpha(.08 + .07 * Math.sin(t / 220)); Rh(HL, HT, HR - HL, HH - HT + 20, D.C.R1); alpha(1); }
    if (w.id === 'night' && inBed) { alpha(.5); Rh(HL, HT, HR - HL, HH - HT + 20, '#000'); alpha(1); }
    if (sc.over) { fine(); sc.over(t, s); fine(); }
    if (KW.hooks.pl) outlineHD(s);
    const fd = 1 - (t - fadeAt) / 420; if (fd > 0 && !freeze) { alpha(fd); Rh(HL, HT, HR - HL, HH - HT + 20, '#000'); alpha(1); }
    // the review bar's note on the flies: the knight's swat, and the pet's hunt, the pet named as
    // the world's words name it (the cat), lower case
    const hunting = catches.some(k => t < k.hitAt), knights = flies.some(f => !f.dead);
    const knightNote = !knights ? '' : !funOK ? 'flies wait: ' + (serious ? 'a warning is up' : 'indoors')
      : swat ? 'swatting' : 'next swat in ' + Math.max(0, Math.ceil((30000 - (t - lastSwat)) / 1000)) + ' s';
    const hunt = hunting ? petWord() + ' is hunting' : '';
    E.note = [knightNote, hunt].filter(Boolean).join('; ') || (leaving.length ? 'flies leave: a warning is up' : 'no flies');
  }

  Object.assign(E, {
    EVENTS, TURNS, sceneOf, hosts,
    /* The foe player's parts, for the tests: the tables, where a foe stands, when the blade meets
       it, the plan of an event, the strike on a pose and the foe at a moment. */
    crateX, CLASS_BOX,
    foe: { FOE, spot: foeSpot, gaps: foeGaps, contactQ, bladeOf, bandGap, bladeGap, crownNear, plan: foePlan, strike, at: foeAt, shotPlan, shot: foeShot, fires: foeFires, shotOf: foeShotOf },
    init(ctx) { main = ctx; D.setCtx(ctx); },
    draw, addFly, startSwat, fireEvent,
    /* The shots of a weapon that fires: the timings, shoot(key, make) as described above, the
       shots kept now, their drawing at t, and clear(). */
    shots: { SHOT, shoot, live: () => Array.from(shots.values()), draw: shotsHD, clear: clearShots,
      // the acts' timings, the swat's plan and practice, for the scenes' acts and the tests
      VOLLEY, PRACTICE, volleyPlan, practice, practiceX, swat: () => swat },
    /* The scene on screen now. */
    scene: () => curScene,
    /* Starts the quiet scenes' turns again from the first, from time t. */
    restartTurns(t) { sceneT0 = t; },
    /* Forgets the cached backdrop, after the screen changes shape. */
    invalidate() { bgCache.key = ''; },
    /* Clears the flies, the swat, any event, the shots and the scene, when the page turns to live
       data, so the first live scene comes in without a fade. */
    reset() { flies.length = 0; swat = null; ev = null; pendingFlies = 0; curScene = ''; catches.length = 0; leaving.length = 0; petFree = -1e9; clearShots(); },
    /* The pet's catches and the flies leaving, for the tests. */
    pet: { PET, catches: () => catches.slice(), leaving: () => leaving.slice(), pending: () => pendingFlies, flies: () => flies.slice(), at: petAt, prey: preyAt, plan: catchPlan, now: petNow }
  });
})(window.KW);
