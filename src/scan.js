import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = require('axe-core').source;

// Only the tags that map onto the harmonised standard, plus WCAG 2.2, which is
// reported separately. `best-practice` is excluded: those rules are opinions
// about good markup, and mixing them into a conformance report is how tools end
// up crying wolf.
const RULE_TAGS = [
  'wcag2a', 'wcag2aa',
  'wcag21a', 'wcag21aa',
  'wcag22aa',
];

export async function scanUrls(urls, options = {}) {
  const {
    viewport = { width: 1280, height: 800 },
    timeout = 30000,
    waitUntil = 'networkidle',
    onProgress = () => {},
  } = options;

  const browser = await chromium.launch();
  const pages = [];

  try {
    const context = await browser.newContext({ viewport });

    for (const url of urls) {
      onProgress(url);
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil, timeout });
        await page.addScriptTag({ content: axeSource });
        const results = await page.evaluate(
          (tags) => window.axe.run(document, {
            runOnly: { type: 'tag', values: tags },
            resultTypes: ['violations', 'incomplete'],
          }),
          RULE_TAGS
        );
        pages.push({
          url,
          title: await page.title(),
          violations: results.violations,
          incomplete: results.incomplete,
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
