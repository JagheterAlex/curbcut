// Scanning inside a Worker, through the Browser Rendering binding.
//
// The analysis is deliberately not reimplemented here. `analyze`, the clause
// map and the risk model are imported from the same modules the command line
// tool uses, so the web scanner and the CLI can never disagree about what a
// finding means. Only the part that drives a browser differs.

import puppeteer from '@cloudflare/puppeteer';
import axeSource from '../vendor/axe.min.txt';
import { analyze } from '../../src/analyze.js';
import { parseRobots } from '../../src/robots.js';

// Same rule set as the CLI. `best-practice` stays out: those are opinions about
// markup, and mixing them into a conformance report is how tools cry wolf.
// Must match src/scan.js exactly. If the web scanner and the command line tool
// run different rule sets they will disagree about the same page, and the whole
// claim that one is the other in a browser stops being true.
// `wcag2a-obsolete` is excluded on purpose; see the note in src/scan.js.
const RULE_TAGS = [
  'wcag2a', 'wcag2aa',
  'wcag21a', 'wcag21aa',
  'wcag22a', 'wcag22aa',
];

const NAV_TIMEOUT_MS = 25000;

/** Hostnames and address literals a public scanner has no business fetching. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal',
]);

function isPrivateAddress(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;

  // IPv4 literals in ranges that are not routable on the public internet.
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;   // link-local, cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    return false;
  }

  // IPv6 loopback, unique-local and link-local.
  if (h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

/**
 * Validate a URL somebody typed into a form.
 *
 * Returns either { url } or { error } with a sentence a person can act on.
 * Error strings are deliberately plain: this is the first thing most visitors
 * will see go wrong.
 */
export function validateTarget(raw) {
  if (!raw || typeof raw !== 'string') {
    return { error: 'Enter the address of a page to check.' };
  }
  let text = raw.trim();
  if (!text) return { error: 'Enter the address of a page to check.' };
  if (text.length > 2000) return { error: 'That address is too long to be real.' };

  // People type example.com, not https://example.com.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = 'https://' + text;

  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'That does not look like a web address.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'Only http and https addresses can be checked.' };
  }
  if (!url.hostname.includes('.')) {
    return { error: 'That address has no domain name in it.' };
  }
  if (isPrivateAddress(url.hostname)) {
    return {
      error:
        'That address is on a private network, so a scanner running on the ' +
        'public internet cannot reach it. Use the command line tool for ' +
        'anything behind a firewall — it runs on your own machine.',
    };
  }

  url.hash = '';
  return { url: url.href };
}

/** Ask the target's robots.txt whether we are welcome. Fails open. */
export async function robotsAllows(targetUrl) {
  const origin = new URL(targetUrl).origin;
  try {
    const res = await fetch(origin + '/robots.txt', {
      headers: { 'user-agent': 'curbcut' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return true;
    const robots = parseRobots(await res.text());
    return robots.isAllowed(new URL(targetUrl).pathname);
  } catch {
    return true;
  }
}

/**
 * Load one page in a real browser and run axe against it.
 *
 * Throws with `status: 429` when the account is at its browser limit, so the
 * caller can tell the visitor to come back rather than show a stack trace.
 */
export async function scanOnePage(env, targetUrl) {
  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
  } catch (err) {
    if (err && err.status === 429) {
      const wait = err.headers?.get?.('Retry-After');
      const e = new Error('busy');
      e.code = 'BUSY';
      e.retryAfter = wait ? Number(wait) : 60;
      throw e;
    }
    throw err;
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    const response = await page.goto(targetUrl, { waitUntil: 'networkidle0' });
    const status = response ? response.status() : 0;
    if (status >= 400) {
      const e = new Error('http ' + status);
      e.code = 'TARGET_STATUS';
      e.status = status;
      throw e;
    }

    // Injected through the debugging protocol, not by appending a <script> to
    // the document, so a site with a strict Content Security Policy can still
    // be checked. See the longer note in src/scan.js — this must match it, or
    // the web scanner and the command line tool would disagree about which
    // sites are scannable at all.
    await page.evaluate(axeSource);
    const results = await page.evaluate(
      (tags) =>
        window.axe.run(document, {
          runOnly: { type: 'tag', values: tags },
          resultTypes: ['violations', 'incomplete'],
        }),
      RULE_TAGS
    );

    const title = await page.title();

    return analyze([
      {
        url: targetUrl,
        title,
        provenance: {
          engine: results.testEngine?.name ?? 'unknown',
          engineVersion: results.testEngine?.version ?? 'unknown',
          ruleTags: [...(results.toolOptions?.runOnly?.values ?? [])].sort(),
        },
        violations: results.violations,
        incomplete: results.incomplete,
        scannedAt: new Date().toISOString(),
      },
    ]);
  } finally {
    try {
      await browser.close();
    } catch {
      // A browser that failed to close is Cloudflare's problem, not the
      // visitor's. Never let it mask the real result.
    }
  }
}
