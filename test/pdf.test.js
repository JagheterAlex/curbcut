import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfHtml } from '../src/pdf.js';

const analysis = {
  standard: { standard: 'EN 301 549', version: 'V3.2.1 (2021-03)', adoptsWcag: '2.1' },
  scannedPages: 1,
  errors: [],
  summary: { clausesFailing: 1, clausesFailingHarmonised: 1, totalElements: 2,
             byPriority: { P1: 1, P2: 0, P3: 0, P4: 0 } },
  manualOnly: [{ clause: '9.2.1.1', what: 'Keyboard operability', why: 'Needs a person.' }],
  coverageNote: 'Automated testing detects roughly 30 to 40 percent of WCAG failures.',
  findings: [{
    clause: '9.4.1.2', criterion: '4.1.2', title: 'Name, Role, Value', level: 'A',
    inHarmonised: true, notes: [], impact: 'critical', nodeCount: 2, pageCount: 1,
    priority: 'P1',
    rules: [{ id: 'label', help: 'Form elements must have labels',
              helpUrl: 'https://example.com',
              examples: [{ selector: 'input', page: 'https://example.com/',
                           html: '<input type="password">' }] }],
  }],
};

test('the report never calls itself a certificate', () => {
  const html = pdfHtml(analysis, { target: 'https://example.com' });
  assert.match(html, /it is not a certificate/i);
  assert.match(html, /not legal advice/i);
});

test('the coverage limit appears on the first page, not buried at the end', () => {
  const html = pdfHtml(analysis, { target: 'https://example.com' });
  const caveat = html.indexOf('roughly 30 to 40 percent');
  const findings = html.indexOf('<h2>Findings</h2>');
  assert.ok(caveat > -1 && caveat < findings, 'the limit must be stated before the findings');
});

test('clauses that were never checked are listed', () => {
  const html = pdfHtml(analysis, { target: 'https://example.com' });
  assert.match(html, /9\.2\.1\.1/);
  assert.match(html, /never assessed/i);
});

test('markup in a finding cannot break out of the document', () => {
  const nasty = structuredClone(analysis);
  nasty.findings[0].rules[0].examples[0].html = '</pre><script>alert(1)</script>';
  nasty.findings[0].title = '<img src=x onerror=alert(1)>';
  const html = pdfHtml(nasty, { target: 'https://example.com' });
  assert.ok(!html.includes('<script>'), 'script tags must be escaped');
  assert.ok(!html.includes('<img src=x'), 'attributes must be escaped');
  assert.match(html, /&lt;script&gt;/);
});

test('a clean scan still says why that is not an all-clear', () => {
  const clean = { ...analysis, findings: [],
    summary: { ...analysis.summary, clausesFailing: 0, clausesFailingHarmonised: 0,
               totalElements: 0, byPriority: { P1: 0, P2: 0, P3: 0, P4: 0 } } };
  const html = pdfHtml(clean, { target: 'https://example.com' });
  assert.match(html, /before drawing a conclusion/i);
});

test('pages that failed to load are reported rather than dropped', () => {
  const withErrors = { ...analysis, errors: [{ url: 'https://example.com/x', message: 'timeout' }] };
  const html = pdfHtml(withErrors, { target: 'https://example.com' });
  assert.match(html, /could not be scanned/i);
  assert.match(html, /has not been assessed/i);
});
