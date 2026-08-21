import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = require('axe-core').source;

// Only the tags that map onto the harmonised standard, plus WCAG 2.2, which is
// reported separately. `best-practice` is excluded: those rules are opinions
// about good markup, and mixing them into a conformance report is how tools end
// up crying wolf.
//
// `wcag2a-obsolete` is deliberately absent, and the reason is worth writing
// down because the opposite looks correct at first glance. It carries the
// duplicate-id rules for 4.1.1 Parsing, which EN 301 549 V3.2.1 still lists
// because it adopts WCAG 2.1 — so leaving the tag out looks like a gap in a
// required clause. It is not. W3C published errata on 21 September 2023 adding
// a note to WCAG 2.0 and 2.1 that 4.1.1 "should be considered as always
// satisfied for any content using HTML or XML". Running those rules would
// report failures of a criterion that cannot be failed.
//
// `wcag22a` has no rules today. It is listed so that the two level A criteria
// WCAG 2.2 adds are picked up the day axe ships a check for them.
const RULE_TAGS = [
  'wcag2a', 'wcag2aa',
  'wcag21a', 'wcag21aa',
  'wcag22a', 'wcag22aa',
];

// Playwright throws a wall of text when the browser binary is missing. For a
// first-time `npx curbcut` that is the likeliest failure there is, so it gets a
// plain sentence and the one command that fixes it.
export function browserMissingError(err) {
  const text = String(err && err.message ? err.message : err);
  if (!/Executable doesn.t exist|browserType\.launch|playwright install/i.test(text)) {
    return null;
  }
  return new Error(
    [
      'The headless browser is not installed yet.',
      '',
      '  npx playwright install chromium',
      '',
      'Curbcut drives a real browser so it sees the page the way a person does,',
      'including anything rendered by JavaScript. The download is a one-off.',
    ].join('\n')
  );
}

// A page whose stylesheet failed to arrive renders as unstyled text, and an
// unstyled page fails layout-dependent rules — target size above all — that the
// real page passes. Reporting those as findings would be inventing failures,
// which is the precise thing this tool exists to argue against. So the scanner
// watches what did not load and says so.
export function watchAssets(page) {
  const problems = [];
  const note = (url, reason) => {
    if (!/\.(css|js|mjs)(\?|$)/i.test(url)) return;
    if (problems.some((p) => p.url === url)) return;
    problems.push({ url, reason });
  };
  page.on('requestfailed', (req) => {
    const type = req.resourceType?.();
    if (type === 'stylesheet' || type === 'script') {
      note(req.url(), req.failure?.()?.errorText ?? 'request failed');
    } else {
      note(req.url(), 'request failed');
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400) note(res.url(), 'HTTP ' + res.status());
  });
  return problems;
}

// Runs axe inside an already-loaded page. Exported so the crawler can reuse the
// exact same rule set rather than keeping a second copy that drifts.
export async function runAxe(page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(
    (tags) => window.axe.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations', 'incomplete'],
    }),
    RULE_TAGS
  );
}

export { RULE_TAGS };

export async function scanUrls(urls, options = {}) {
  const {
    viewport = { width: 1280, height: 800 },
    timeout = 30000,
    waitUntil = 'networkidle',
    onProgress = () => {},
  } = options;

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    const friendly = browserMissingError(err);
    throw friendly ?? err;
  }
  const pages = [];

  try {
    const context = await browser.newContext({ viewport });

    for (const url of urls) {
      onProgress(url);
      const page = await context.newPage();
      const assetProblems = watchAssets(page);
      try {
        await page.goto(url, { waitUntil, timeout });
        const results = await runAxe(page);
        pages.push({
          url,
          title: await page.title(),
          violations: results.violations,
          incomplete: results.incomplete,
          assetProblems,
          scannedAt: new Date().toISOString(),
        });
      } catch (err) {
        pages.push({ url, error: err.message, scannedAt: new Date().toISOString() });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return pages;
}
