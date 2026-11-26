// The checks knight.test.js makes of the base pack's free items of 1.4.0, on the Classic build: the
// frame-by-frame arm check with every new weapon, shield, sleeve and glove, every free item in every
// pose, the grips and the mace's glow on the anvil; and the crossbow of 1.5.0 in every pose, aimed and
// fired, cold on the anvil. They run in a process of their own, one for each build, beside
// knight.test.js. Run with: node --test 'tests/web/**/*.test.js'
'use strict';
process.env.KNIGHT_PART = 'free:build.a';
require('./knight.test.js');
