/* Knightwatcher's website: the night sky over each page, and the live demo's frame on the landing
   page. No request leaves the site. site/README.md describes the site. */
'use strict';

/* The night sky, drawn in big pixels: the battlement's banded sky, seeded stars, a crescent moon,
   two ridges and a far tower with one lit window. It is redrawn when the width changes. */
(function () {
  const cv = document.getElementById('skycv');
  if (!cv) return;
  const g = cv.getContext('2d');
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let lastW = 0;
  function draw() {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const P = r.width < 640 ? 2 : 3, W = Math.ceil(r.width / P), H = Math.ceil(r.height / P);
    if (W === lastW && cv.height === H) return; lastW = W;
    cv.width = W; cv.height = H;
    const bands = ['#010207', '#03050e', '#060a19', '#0a1024'];
    bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, Math.floor(H * i / 4), W, Math.ceil(H / 4) + 1); });
    const R = rng(7), n = Math.round(W * H / 170);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(R() * W), y = Math.floor(R() * H * .8), b = R();
      g.fillStyle = b > .85 ? '#ffffff' : b > .5 ? '#c9d3ea' : '#59627d';
      g.fillRect(x, y, 1, 1);
      if (b > .965) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1); }
    }
    // the moon, a crescent cut by a second disc
    const mx = Math.round(W * (W < 260 ? .84 : .82)), my = Math.round(H * (W < 260 ? .26 : .42)), mr = W < 260 ? 9 : 12;
    for (let y = -mr; y <= mr; y++) for (let x = -mr; x <= mr; x++) {
      const d = Math.hypot(x, y); if (d > mr) continue;
      if (Math.hypot(x - mr * .45, y + mr * .35) < mr * .92) continue;
      g.fillStyle = d < mr * .55 ? '#fffbe0' : d < mr * .85 ? '#fff3a0' : '#e2d17a'; g.fillRect(mx + x, my + y, 1, 1);
    }
    // two ridges, the far one darker
    [[11, '#060916', .3, 34], [23, '#0a0e1f', .18, 22]].forEach(([seed, col, amp, step]) => {
      const Q = rng(seed); g.fillStyle = col; let h = H * amp * .6;
      for (let x = 0; x < W; x += 2) {
        if (x % step === 0) h = Math.max(4, Math.min(H * amp, h + (Q() - .5) * H * amp * .9));
        g.fillRect(x, Math.floor(H - h), 2, Math.ceil(h));
      }
    });
    // a far tower, left of middle, with a lit window
    const tx = Math.round(W * .16), th = Math.round(H * .34), tw = W < 260 ? 10 : 14;
    g.fillStyle = '#0a0e1f'; g.fillRect(tx, H - th, tw, th);
    for (let i = 0; i < 3; i++) g.fillRect(tx + i * Math.round(tw / 2.4), H - th - 3, Math.round(tw / 4), 3);
    g.fillStyle = '#f7b733'; g.fillRect(tx + Math.round(tw / 2) - 1, H - th + 6, 2, 3);
  }
  draw();
  addEventListener('resize', draw);
})();

/* The demo's frame: the display's page, /demo/?demo, drawn at 1280 by 800 and scaled to the
   frame's width, so it keeps its own layout at every size and is letterboxed on an upright phone.
   Full screen puts the frame itself in full screen. Open the settings sets the frame's hash to one
   with set=knight, which the page's own listener takes up without a reload (docs/display.md). */
(function () {
  const screen = document.getElementById('screen'), frame = document.getElementById('demoframe');
  if (!screen || !frame) return;
  function fit() { frame.style.transform = 'scale(' + (screen.clientWidth / 1280) + ')'; }
  fit();
  if (window.ResizeObserver) new ResizeObserver(fit).observe(screen); else addEventListener('resize', fit);

  document.getElementById('b-full').addEventListener('click', () => {
    const f = frame.requestFullscreen || frame.webkitRequestFullscreen;
    if (f) { const p = f.call(frame); if (p && p.catch) p.catch(() => {}); }
  });

  document.getElementById('b-set').addEventListener('click', () => {
    // the frame is the site's own, so its address can be read and set; a frame that cannot be
    // reached does nothing
    let w = null;
    try { w = frame.contentWindow; if (typeof w.location.hash !== 'string') return; } catch (e) { return; }
    const rest = w.location.hash.slice(1).split('&').filter(kv => kv && !kv.startsWith('set='));
    w.location.hash = rest.concat('set=knight').join('&');
    frame.focus();
  });
})();
