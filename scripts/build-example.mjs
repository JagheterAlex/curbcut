// Produce the example scan shown at /scan/example.
//
// The example has to be a real result. Hand-writing one would mean the page
// most likely to be a visitor's first impression of the tool is the one page
// the tool never produced — and the first time the analysis changed, the
// example would quietly start lying about what the scanner does.
//
// So: serve the deliberately broken page from monitor/src/demo.js locally, scan
// it with the same code the CLI runs, and write the analysis to a fixture the
// Worker renders. Costs no browser budget at request time and cannot drift
// silently, because the fixture carries a hash of the page it describes and a
// test fails when they disagree.
//
//   node scripts/build-example.mjs
//
// Rerun it whenever demo.js changes. The test will tell you if you forget.

import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { scanUrls } from '../src/scan.js';
import { analyze } from '../src/analyze.js';
import { DEMO_PAGE, DEMO_CSS, DEMO_FRAME, DEMO_PAGE_URL } from '../monitor/src/demo.js';
import { demoHash } from './demo-hash.mjs';

const PORT = 8791;
const OUT = new URL('../monitor/src/example-scan.json', import.meta.url);

// The same paths the Worker serves. If these drift, the page is scanned without
// its stylesheet and the failures that depend on layout — contrast, target size
// — quietly stop being failures. Which is the exact trap the study excluded 34
// sites for, so the guard below refuses to write a fixture built that way.
const routes = {
  '/demo/broken.html': ['text/html; charset=utf-8', DEMO_PAGE],
  '/demo/broken.css': ['text/css; charset=utf-8', DEMO_CSS],
  '/demo/frame.html': ['text/html; charset=utf-8', DEMO_FRAME],
};

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const hit = routes[pathname];
  if (!hit) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': hit[0] }).end(hit[1]);
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

try {
  const local = `http://127.0.0.1:${PORT}/demo/broken.html`;
  const pages = await scanUrls([local]);

  if (pages[0].error) throw new Error('the demo page did not load: ' + pages[0].error);

  const missing = (pages[0].assetProblems ?? []).filter((p) => p.url.endsWith('.css'));
  if (missing.length) {
    throw new Error(
      'the stylesheet did not load (' + missing.map((m) => m.url + ': ' + m.reason).join('; ') +
        '), so contrast and target size would be measured on an unstyled page'
    );
  }

  // Scanned locally, presented as the address visitors will see. The findings
  // are unchanged; only the label on them differs.
  pages[0].url = DEMO_PAGE_URL;

  const analysis = analyze(pages);
  if (analysis.findings.length === 0) {
    throw new Error(
      'the page broken on purpose came back clean, which means the defects in ' +
        'demo.js stopped being defects. Fix the page, not this script.'
    );
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        // Not a timestamp of this run. The example is a fixture; dating it
        // "now" every rebuild would put a fresh date on an old measurement,
        // which is exactly the habit the product argues against.
        scannedAt: pages[0].scannedAt,
        demoHash: demoHash(),
        analysis,
      },
      null,
      2
    ) + '\n'
  );

  const clauses = analysis.findings.map((f) => f.clause).join(', ');
  console.log(
    `wrote example-scan.json — ${analysis.findings.length} clause(s): ${clauses}`
  );
} finally {
  server.close();
}
