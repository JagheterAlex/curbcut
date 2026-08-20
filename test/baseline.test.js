import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAnalyses, describeComparison } from '../src/baseline.js';

const finding = (clause, priority, nodeCount, title = 'Something') =>
  ({ clause, priority, nodeCount, title });

const analysis = (findings, scannedPages = 4) => ({ findings, scannedPages });

test('a clause that stopped failing is reported as fixed', () => {
  const d = compareAnalyses(
    analysis([finding('9.1.1.1', 'P1', 3)]),
    analysis([])
  );
  assert.equal(d.fixed.length, 1);
  assert.equal(d.fixed[0].clause, '9.1.1.1');
  assert.equal(d.introduced.length, 0);
});

test('a clause that started failing is reported as introduced', () => {
  const d = compareAnalyses(
    analysis([]),
    analysis([finding('9.4.1.2', 'P1', 2)])
  );
  assert.equal(d.introduced.length, 1);
  assert.equal(d.introduced[0].priority, 'P1');
});

test('more elements on the same clause is a regression, not a new failure', () => {
  const d = compareAnalyses(
    analysis([finding('9.1.4.3', 'P3', 4)]),
    analysis([finding('9.1.4.3', 'P3', 11)])
  );
  assert.equal(d.regressed.length, 1);
  assert.equal(d.introduced.length, 0);
  assert.equal(d.regressed[0].wasNodeCount, 4);
  assert.equal(d.regressed[0].nodeCount, 11);
});

test('fewer elements on the same clause counts as improved, not fixed', () => {
  const d = compareAnalyses(
    analysis([finding('9.1.4.3', 'P3', 11)]),
    analysis([finding('9.1.4.3', 'P3', 2)])
  );
  assert.equal(d.improved.length, 1);
  assert.equal(d.fixed.length, 0, 'still failing is not fixed');
});

test('a clause moving to a worse band is a regression even with fewer elements', () => {
  const d = compareAnalyses(
    analysis([finding('9.2.4.4', 'P3', 9)]),
    analysis([finding('9.2.4.4', 'P1', 1)])
  );
  assert.equal(d.regressed.length, 1);
  assert.equal(d.regressed[0].wasPriority, 'P3');
  assert.equal(d.regressed[0].priority, 'P1');
});

test('an identical scan reports no change', () => {
  const same = [finding('9.1.1.1', 'P1', 3), finding('9.1.4.3', 'P3', 10)];
  const d = compareAnalyses(analysis(same), analysis(structuredClone(same)));
  assert.equal(d.changed, false);
  assert.equal(d.unchanged.length, 2);
  assert.equal(describeComparison(d), 'No change against the baseline.');
});

test('a new P1 is alarming, a new P4 is not', () => {
  const p1 = compareAnalyses(analysis([]), analysis([finding('9.1.1.1', 'P1', 1)]));
  const p4 = compareAnalyses(analysis([]), analysis([finding('9.9.9.9', 'P4', 1)]));
  assert.equal(p1.alarming, true);
  assert.equal(p4.alarming, false);
});

test('shrinking coverage is flagged, because fewer failures may mean fewer pages', () => {
  const d = compareAnalyses(
    analysis([finding('9.1.1.1', 'P1', 3)], 40),
    analysis([], 2)
  );
  assert.equal(d.coverage.shrank, true);
  assert.match(describeComparison(d), /provisional/);
  assert.match(describeComparison(d), /40 page\(s\) to 2/);
});

test('the summary leads with what broke, not with what was fixed', () => {
  const d = compareAnalyses(
    analysis([finding('9.1.4.3', 'P3', 4, 'Contrast')]),
    analysis([finding('9.4.1.2', 'P1', 2, 'Name, Role, Value')])
  );
  const text = describeComparison(d);
  assert.ok(text.indexOf('Newly failing') < text.indexOf('No longer failing'));
});

test('an empty baseline is treated as everything being new', () => {
  const d = compareAnalyses(undefined, analysis([finding('9.1.1.1', 'P1', 1)]));
  assert.equal(d.introduced.length, 1);
  assert.equal(d.fixed.length, 0);
});
