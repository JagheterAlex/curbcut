import { test } from 'node:test';
import assert from 'node:assert/strict';
import axe from 'axe-core';
import { analyze } from '../src/analyze.js';
import { INCOMING, INCOMING_CHANGES, clauseForCriterion } from '../src/en301549.js';

const violation = (id, tags, criterionHelp = 'x') => ({
  id, help: criterionHelp, helpUrl: 'x', impact: 'serious', tags,
  nodes: [{ target: ['a'], html: '<a></a>', failureSummary: '' }],
});

const pageWith = (...violations) => [{
  url: 'https://example.test/', violations, incomplete: [],
}];

test('a WCAG 2.2 criterion is not required today but is at citation', () => {
  const sc = clauseForCriterion('2.5.8');
  assert.equal(sc.inHarmonised, false);
  assert.equal(sc.inIncoming, true);
  assert.match(sc.notes.join(' '), /scheduled for 2026-11-30/);
});

test('Parsing is required today and stops being required at citation', () => {
  const sc = clauseForCriterion('4.1.1');
  assert.equal(sc.inHarmonised, true);
  assert.equal(sc.inIncoming, false);
  assert.match(sc.notes.join(' '), /Do not spend a budget cycle on it/);
});

test('the transition is counted in both directions', () => {
  const result = analyze(pageWith(
    violation('target-size', ['wcag22aa', 'wcag258']),
    violation('duplicate-id', ['wcag2a', 'wcag411']),
    violation('color-contrast', ['wcag2aa', 'wcag143']),
  ));
  const t = result.transition;

  // Today: parsing and contrast are obligations, target size is not.
  assert.equal(t.failingToday, 2);
  // At citation: target size arrives, parsing leaves. Still two.
  assert.equal(t.failingAtCitation, 2);

  assert.deepEqual(t.becomingRequired.map((f) => f.criterion), ['2.5.8']);
  assert.deepEqual(t.noLongerRequired.map((f) => f.criterion), ['4.1.1']);
  assert.match(t.noLongerRequired[0].why, /Removed in WCAG 2\.2/);
});

test('a site can fail fewer clauses after the transition than before', () => {
  // Nothing but Parsing. On citation day this page stops failing anything,
  // without a line of code changing. A report that only counted arrivals
  // would describe that day as unchanged, which is wrong.
  const t = analyze(pageWith(violation('duplicate-id', ['wcag2a', 'wcag411']))).transition;
  assert.equal(t.failingToday, 1);
  assert.equal(t.failingAtCitation, 0);
});

test('the arriving criteria are the six WCAG 2.2 adds at A and AA', () => {
  assert.deepEqual(
    INCOMING_CHANGES.arriving.map((c) => c.criterion).sort(),
    ['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']
  );
  assert.deepEqual(INCOMING_CHANGES.leaving.map((c) => c.criterion), ['4.1.1']);
});

test('the automatable claim is checked against axe-core, not asserted by hand', () => {
  // This is the load-bearing sales claim: five of the six criteria arriving
  // cannot be scanned for, so the transition needs a person. If a future
  // axe-core ships a rule for one of them, this test fails and the claim gets
  // corrected before it is printed in somebody's report.
  const hasRule = (sc) =>
    axe.getRules().some((r) => (r.tags ?? []).includes('wcag' + sc.replace(/\./g, '')));

  for (const c of INCOMING_CHANGES.arriving) {
    assert.equal(
      hasRule(c.criterion), c.automatable,
      `axe-core ${axe.version} disagrees about ${c.criterion} (${c.title})`
    );
  }

  const undetectable = INCOMING_CHANGES.arriving.filter((c) => !c.automatable);
  assert.equal(undetectable.length, 5);
});

test('the citation date is presented as scheduled, never as settled law', () => {
  assert.equal(INCOMING.expectedCitation, '2026-11-30');
  assert.match(INCOMING.citationCaveat, /obligation begins on citation/i);
  assert.match(INCOMING.citationCaveat, /date can move/i);
});
