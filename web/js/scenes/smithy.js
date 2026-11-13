/* Knightwatch scene: the smithy, still on the coarse grid. The scene for an update, where the
   knight hammers his greatsword on the anvil. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props;
  const { R, spr, tline, alpha, glow, ease, fill } = D;

  /* The hammer rises slowly and falls fast, once every 1.3 seconds, and a progress bar fills. */
  function act(t, s) {
    const o = s.o, c = (t % 1300) / 1300; o.sword = false;
    o.hammer = c < .55 ? 1 - ease(c / .55) : Math.pow((c - .55) / .45, 3); s.strike = c > .93 || c < .06; o.progress = (t % 9000) / 9000; if (s.strike) o.eyes = 'closed';
  }

  function draw(t, s) {
    const { L, RR, TP, RW, H, FL, U } = V, kx = s.kx / U;
    fill('#120d0b');
    for (let y = FL - 80; y < FL; y += 14) R(L, y, RW, 1, '#1a1310');
    // tools on the wall, the quench barrel
    R(22, FL - 62, 2, 16, 'n'); R(19, FL - 65, 8, 5, 'd'); tline(36, FL - 64, 40, FL - 46, 1, 'd'); tline(42, FL - 64, 38, FL - 46, 1, 'd');
    for (const x of [54, 66]) { R(x, FL - 62, 2, 8, 'd'); R(x + 6, FL - 62, 2, 8, 'd'); R(x, FL - 64, 8, 2, 'd'); }
    R(20, FL - 16, 18, 16, 'n'); R(21, FL - 16, 16, 16, 'N'); R(20, FL - 12, 18, 1, 'd'); R(20, FL - 4, 18, 1, 'd'); R(22, FL - 17, 14, 2, 'B');
    R(48, FL - 12, 16, 2, 'N'); R(50, FL - 10, 2, 10, 'n'); R(60, FL - 10, 2, 10, 'n'); P.pie(50, FL - 17, t, s.piOK);
    // the forge
    R(152, TP, 34, FL - 56 - TP, '#241512'); for (let k = 0; k < 8; k++) R(152 - k, FL - 56 + k, 34 + k * 2, 1, '#241512');
    R(146, FL - 40, RR - 146, 40, '#3a1d16'); for (let y = FL - 34; y < FL; y += 7) R(146, y, RR - 146, 1, '#24120e');
    R(154, FL - 32, 28, 15, 'K'); const f = Math.floor(t / 170) % 2;
    R(156, FL - 22, 24, 5, f ? 'R' : 'G'); R(158, FL - 24, 8, 2, 'G'); R(170, FL - 24, 6, 2, f ? 'G' : 'Y'); glow(168, FL - 24, 44, 'R', .12 + .03 * Math.sin(t / 140));
    R(L, FL, RW, H - FL, '#231a15'); R(L, FL, RW, 1, '#3a2a20');
    // the anvil, the greatsword across it
    R(120, FL - 8, 14, 8, 'd'); R(123, FL - 13, 8, 5, 'd'); R(113, FL - 18, 28, 5, 's'); R(107, FL - 17, 6, 3, 's'); R(113, FL - 18, 28, 1, 'S');
    P.greatsword(kx + 10, FL - 21, Math.PI / 2);
    alpha(.5); R(kx + 48, FL - 24, 14, 6, 'G'); alpha(1);
    if (s.strike) for (let i = 0; i < 4; i++) spr(kx + 18 + i * 5 + (i % 2) * 3, FL - 30 - i * 3, SP.STAR);
  }

  KW.scenes.smithy = { grid: 'coarse', spot: 88, helmet: false, act, draw };
})(window.KW);
