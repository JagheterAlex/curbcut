import { SUCCESS_CRITERIA } from './wcag.js';
import { clauseForCriterion } from './en301549.js';

// axe-core ranks findings by user impact. That is the right axis for deciding
// what hurts people, and the wrong axis for deciding what to fix first when a
// regulator is asking questions. A single unlabelled checkout button is a
// bigger problem than four hundred low-contrast footer links, and impact alone
// does not say so.

const IMPACT_WEIGHT = { critical: 4, serious: 3, moderate: 2, minor: 1 };

// Criteria whose failure can stop a user completing a task outright, rather
// than making it unpleasant. These are what complaints and enforcement
// actions are actually built on.
const BLOCKING_CRITERIA = new Set([
  '1.1.1',  // no alternative text at all
  '1.3.1',  // structure not exposed, so the page is unusable by screen reader
  '2.1.1',  // not reachable by keyboard
  '2.1.2',  // keyboard trap, the user cannot even leave
  '2.4.2',  // no page title, no orientation
  '3.1.1',  // no language, so speech synthesis is wrong
  '3.3.2',  // form controls with no label
  '4.1.2',  // name, role or value missing from a control
]);

export function scoreFinding({ criterion, impact, nodeCount = 1 }) {
  const meta = SUCCESS_CRITERIA[criterion];
  const mapped = clauseForCriterion(criterion);
  if (!meta || !mapped) return null;

  let score = IMPACT_WEIGHT[impact] ?? 1;

  // A criterion outside the harmonised standard is real accessibility debt but
  // not a current legal obligation. Rank it below everything that is.
  if (!mapped.inHarmonised) score *= 0.35;

  // Level A failures are more fundamental than AA ones.
  if (meta.level === 'A') score *= 1.4;

  if (BLOCKING_CRITERIA.has(criterion)) score *= 1.8;

  // Breadth matters, but sub-linearly. Four hundred instances of one problem is
  // still one problem, and usually one fix in a shared component.
  score *= 1 + Math.log10(Math.max(1, nodeCount)) * 0.5;

  return Math.round(score * 100) / 100;
}

export function priorityBand(score) {
  if (score >= 9) return 'P1';
  if (score >= 5) return 'P2';
  if (score >= 2.5) return 'P3';
  return 'P4';
}

export const BAND_MEANING = {
  P1: 'Blocks a user from completing a task and falls under the harmonised standard. Fix before anything else.',
  P2: 'A clear failure of a required clause. Schedule it into the current cycle.',
  P3: 'A required clause, narrower in reach or lower in impact.',
  P4: 'Accessibility debt or a criterion outside the currently harmonised standard. Worth fixing, not urgent.',
};
