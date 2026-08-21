// Copies the axe-core browser bundle in as a text module.
//
// The Worker cannot use createRequire to reach axe-core's `.source` the way the
// Node CLI does, so the bundle is vendored at build time and imported as text.
// Doing it in a script rather than by hand means the version can never drift
// from what package.json pins.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const pkg = JSON.parse(
  readFileSync(join(root, 'node_modules/axe-core/package.json'), 'utf8')
);
const source = readFileSync(join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');

writeFileSync(join(root, 'vendor/axe.min.txt'), source, 'utf8');
writeFileSync(
  join(root, 'vendor/axe-version.json'),
  JSON.stringify({ version: pkg.version, vendoredAt: new Date().toISOString() }, null, 2),
  'utf8'
);

console.log('vendored axe-core ' + pkg.version + ' (' + Math.round(source.length / 1024) + ' KB)');
