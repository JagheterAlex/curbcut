import { SUCCESS_CRITERIA } from './wcag.js';

// The European Accessibility Act (Directive (EU) 2019/882) does not itself list
// technical requirements. It points at a harmonised standard, and for ICT that
// standard is EN 301 549. Conformance is claimed against clauses of EN 301 549,
// not against WCAG directly, which is why raw axe-core output is not something
// you can hand to a regulator.
export const HARMONISED = {
  standard: 'EN 301 549',
  version: 'V3.2.1 (2021-03)',
  adoptsWcag: '2.1',
  // Clause 9 covers web content. Its numbering deliberately mirrors WCAG:
  // clause 9.x.y.z corresponds to WCAG success criterion x.y.z.
  webClausePrefix: '9',
};

/**
 * Map a WCAG success criterion to its EN 301 549 clause for web content.
 * Returns `inHarmonised: false` for criteria that WCAG 2.2 introduced. Those
 * are good practice and likely to be required by a future revision, but they
 * are not part of the currently harmonised standard, so presenting them as
 * legal obligations would overstate the case.
 */
export function clauseForCriterion(sc) {
  const meta = SUCCESS_CRITERIA[sc];
  if (!meta) return null;

  const inHarmonised = meta.since !== '2.2';
  const notes = [];
  if (!inHarmonised) {
    notes.push(
      'Introduced in WCAG 2.2. Not part of the harmonised ' +
      HARMONISED.standard + ' ' + HARMONISED.version +
      ', which adopts WCAG ' + HARMONISED.adoptsWcag +
      '. Treat as good practice and future-proofing, not as a current EAA obligation.'
    );
  }
  if (meta.obsoletedIn) {
    notes.push(
      'Removed from WCAG ' + meta.obsoletedIn + ', but still present in the ' +
      'harmonised standard. Fixing it remains the safe choice while ' +
      HARMONISED.version + ' is the version cited for conformance.'
    );
  }

  return {
    criterion: sc,
    title: meta.title,
    level: meta.level,
    clause: HARMONISED.webClausePrefix + '.' + sc,
    inHarmonised,
    notes,
  };
}

/**
 * Clauses of EN 301 549 that no automated scan can evaluate. They are listed
 * so a conformance claim is honest about its own blind spots rather than
 * implying that a green scan means a compliant product.
 */
export const MANUAL_ONLY_CLAUSES = [
  { clause: '9.2.4.5', what: 'More than one way to locate a page', why: 'Requires judging whether site search, a sitemap or navigation genuinely offer alternative routes.' },
  { clause: '9.3.2.3', what: 'Consistent navigation', why: 'Requires comparing repeated components across several pages.' },
  { clause: '9.3.2.4', what: 'Consistent identification', why: 'Requires judging whether the same function is named the same way throughout.' },
  { clause: '9.3.3.4', what: 'Error prevention on legal, financial and data entry', why: 'Requires walking a real checkout or submission flow to confirm it is reversible, checked or confirmed.' },
  { clause: '9.1.2.x', what: 'Time-based media alternatives', why: 'Captions, transcripts and audio description have to be watched and read to confirm they are accurate, not merely present.' },
  { clause: '9.2.1.1', what: 'Keyboard operability of the full journey', why: 'Automation reaches individual controls; only a manual pass proves an entire task can be completed by keyboard alone.' },
  { clause: '12.1.2', what: 'Accessible product documentation', why: 'The documentation itself must meet the standard, and it usually lives outside the scanned pages.' },
  { clause: '12.2.2', what: 'Accessible support services', why: 'Support channels must accommodate users with disabilities. Nothing on the page reveals this.' },
];

/**
 * The share of WCAG failures that automated tooling can detect at all.
 * Published estimates cluster around a third. The exact figure matters less
 * than refusing to let a clean automated run be read as conformance.
 */
export const AUTOMATED_COVERAGE_NOTE =
  'Automated testing detects roughly 30 to 40 percent of WCAG failures. ' +
  'A clean automated result is a starting point, not a conformance claim.';
