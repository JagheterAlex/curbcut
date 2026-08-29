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

// The revision that replaces it.
//
// An obligation begins when a version is cited in the Official Journal of the
// EU, not when ETSI publishes it. V4.1.0 went out as a final draft in June 2026
// and 30 November 2026 is the citation date in ETSI's own work programme. That
// is a scheduled milestone, and schedules move: this is reported as "expected",
// and nothing here calls it law until it is.
//
// It matters because it cuts both ways, which almost nobody says out loud. Six
// success criteria arrive. One leaves.
export const INCOMING = {
  standard: 'EN 301 549',
  version: 'V4.1.1',
  adoptsWcag: '2.2',
  expectedCitation: '2026-11-30',
  citationCaveat:
    'Scheduled for citation in the Official Journal on 30 November 2026 per ' +
    'the ETSI work programme. The obligation begins on citation, not on ' +
    'publication, and the date can move.',
};

// What changes at citation, stated per criterion.
//
// `automatable` was not judged by hand. It is what axe-core 4.13.0 actually
// has a rule for, checked against the engine: of the six criteria arriving,
// exactly one can be tested by machine. The other five need a person, and for
// some of them a person using assistive technology.
//
// This is the single most useful fact we know about the transition, and it is
// the opposite of what a tool vendor is supposed to say.
export const INCOMING_CHANGES = {
  arriving: [
    { criterion: '2.4.11', title: 'Focus Not Obscured (Minimum)', level: 'AA', automatable: false,
      why: 'Requires knowing whether a sticky header or cookie bar covers the focused control at the moment it receives focus.' },
    { criterion: '2.5.7', title: 'Dragging Movements', level: 'AA', automatable: false,
      why: 'Requires finding every drag interaction and confirming a single-pointer alternative exists.' },
    { criterion: '2.5.8', title: 'Target Size (Minimum)', level: 'AA', automatable: true,
      why: 'axe-core measures rendered target geometry directly.' },
    { criterion: '3.2.6', title: 'Consistent Help', level: 'A', automatable: false,
      why: 'Requires comparing where help appears across several pages, and judging whether it is the same help.' },
    { criterion: '3.3.7', title: 'Redundant Entry', level: 'A', automatable: false,
      why: 'Requires walking a multi-step form and noticing information asked for twice.' },
    { criterion: '3.3.8', title: 'Accessible Authentication (Minimum)', level: 'AA', automatable: false,
      why: 'Requires judging whether a login imposes a cognitive function test with no alternative.' },
  ],
  leaving: [
    { criterion: '4.1.1', title: 'Parsing', level: 'A',
      why: 'Removed in WCAG 2.2. Duplicate ids and malformed markup stop being a conformance failure in their own right, though they still cause real problems that other criteria catch.' },
  ],
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
  // Required once V4.1.1 is cited: everything WCAG 2.2 keeps. That includes the
  // criteria 2.2 introduced, and excludes the one it removed.
  const inIncoming = meta.obsoletedIn !== '2.2';
  const notes = [];
  if (!inHarmonised) {
    notes.push(
      'Introduced in WCAG 2.2. Not part of the harmonised ' +
      HARMONISED.standard + ' ' + HARMONISED.version +
      ', which adopts WCAG ' + HARMONISED.adoptsWcag +
      '. Treat as good practice and future-proofing, not as a current EAA obligation.'
    );
    notes.push(
      'Expected to become required when ' + INCOMING.standard + ' ' +
      INCOMING.version + ' is cited, scheduled for ' +
      INCOMING.expectedCitation + '. Fixing it now is early, not wasted.'
    );
  }
  if (meta.obsoletedIn) {
    notes.push(
      'Removed from WCAG ' + meta.obsoletedIn + ', and listed in the harmonised ' +
      HARMONISED.standard + ' ' + HARMONISED.version + ' only because that ' +
      'version adopts WCAG ' + HARMONISED.adoptsWcag + '. W3C errata of ' +
      '21 September 2023 added a note to WCAG 2.0 and 2.1 that this criterion ' +
      '"should be considered as always satisfied for any content using HTML or ' +
      'XML". It cannot be failed today and stops being listed at all once ' +
      INCOMING.version + ' is cited. Do not spend a budget cycle on it.'
    );
  }

  return {
    criterion: sc,
    title: meta.title,
    level: meta.level,
    clause: HARMONISED.webClausePrefix + '.' + sc,
    inHarmonised,
    inIncoming,
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
  // Added 27 August after a reader pointed out that this list named clause 12
  // and skipped clause 10 entirely — the one covering everything a service
  // hands you rather than renders. He was right, and the omission flattered us.
  { clause: '10', what: 'Non-web documents: PDFs, spreadsheets, presentations, e-books',
    why: 'Clause 10 applies the same success criteria to documents a service delivers rather than renders — the invoice, the ticket, the statement of account, the e-book. This tool reads web pages and never opens them. The commonest catastrophic failure, a PDF with no tag structure at all, is machine-detectable, but not by anything here; and the documents that matter most usually sit behind a login, where nothing scanning from outside can reach them.' },
  { clause: '12.1.2', what: 'Accessible product documentation', why: 'The documentation itself must meet the standard, and it usually lives outside the scanned pages.' },
  { clause: '12.2.2', what: 'Accessible support services', why: 'Support channels must accommodate users with disabilities. Nothing on the page reveals this.' },
];

/**
 * The share of WCAG failures that automated tooling can detect at all.
 * Published estimates cluster around a third. The exact figure matters less
 * than refusing to let a clean automated run be read as conformance.
 */
export const AUTOMATED_COVERAGE_NOTE =
  'Automated testing detects roughly 30 to 40 percent of WCAG failures ' +
  'in web content. This tool reads clause 9, web pages. A service in scope of ' +
  'the European Accessibility Act usually has to satisfy clause 10 as well, ' +
  'non-web documents, which nothing here examines. A clean automated result is ' +
  'a starting point, not a conformance claim.';
