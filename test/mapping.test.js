import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criterionFromAxeTag, criteriaFromAxeTags, SUCCESS_CRITERIA } from '../src/wcag.js';
import { clauseForCriterion } from '../src/en301549.js';
import { scoreFinding, priorityBand } from '../src/risk.js';
import { analyze } from '../src/analyze.js';

test('axe tags parse into success criteria', () => {
  assert.equal(criterionFromAxeTag('wcag111'), '1.1.1');
  assert.equal(criterionFromAxeTag('wcag412'), '4.1.2');
  // The greedy third group is what keeps two-digit criteria intact.
  assert.equal(criterionFromAxeTag('wcag2410'), '2.4.10');
  assert.equal(criterionFromAxeTag('wcag1410'), '1.4.10');
  assert.equal(criterionFromAxeTag('best-practice'), null);
  assert.equal(criterionFromAxeTag('cat.color'), null);
});

test('unknown criteria are dropped rather than invented', () => {
  // 2.4.10 is level AAA and absent from the table on purpose.
  assert.equal(SUCCESS_CRITERIA['2.4.10'], undefined);
  assert.deepEqual(criteriaFromAxeTags(['wcag2410']), []);
  assert.deepEqual(criteriaFromAxeTags(['cat.forms', 'wcag2aa', 'wcag143']), ['1.4.3']);
});

test('web criteria map onto clause 9 of EN 301 549', () => {
  assert.equal(clauseForCriterion('1.1.1').clause, '9.1.1.1');
  assert.equal(clauseForCriterion('4.1.2').clause, '9.4.1.2');
  assert.equal(clauseForCriterion('1.4.10').clause, '9.1.4.10');
});

test('WCAG 2.2 criteria are excluded from the harmonised standard', () => {
  const targetSize = clauseForCriterion('2.5.8');
  assert.equal(targetSize.inHarmonised, false);
  assert.match(targetSize.notes[0], /not part of the harmonised/i);

  const contrast = clauseForCriterion('1.4.3');
  assert.equal(contrast.inHarmonised, true);
  assert.deepEqual(contrast.notes, []);
});

test('4.1.2 Parsing carries its removal note but stays required', () => {
  const parsing = clauseForCriterion('4.1.1');
  assert.equal(parsing.inHarmonised, true);
  assert.match(parsing.notes[0], /Removed from WCAG 2\.2/);
});

test('a blocking level A failure outranks a wider level AA one', () => {
  const missingName = scoreFinding({ criterion: '4.1.2', impact: 'critical', nodeCount: 3 });
  const lowContrast = scoreFinding({ criterion: '1.4.3', impact: 'serious', nodeCount: 400 });
  assert.ok(missingName > lowContrast,
    'expected 4.1.2 (' + missingName + ') to outrank 1.4.3 (' + lowContrast + ')');
});

test('a criterion outside the harmonised standard is demoted', () => {
  const inStandard = scoreFinding({ criterion: '1.4.11', impact: 'serious', nodeCount: 5 });
  const outside = scoreFinding({ criterion: '2.5.8', impact: 'serious', nodeCount: 5 });
  assert.ok(outside < inStandard);
  assert.equal(priorityBand(outside), 'P4');
});

test('analyze groups several axe rules under one clause', () => {
  const pages = [{
    url: 'https://example.test/',
    violations: [
      { id: 'image-alt', help: 'Images must have alternative text', helpUrl: 'x',
        impact: 'critical', tags: ['wcag2a', 'wcag111'],
        nodes: [{ target: ['img'], html: '<img>', failureSummary: '' }] },
      { id: 'input-image-alt', help: 'Image buttons need alternative text', helpUrl: 'x',
        impact: 'critical', tags: ['wcag2a', 'wcag111'],
        nodes: [{ target: ['input'], html: '<input type=image>', failureSummary: '' }] },
    ],
    incomplete: [],
  }];

  const result = analyze(pages);
  assert.equal(result.scannedPages, 1);
  assert.equal(result.findings.length, 1, 'both rules belong to clause 9.1.1.1');
  assert.equal(result.findings[0].clause, '9.1.1.1');
  assert.equal(result.findings[0].rules.length, 2);
  assert.equal(result.findings[0].nodeCount, 2);
});

test('pages that fail to load are reported, not silently skipped', () => {
  const result = analyze([
    { url: 'https://down.test/', error: 'net::ERR_CONNECTION_REFUSED' },
  ]);
  assert.equal(result.scannedPages, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.summary.clausesFailing, 0);
});
