import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import axe from 'axe-core';
import { RULE_TAGS } from '../src/scan.js';
import { SUCCESS_CRITERIA } from '../src/wcag.js';
import { clauseForCriterion } from '../src/en301549.js';

const tagFor = (sc) => 'wcag' + sc.replace(/\./g, '');
const weRun = (rule) => (rule.tags ?? []).some((t) => RULE_TAGS.includes(t));

// 4.1.1 Parsing is listed in EN 301 549 V3.2.1, because that version adopts
// WCAG 2.1, and axe has rules for it that we never run. That looks exactly like
// a hole in a required clause, and treating it as one was a mistake caught
// before it shipped: W3C errata of 21 September 2023 added a note to WCAG 2.0
// and 2.1 saying 4.1.1 "should be considered as always satisfied for any
// content using HTML or XML". Enabling those rules would have reported failures
// of a criterion that cannot be failed.
//
// It is named here rather than filtered silently, so that anyone who notices
// the same apparent gap finds the answer instead of re-introducing the bug.
const ALWAYS_SATISFIED = new Set(['4.1.1']);

test('every required criterion axe can test is actually tested', () => {
  const missed = [];

  for (const sc of Object.keys(SUCCESS_CRITERIA)) {
    const mapped = clauseForCriterion(sc);
    if (!mapped.inHarmonised) continue;
    if (ALWAYS_SATISFIED.has(sc)) continue;

    const rules = axe.getRules().filter((r) => (r.tags ?? []).includes(tagFor(sc)));
    if (rules.length === 0) continue;

    const unreachable = rules.filter((r) => !weRun(r));
    if (unreachable.length === rules.length) {
      missed.push(sc + ' (' + mapped.title + ') via ' + unreachable.map((r) => r.ruleId).join(', '));
    }
  }

  assert.deepEqual(
    missed, [],
    'clauses required today that axe can test but our tag list never runs:\n  ' +
      missed.join('\n  ')
  );
});

test('the web scanner and the command line tool run the same rules', () => {
  // If these diverge, the same page gets two different answers depending on
  // which door the reader came in through, and the promise that the browser
  // scanner is the CLI stops being true.
  const workerSource = readFileSync(
    new URL('../monitor/src/scan.js', import.meta.url), 'utf8'
  );
  const block = workerSource.match(/const RULE_TAGS = \[([\s\S]*?)\]/);
  assert.ok(block, 'RULE_TAGS not found in the worker scanner');

  const workerTags = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...workerTags].sort(), [...RULE_TAGS].sort());
});

test('neither scanner loads its rule engine in a way a strict CSP can refuse', () => {
  // addScriptTag appends a <script> element to the document, so a site with
  // `default-src 'none'` refuses to run it and the page cannot be scanned at
  // all. Four sites in the August study were excluded for exactly this, and
  // then our own site became the fifth the day it got a CSP. The fix is to
  // evaluate through the debugging protocol instead; this stops it coming back
  // in either scanner, since a fix in one and not the other would mean the web
  // and the command line disagree about which sites are scannable.
  for (const file of ['../src/scan.js', '../monitor/src/scan.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const uses = source
      .split('\n')
      .filter((line) => line.includes('addScriptTag') && !line.trim().startsWith('//'));
    assert.deepEqual(uses, [], file + ' injects axe in a way CSP can block');
  }
});

test('best-practice rules stay out of a conformance report', () => {
  const opinions = axe.getRules().filter((r) => (r.tags ?? []).includes('best-practice'));
  assert.ok(opinions.length > 0, 'axe should have best-practice rules to exclude');
  assert.ok(!RULE_TAGS.includes('best-practice'));
});

test('a criterion that cannot be failed is never scanned for', () => {
  // Guards the direction that costs a client money: telling them to fix
  // duplicate ids for a compliance reason that no longer exists.
  const parsing = clauseForCriterion('4.1.1');
  assert.equal(parsing.inHarmonised, true, 'V3.2.1 still lists it');
  assert.equal(parsing.inIncoming, false, 'V4.1.1 drops it');

  const note = parsing.notes.join(' ');
  assert.match(note, /always satisfied/i);
  assert.match(note, /21 September 2023/);
  assert.match(note, /Do not spend a budget cycle on it/);

  const rules = axe.getRules().filter((r) => (r.tags ?? []).includes('wcag411'));
  assert.ok(rules.length > 0, 'axe still ships the rules');
  assert.ok(
    rules.every((r) => !weRun(r)),
    'the 4.1.1 rules must stay switched off: enabling them reports impossible failures'
  );
});
