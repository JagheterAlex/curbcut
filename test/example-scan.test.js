import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoHash } from '../scripts/demo-hash.mjs';
import { DEMO_PAGE, DEMO_CSS, DEMO_FRAME } from '../monitor/src/demo.js';
import { exampleResult } from '../monitor/src/scan-pages.js';

const fixture = JSON.parse(
  readFileSync(new URL('../monitor/src/example-scan.json', import.meta.url), 'utf8')
);

// The example is the first complete output most visitors will see, and it is a
// fixture rather than a live run. A fixture that no longer matches the page it
// claims to describe is worse than no example: it is a demonstration of a tool
// producing an answer to a question nobody asked.

test('the example describes the page that is actually served', () => {
  assert.equal(
    fixture.demoHash,
    demoHash(),
    'demo.js changed without rerunning `node scripts/build-example.mjs`'
  );
});

test('the page broken on purpose is still broken', () => {
  assert.ok(fixture.analysis.findings.length >= 4);
  const clauses = fixture.analysis.findings.map((f) => f.clause);
  // Name, Role, Value is the point of the exercise: 64% of the study's sites
  // failed it, and it is Level A.
  assert.ok(clauses.includes('9.4.1.2'));
  // The one WCAG 2.2 criterion a scanner can reach. Without it the transition
  // section of the example has nothing concrete to show.
  assert.ok(
    clauses.includes('9.2.5.8'),
    'target size dropped out, so the example no longer demonstrates the transition'
  );
});

test('the example says it is an example, before anything else', () => {
  const html = exampleResult(fixture);
  const marker = 'This is an example, not your site';
  assert.ok(html.includes(marker));
  assert.ok(
    html.indexOf(marker) < html.indexOf('<h1>'),
    'a reader who takes the example for their own result has been misled'
  );
});

test('the example is dated when it was measured, not when it is read', () => {
  const html = exampleResult(fixture);
  assert.ok(html.includes(fixture.scannedAt.slice(0, 10)));
  assert.ok(
    !html.includes(new Date().toISOString().slice(0, 10)) ||
      fixture.scannedAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
    'the example must not re-date itself to today'
  );
});

test('the demo page warns a reader before the broken markup starts', () => {
  assert.ok(DEMO_PAGE.includes('This page is broken on purpose'));
  assert.ok(
    DEMO_PAGE.indexOf('broken on purpose') < DEMO_PAGE.indexOf('class="wrap"'),
    'the warning has to come first in the source, which is the order it is read in'
  );
  assert.match(DEMO_PAGE, /noindex/);
  // Belt and braces: robots.txt is what actually keeps the release gate's crawl
  // from failing on a page whose whole purpose is to fail.
  const robots = readFileSync(new URL('../site/robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /^Disallow: \/demo\//m);
});

test('the demo carries no inline style or script for the policy to block', () => {
  // Everything here is served under `style-src 'self'`. An inline style would
  // silently not apply, and the failures that depend on layout — contrast,
  // target size — would stop being failures.
  for (const [name, source] of [['page', DEMO_PAGE], ['frame', DEMO_FRAME]]) {
    assert.ok(!/<style[\s>]/i.test(source), name + ' has an inline <style>');
    assert.ok(!/\sstyle="/i.test(source), name + ' has a style attribute');
    assert.ok(!/<script[\s>]/i.test(source), name + ' has a script');
  }
  assert.ok(DEMO_CSS.includes('.social'), 'the stylesheet carries the layout instead');
});
