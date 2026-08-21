import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyze.js';
import { markdownReport } from '../src/report.js';
import { pdfHtml } from '../src/pdf.js';

// A page whose stylesheet did not arrive renders unstyled, and an unstyled page
// fails layout-dependent rules the real page passes. Reporting those as findings
// would be inventing failures, which is the thing this product exists to argue
// against. Found for real: a scan of our own site during a deploy reported 16
// target-size failures that vanished on the next run.
const pageWith = (problems) => ({
  url: 'https://example.com/',
  violations: [],
  incomplete: [],
  assetProblems: problems,
  scannedAt: new Date().toISOString(),
});

test('a failed stylesheet becomes a warning on the analysis', () => {
  const a = analyze([pageWith([{ url: 'https://example.com/style.css', reason: 'HTTP 404' }])]);
  assert.equal(a.assetWarnings.length, 1);
  assert.equal(a.assetWarnings[0].url, 'https://example.com/');
  assert.equal(a.assetWarnings[0].problems[0].reason, 'HTTP 404');
});

test('a clean load produces no warning', () => {
  const a = analyze([pageWith([])]);
  assert.equal(a.assetWarnings.length, 0);
});

test('the warning reaches the markdown report, above the findings', () => {
  const a = analyze([pageWith([{ url: 'https://example.com/style.css', reason: 'HTTP 404' }])]);
  const md = markdownReport(a, { target: 'https://example.com/' });
  assert.match(md, /may not be trustworthy/i);
  assert.match(md, /style\.css/);
  assert.ok(
    md.indexOf('may not be trustworthy') < md.indexOf('## Findings'),
    'the reader must see it before the findings, not after'
  );
});

test('the warning reaches the PDF', () => {
  const a = analyze([pageWith([{ url: 'https://example.com/app.js', reason: 'request failed' }])]);
  const html = pdfHtml(a, { target: 'https://example.com/' });
  assert.match(html, /may not be trustworthy/i);
  assert.match(html, /app\.js/);
});

test('a report with nothing missing says nothing about assets', () => {
  const md = markdownReport(analyze([pageWith([])]), { target: 'https://example.com/' });
  assert.ok(!/trustworthy/i.test(md));
});
