import { criteriaFromAxeTags, SUCCESS_CRITERIA } from './wcag.js';
import { clauseForCriterion, MANUAL_ONLY_CLAUSES, HARMONISED, AUTOMATED_COVERAGE_NOTE } from './en301549.js';
import { scoreFinding, priorityBand } from './risk.js';

/**
 * Fold raw per-page axe output into findings grouped by EN 301 549 clause.
 * Grouping by clause rather than by axe rule is the point: several axe rules
 * commonly fail the same clause, and a clause is the unit a conformance claim
 * is written in.
 */
export function analyze(pages) {
  const byClause = new Map();
  const errors = [];
  // Pages whose stylesheet or script did not arrive. Layout-dependent rules —
  // target size especially — fail on an unstyled page that the real page
  // passes, so a scan with missing assets can invent failures. Better to say so
  // than to hand somebody a report full of problems they do not have.
  const assetWarnings = [];
  let scannedPages = 0;

  for (const page of pages) {
    if (page.error) {
      errors.push({ url: page.url, message: page.error });
      continue;
    }
    scannedPages++;

    if (page.assetProblems?.length) {
      assetWarnings.push({ url: page.url, problems: page.assetProblems });
    }

    for (const violation of page.violations ?? []) {
      const criteria = criteriaFromAxeTags(violation.tags);
      // A rule with no mappable criterion is a best-practice rule that slipped
      // through the tag filter. Dropping it keeps the report defensible.
      if (criteria.length === 0) continue;

      for (const criterion of criteria) {
        const mapped = clauseForCriterion(criterion);
        if (!mapped) continue;

        if (!byClause.has(mapped.clause)) {
          byClause.set(mapped.clause, {
            ...mapped,
            rules: new Map(),
            nodeCount: 0,
            pages: new Set(),
            worstImpact: 'minor',
          });
        }
        const entry = byClause.get(mapped.clause);
        entry.nodeCount += violation.nodes.length;
        entry.pages.add(page.url);
        entry.worstImpact = worseOf(entry.worstImpact, violation.impact);

        if (!entry.rules.has(violation.id)) {
          entry.rules.set(violation.id, {
            id: violation.id,
            help: violation.help,
            helpUrl: violation.helpUrl,
            impact: violation.impact,
            examples: [],
          });
        }
        const rule = entry.rules.get(violation.id);
        for (const node of violation.nodes.slice(0, 3)) {
          if (rule.examples.length >= 3) break;
          rule.examples.push({
            page: page.url,
            selector: Array.isArray(node.target) ? node.target.join(' ') : String(node.target),
            html: truncate(node.html, 200),
            summary: node.failureSummary ?? '',
          });
        }
      }
    }
  }

  const findings = [...byClause.values()]
    .map((entry) => {
      const score = scoreFinding({
        criterion: entry.criterion,
        impact: entry.worstImpact,
        nodeCount: entry.nodeCount,
      });
      return {
        clause: entry.clause,
        criterion: entry.criterion,
        title: entry.title,
        level: entry.level,
        inHarmonised: entry.inHarmonised,
        notes: entry.notes,
        impact: entry.worstImpact,
        nodeCount: entry.nodeCount,
        pageCount: entry.pages.size,
        rules: [...entry.rules.values()],
        score,
        priority: priorityBand(score),
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    standard: HARMONISED,
    scannedPages,
    errors,
    assetWarnings,
    findings,
    summary: summarise(findings),
    manualOnly: MANUAL_ONLY_CLAUSES,
    coverageNote: AUTOMATED_COVERAGE_NOTE,
  };
}

function summarise(findings) {
  const required = findings.filter((f) => f.inHarmonised);
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const f of findings) counts[f.priority]++;
  return {
    clausesFailing: findings.length,
    clausesFailingHarmonised: required.length,
    totalElements: findings.reduce((n, f) => n + f.nodeCount, 0),
    byPriority: counts,
  };
}

const IMPACT_ORDER = ['minor', 'moderate', 'serious', 'critical'];
function worseOf(a, b) {
  const ia = IMPACT_ORDER.indexOf(a);
  const ib = IMPACT_ORDER.indexOf(b);
  return ib > ia ? b : a;
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export { SUCCESS_CRITERIA };
