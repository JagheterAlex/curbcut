import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyze.js';
import { auditForm } from '../monitor/src/pages.js';
import { scanResult } from '../monitor/src/scan-pages.js';

// The scan result page used to end its €290 offer in a `mailto:` link. We
// watched that fail in person: the button opens a mail client nobody has set
// up, and the enquiry is gone. This is the highest-intent page on the site —
// somebody has just been shown their own failing clauses — so the tests below
// hold the shape of it in place rather than trusting a future edit not to
// reintroduce the same thing.

const analysisOf = (violations) =>
  analyze([
    {
      url: 'https://example.com/',
      violations,
      incomplete: [],
      assetProblems: [],
      scannedAt: new Date().toISOString(),
      testEngine: { name: 'axe-core', version: '4.13.0' },
      toolOptions: {
        runOnly: {
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
        },
      },
    },
  ]);

const linkName = {
  id: 'link-name',
  impact: 'serious',
  nodes: [{ target: ['a.icon'] }],
};

test('the audit offer on a scan result is a link to a form, not a mailto', () => {
  const html = scanResult(analysisOf([linkName]), { target: 'https://example.com/checkout' });
  assert.match(html, /href="\/audit\?site=/);
  assert.ok(
    !/mailto:[^"]*subject=Curbcut%20audit/.test(html),
    'the audit ask must not route through a desktop mail client'
  );
});

test('the result hands the audit page the site and the count it just found', () => {
  const html = scanResult(analysisOf([linkName]), { target: 'https://example.com/checkout' });
  const href = html.match(/href="(\/audit\?[^"]+)"/)[1].replace(/&amp;/g, '&');
  const params = new URL(href, 'https://curbcut.org').searchParams;
  assert.equal(params.get('site'), 'https://example.com');
  assert.equal(
    Number(params.get('clauses')),
    analysisOf([linkName]).summary.clausesFailingHarmonised
  );
});

test('the audit page prefills the address rather than asking for it twice', () => {
  const html = auditForm({ site: 'https://example.com', clauses: 3 });
  assert.match(html, /value="https:\/\/example\.com"/);
  assert.match(html, /3 failing/);
});

test('a site value cannot break out of the input it is placed in', () => {
  const html = auditForm({ site: '"><script>alert(1)</script>' });
  assert.ok(!html.includes('<script>alert(1)'), 'markup from the query string must be escaped');
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
});

test('with no scan behind it the page still offers the audit, without inventing a number', () => {
  const html = auditForm({});
  assert.ok(!/failing clause/.test(html), 'nothing was scanned, so nothing was found');
  assert.match(html, /up to 200 pages/);
});

// The rule from CLAUDE.md: limits are printed next to the result, not in small
// print at the end. A page selling a €290 report has to say on the page what
// the €290 does not buy.
test('the audit page says what it is not, on the page and not in a footnote', () => {
  const html = auditForm({ site: 'https://example.com', clauses: 3 });
  assert.match(html, /What this is not: a manual audit/);
  assert.match(html, /screen reader/i);
  assert.ok(
    html.indexOf('What this is not: a manual audit') <
      html.indexOf('Ask for a fixed price</button>'),
    'the limitation has to be read before the button, not after it'
  );
});
