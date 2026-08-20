import { chromium } from 'playwright';
import { runAxe } from './scan.js';

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

/**
 * Minimal robots.txt parser. Handles the parts that actually appear in the
 * wild: User-agent grouping, Disallow, Allow, and the longest-match-wins rule
 * that the specification requires. Crawl-delay and wildcards beyond `*` and
 * `$` are deliberately out of scope, and we fail open rather than guess.
 */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!lastLineWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) continue;
    if (field === 'disallow' || field === 'allow') {
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }

  // Every group naming our agent applies, not just the first one. Real files
  // split rules across several blocks for the same agent — Cloudflare, for one,
  // prepends a managed `User-agent: *` block ahead of the site's own. Reading
  // only the first group silently ignored the site owner's actual rules.
  const named = groups.filter((g) => g.agents.includes('curbcut'));
  const matching = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'));

  const rules = matching.flatMap((g) => g.rules).filter((r) => r.path !== '');

  return {
    isAllowed(pathname) {
      let best = null;
      for (const rule of rules) {
        if (!matchesRobotsPath(rule.path, pathname)) continue;
        const weight = rule.path.replace(/[*$]/g, '').length;
        // Longest match wins; Allow beats Disallow at equal length.
        if (!best || weight > best.weight || (weight === best.weight && rule.allow)) {
          best = { weight, allow: rule.allow };
        }
      }
      return best ? best.allow : true;
    },
  };
}

function matchesRobotsPath(pattern, pathname) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*');
  let cursor = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '') continue;
    const at = i === 0 ? (pathname.startsWith(part) ? 0 : -1) : pathname.indexOf(part, cursor);
    if (at === -1) return false;
    cursor = at + part.length;
  }
  if (anchored) return cursor === pathname.length;
  return true;
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

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport });

    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift();
      onProgress(url, pages.length + 1);

      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil, timeout });
        const results = await runAxe(page);
        const hrefs = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'), (a) => a.getAttribute('href'))
        );

        pages.push({
          url,
          title: await page.title(),
          violations: results.violations,
          incomplete: results.incomplete,
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
