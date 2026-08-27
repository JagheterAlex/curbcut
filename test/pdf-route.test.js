import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reportFilename } from '../monitor/src/report-name.js';
import { pdfHtml } from '../src/pdf-html.js';
import { scanResult } from '../monitor/src/scan-pages.js';
import { reportExpired } from '../monitor/src/pages.js';

const fixture = JSON.parse(
  readFileSync(new URL('../monitor/src/example-scan.json', import.meta.url), 'utf8')
);

// The result page used to end by telling the reader to install Node. The person
// that page is written for has just been asked by a customer whether their site
// meets EN 301 549; they are not going to install a runtime to answer it.

test('the result page offers the PDF without a terminal', () => {
  const html = scanResult(fixture.analysis, {
    target: 'https://example.com/checkout',
    scannedAt: fixture.scannedAt,
  });
  assert.match(html, /\/scan\/report\.pdf\?u=/);
  // The address has to survive being put in a query string intact.
  assert.match(html, /u=https%3A%2F%2Fexample\.com%2Fcheckout/);
});

test('the web report is the same document the command line writes', () => {
  // Both sides import this from one module, so this checks the wiring rather
  // than the wording: if the Worker ever grows its own copy of the report, this
  // is what notices.
  const html = pdfHtml(fixture.analysis, {
    target: 'https://example.com',
    generatedAt: fixture.scannedAt,
  });
  assert.match(html, /EN 301 549 conformance findings/);
  // The limit belongs in the document itself, not only on the website around
  // it: the PDF is the part that gets forwarded to somebody who never saw the
  // site.
  assert.match(html, /30 to 40 percent/);
});

test('the filename says which site and which day', () => {
  assert.equal(
    reportFilename('https://www.example.com/checkout', '2026-08-27T10:00:00.000Z'),
    'curbcut-example.com-2026-08-27.pdf'
  );
  // Nothing a stranger types can escape into the Content-Disposition header.
  assert.equal(
    reportFilename('https://ex"ample.com/a', '2026-08-27T10:00:00.000Z'),
    'curbcut-example.com-2026-08-27.pdf'
  );
  assert.equal(
    reportFilename('not a url at all', '2026-08-27T10:00:00.000Z'),
    'curbcut-report-2026-08-27.pdf'
  );
});

test('an expired result is refused rather than quietly re-scanned', () => {
  const html = reportExpired('https://example.com');
  assert.match(html, /expired/i);
  // The refusal has to say why, because "you could have just re-run it" is the
  // obvious objection and the answer to it is the whole point.
  assert.match(html, /different set of findings under the date/);
  assert.match(html, /Check it again/);
});
