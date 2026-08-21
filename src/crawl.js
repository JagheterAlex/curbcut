import { chromium } from 'playwright';
import { runAxe, browserMissingError, watchAssets, provenanceOf } from './scan.js';
import { parseRobots } from './robots.js';

// Whole-site crawling.
//
// Two rules shape this file. It stays on one origin, because a conformance
// claim covers a service you control and not whatever you link to. And it obeys
// robots.txt, because a tool that lectures people about compliance has no
// business ignoring the one machine-readable instruction a site gives crawlers.

const SKIP_EXTENSIONS = new Set([
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico', '.bmp',
  '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.mov', '.avi',
  '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.rss', '.atom',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dmg', '.pkg', '.deb', '.rpm',
]);

/** Strip the fragment and any trailing slash, so /a, /a/ and /a#top are one page. */
export function normaliseUrl(raw, base) {
  let u;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.href;
}

function hasSkippedExtension(url) {
  const path = new URL(url).pathname.toLowerCase();
  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  return SKIP_EXTENSIONS.has(path.slice(dot));
}

async function fetchRobots(origin, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: controller.signal });
    // Anything other than a served file means "no restrictions stated".
    if (!res.ok) return parseRobots('');
    return parseRobots(await res.text());
  } catch {
    return parseRobots('');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Crawl one origin, scanning every page as it goes.
 *
 * Discovery and scanning share a single browser pass: a page is loaded once,
 * axe runs on it, and its links are harvested from the same DOM. Loading every
 * page twice to do those separately would double the load on a site we do not
 * own.
 */
export async function crawlAndScan(startUrl, options = {}) {
  const {
    maxPages = 200,
    viewport = { width: 1280, height: 800 },
    timeout = 30000,
    waitUntil = 'networkidle',
    respectRobots = true,
    onProgress = () => {},
    onSkip = () => {},
  } = options;

  const start = normaliseUrl(startUrl, startUrl);
  if (!start) throw new Error(`Not a usable URL: ${startUrl}`);
  const origin = new URL(start).origin;

  const robots = respectRobots
    ? await fetchRobots(origin, timeout)
    : { isAllowed: () => true };

  const queue = [start];
  const seen = new Set([start]);
  const pages = [];
  const skipped = [];

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    const friendly = browserMissingError(err);
    throw friendly ?? err;
  }
  try {
    const context = await browser.newContext({ viewport });

    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift();
      onProgress(url, pages.length + 1);

      const page = await context.newPage();
      const assetProblems = watchAssets(page);
      try {
        await page.goto(url, { waitUntil, timeout });
        const results = await runAxe(page);
        const hrefs = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'), (a) => a.getAttribute('href'))
        );

        pages.push({
          url,
          title: await page.title(),
          provenance: provenanceOf(results),
          violations: results.violations,
          incomplete: results.incomplete,
          assetProblems,
          scannedAt: new Date().toISOString(),
        });

        for (const href of hrefs) {
          if (!href) continue;
          const next = normaliseUrl(href, url);
          if (!next || seen.has(next)) continue;
          if (new URL(next).origin !== origin) continue;
          if (hasSkippedExtension(next)) continue;

          if (!robots.isAllowed(new URL(next).pathname)) {
            seen.add(next);
            skipped.push({ url: next, reason: 'robots.txt' });
            onSkip(next, 'robots.txt');
            continue;
          }

          seen.add(next);
          queue.push(next);
        }
      } catch (err) {
        pages.push({ url, error: err.message, scannedAt: new Date().toISOString() });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return {
    pages,
    skipped,
    // Anything still queued when we hit the cap. Reported so a conformance
    // claim never silently covers less of the site than the reader assumes.
    notReached: queue.length,
    reachedLimit: queue.length > 0,
  };
}
