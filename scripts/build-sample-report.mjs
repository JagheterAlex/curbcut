// Produce the sample audit report published at /sample-report.pdf.
//
// The €290 audit is the only thing anybody can buy here, and until now a buyer
// could read a description of the deliverable and nothing else. Every other
// claim on this site is backed by something you can look at — the scanner runs
// in the browser, the study publishes its data, the example report is a real
// run — and the one thing with a price attached was the exception.
//
// So the sample is a real run too, produced by the same code path a paying
// customer's report comes out of: scan, analyse, write the PDF. Three pages of
// the demo shop rather than one, because a report of a single page shows
// nothing about how a multi-page result is grouped, and that grouping is most
// of what the service adds over the free scanner.
//
// Scanned locally and relabelled to the public /demo/ addresses. robots.txt
// disallows /demo/, which is what stops the release gate failing on pages that
// exist to fail; crawling them over the network would mean either ignoring our
// own robots rule or printing that admission across the sample.
//
//   node scripts/build-sample-report.mjs

import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanUrls } from '../src/scan.js';
import { analyze } from '../src/analyze.js';
import { writePdf } from '../src/pdf.js';
import { draftStatement } from '../src/statement.js';
import { demoHash } from './demo-hash.mjs';
import {
  DEMO_PAGE, DEMO_CSS, DEMO_FRAME, DEMO_PRODUCTS, DEMO_CONTACT,
} from '../monitor/src/demo.js';

const PORT = 8797;
const PUBLIC = 'https://curbcut.org';
const OUT_PDF = fileURLToPath(new URL('../site/sample-report.pdf', import.meta.url));
// A PDF cannot carry a fingerprint anywhere a test can read it, so the
// fingerprint lives beside it. Without this the sample would go on describing
// a shop the demo no longer is, which is the same failure the example fixture
// already has a guard against.
const OUT_META = fileURLToPath(new URL('./sample-report.meta.json', import.meta.url));
// Not published as a bare .md — a browser either downloads it or renders it as
// unstyled plain text, and neither is a good look for something offered as part
// of what somebody pays for. It is written next to the business notes so the
// draft can be read and checked before a real one goes to a customer.
const OUT_STATEMENT = fileURLToPath(
  new URL('../../business/sample-statement.md', import.meta.url)
);

const routes = {
  '/demo/broken.html': ['text/html; charset=utf-8', DEMO_PAGE],
  '/demo/products.html': ['text/html; charset=utf-8', DEMO_PRODUCTS],
  '/demo/contact.html': ['text/html; charset=utf-8', DEMO_CONTACT],
  '/demo/broken.css': ['text/css; charset=utf-8', DEMO_CSS],
  '/demo/frame.html': ['text/html; charset=utf-8', DEMO_FRAME],
};

// Named, not crawled. The demo pages link out to real pages of this site that
// the little server above does not have, and a crawl would scan those 404s and
// report a shop with no page titles. An explicit list cannot drift into that.
const PAGES = ['/demo/broken.html', '/demo/products.html', '/demo/contact.html'];

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const hit = routes[pathname];
  if (!hit) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': hit[0] }).end(hit[1]);
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

try {
  const pages = await scanUrls(PAGES.map((p) => `http://127.0.0.1:${PORT}${p}`));

  const broken = pages.filter((p) => p.error);
  if (broken.length) {
    throw new Error('pages did not load: ' + broken.map((p) => p.url).join(', '));
  }

  const noCss = pages.flatMap((p) => (p.assetProblems ?? []).filter((a) => a.url.endsWith('.css')));
  if (noCss.length) {
    throw new Error(
      'a stylesheet did not load, so contrast and target size would be ' +
        'measured on an unstyled page: ' + noCss.map((a) => a.url).join(', ')
    );
  }

  for (const p of pages) p.url = PUBLIC + new URL(p.url).pathname;

  const analysis = analyze(pages);
  if (analysis.findings.length < 3) {
    throw new Error('the demo shop came back nearly clean, so the sample shows nothing');
  }

  await writePdf(
    analysis,
    {
      target: PUBLIC + '/demo/',
      scannedUrls: pages.map((p) => p.url),
      orgName: 'Example Store (a demonstration, not a real company)',
    },
    OUT_PDF
  );

  writeFileSync(
    OUT_STATEMENT,
    draftStatement(analysis, {
      site: PUBLIC + '/demo/',
      name: 'Example Store',
      email: 'hello@example.invalid',
      country: 'Ireland',
    }),
    'utf8'
  );

  const s = analysis.summary;
  writeFileSync(
    OUT_META,
    JSON.stringify(
      {
        demoHash: demoHash(),
        generatedAt: new Date().toISOString().slice(0, 10),
        pages: pages.length,
        clausesFailingHarmonised: s.clausesFailingHarmonised,
        elements: s.totalElements,
      },
      null,
      2
    ) + `
`
  );

  console.log(
    `wrote site/sample-report.pdf — ${pages.length} pages, ` +
      `${s.clausesFailingHarmonised} clauses, ${s.totalElements} elements`
  );
  console.log('wrote business/sample-statement.md');
} finally {
  server.close();
}
