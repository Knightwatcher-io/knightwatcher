#!/usr/bin/env node
// Writes the carrier of each pack that ships with the page: web/packs/NAME.pack.js beside
// web/packs/NAME.pack.json, one line that pushes the pack file's text onto KW.packText.
//
//   node tools/pack-carrier.js                 every web/packs/*.pack.json
//   node tools/pack-carrier.js FILE.pack.json  that file only
//
// A page opened from disk can run a script but cannot fetch a JSON file, so the page loads each
// shipped pack through its carrier and reads the text exactly as it would read a fetched file.
// The carrier holds the file's text unchanged, as one JavaScript string; JSON.stringify writes a
// string literal that reads back to the same text, whatever the file holds. Run this after every
// change to a pack file. tests/tools/pack-carrier.test.js checks that every carrier matches its
// file. docs/packs.md describes the format.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PACKS = path.join(__dirname, '..', 'web', 'packs');
const SUFFIX = '.pack.json';

/* The carrier for a pack file's text. */
const carrier = text => 'KW.packText.push(' + JSON.stringify(text) + ');\n';
/* Where the carrier of a pack file goes. */
const carrierPath = file => file.slice(0, -SUFFIX.length) + '.pack.js';
/* Every pack file under web/packs/, by name. */
const packFiles = (dir = PACKS) => fs.readdirSync(dir).filter(f => f.endsWith(SUFFIX)).sort().map(f => path.join(dir, f));

function main(args) {
  const files = args.length ? args : packFiles();
  for (const file of files) {
    if (!file.endsWith(SUFFIX)) throw new Error(file + ': a pack file\'s name ends in ' + SUFFIX);
    const text = fs.readFileSync(file, 'utf8');
    try { JSON.parse(text); } catch (e) { throw new Error(file + ': not valid JSON: ' + e.message); }
    fs.writeFileSync(carrierPath(file), carrier(text));
    console.log('wrote ' + path.relative(process.cwd(), carrierPath(file)));
  }
}

module.exports = { carrier, carrierPath, packFiles, PACKS };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('pack-carrier: ' + e.message); process.exit(1); }
}
