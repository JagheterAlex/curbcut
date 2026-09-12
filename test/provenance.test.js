import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyze.js';
import { markdownReport } from '../src/report.js';
import { provenanceOf } from '../src/scan.js';
import { compareAnalyses, describeComparison } from '../src/baseline.js';
import { readFileSync } from 'node:fs';
import { TOOL } from '../src/version.js';
import { clauseForCriterion } from '../src/en301549.js';

// Raised by a reader of the first article, from experience with e-invoicing
// rule packs: a helper returned the version declared on disk instead of the one
// the run actually used, so the output named a rule set no request had executed.
// The same shape of bug here would put a false version on the conformance claim
// itself, which is the line a regulator reads first.

const prov = (tags, version = '4.13.0') => ({
  engine: 'axe-core', engineVersion: version, ruleTags: [...tags].sort(),
});

const page = (provenance, violations = []) => ({
  url: 'https://example.test/', provenance, violations, incomplete: [],
});

const v = (id, tags) => ({
  id, help: id, helpUrl: 'x', impact: 'serious', tags,
  nodes: [{ target: ['a'], html: '<a></a>', failureSummary: '' }],
});

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

test('provenance comes from axe, not from our own constants', () => {
  const p = provenanceOf({
    testEngine: { name: 'axe-core', version: '4.13.0' },
    toolOptions: { runOnly: { type: 'tag', values: ['wcag2aa', 'wcag2a'] } },
  });
  assert.equal(p.engine, 'axe-core');
  assert.equal(p.engineVersion, '4.13.0');
  assert.deepEqual(p.ruleTags, ['wcag2a', 'wcag2aa'], 'sorted, so two runs compare');
});

test('a run that executed rules beyond the cited version says so', () => {
  const a = analyze([page(prov(TAGS))]);
  assert.deepEqual(a.provenance.executedBeyondStandard, ['wcag22a', 'wcag22aa']);

  const md = markdownReport(a, { target: 'x' });
  assert.match(md, /Evaluated by:\*\* axe-core 4\.13\.0/);
  assert.match(md, /executed rules beyond V3\.2\.1/);

  // And the notice sits above the findings, not after them.
  assert.ok(
    md.indexOf('executed rules beyond') < md.indexOf('## Findings'),
    'the caveat has to arrive before the thing it qualifies'
  );
});

test('a run confined to the cited version raises nothing', () => {
  const a = analyze([page(prov(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']))]);
  assert.deepEqual(a.provenance.executedBeyondStandard, []);
  assert.doesNotMatch(markdownReport(a, {}), /executed rules beyond/);
});

test('pages assessed by different tooling invalidate the version line', () => {
  const a = analyze([
    page(prov(TAGS, '4.13.0')),
    page(prov(TAGS, '4.9.0')),
  ]);
  assert.equal(a.provenance.consistent, false);
  assert.match(markdownReport(a, {}), /not all assessed the same way/);
});

test('a baseline from different tooling is not silently comparable', () => {
  const before = analyze([page(prov(['wcag2a', 'wcag2aa']), [v('image-alt', ['wcag2a', 'wcag111'])])]);
  const after = analyze([page(prov(TAGS))]);

  const diff = compareAnalyses(before, after);
  assert.equal(diff.tooling.comparable, false);
  assert.match(diff.tooling.reason, /rule tags added: wcag21a, wcag21aa, wcag22a, wcag22aa/);

  const text = describeComparison(diff);
  assert.match(text, /not assessed the same way/);
  // The fixed clause would otherwise read as somebody's work.
  assert.ok(text.indexOf('not assessed the same way') < text.indexOf('No longer failing'));
});

test('identical tooling compares without a caveat', () => {
  const before = analyze([page(prov(TAGS), [v('image-alt', ['wcag2a', 'wcag111'])])]);
  const after = analyze([page(prov(TAGS))]);
  const diff = compareAnalyses(before, after);
  assert.equal(diff.tooling.comparable, true);
  assert.doesNotMatch(describeComparison(diff), /not assessed the same way/);
});

test('a baseline predating provenance gets a note, not an alarm', () => {
  const before = analyze([{ url: 'x', violations: [v('image-alt', ['wcag2a', 'wcag111'])], incomplete: [] }]);
  const after = analyze([page(prov(TAGS))]);
  const diff = compareAnalyses(before, after);

  assert.equal(diff.tooling.comparable, true);
  assert.equal(diff.tooling.unknown, true);
  const text = describeComparison(diff);
  assert.match(text, /recorded no engine version/);
  assert.doesNotMatch(text, /not assessed the same way/);
});

// The band a finding lands in is decided by a constant compiled into each
// release, not by the clock: the same run of the same version produces the same
// answer on 29 November and on 1 December, and the bands move only when
// somebody installs the release that moves them. That is what makes a dated
// report reproducible, and it only works if the report says which release
// produced it.
test('the report says which build produced it, and it matches the package', () => {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  assert.equal(TOOL.name, pkg.name);
  assert.equal(
    TOOL.version,
    pkg.version,
    'src/version.js drifted from package.json — the Worker cannot read package.json, ' +
      'so the copy is hardcoded and this is what keeps it honest'
  );
});

test('nothing in the standard model consults the clock', () => {
  // A tool that re-banded itself overnight would make two reports from the same
  // version disagree with no way to tell why, and would flip on a scheduled
  // date whether or not the Official Journal actually published.
  const source = readFileSync(new URL('../src/en301549.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now\(\)|new Date\(\)/.test(source));

  const before = clauseForCriterion('2.5.8');
  assert.equal(before.inHarmonised, false);
  assert.equal(before.inIncoming, true);
});
