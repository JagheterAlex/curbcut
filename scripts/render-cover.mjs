// Render an article cover from its HTML source.
//
//   node scripts/render-cover.mjs ../business/launch/cover/cover-04.html [out.png]
//
// Every article ships with a cover and every cover was, until now, rendered by
// hand and then never again. That is fine until a fact on the cover has to
// change: on 18 September the microenterprise test on cover-04 said "under 10
// staff and EUR 2m" while the article it fronts had just been corrected to say
// the money limb is either/or. The cover is the first thing a reader sees, so a
// cover that contradicts its article is worse than no cover.
//
// Size is fixed here rather than passed in. 1000x420 at deviceScaleFactor 2 is
// what the covers are designed against and what dev.to wants; a flag would only
// let a future caller render one at the wrong size.

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [srcArg, outArg] = process.argv.slice(2);
if (!srcArg) {
  console.error('usage: node scripts/render-cover.mjs <cover.html> [out.png]');
  process.exit(2);
}

const src = resolve(srcArg);
if (!existsSync(src)) {
  console.error('no such file: ' + src);
  process.exit(2);
}
const out = resolve(outArg ?? src.replace(/\.html$/i, '.png'));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 420 },
    deviceScaleFactor: 2,
  });
  await page.goto(pathToFileURL(src).href, { waitUntil: 'load' });
  // Web fonts and the SVG mark resolve after load. Without this the first
  // render came out in the fallback face often enough to be a real risk.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  console.log('wrote ' + out + ' (2000x840)');
} finally {
  await browser.close();
}
