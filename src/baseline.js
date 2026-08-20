// Comparing two scans of the same site.
//
// The question this answers is the one an auditor, a client or your own manager
// actually asks: did the thing you said you fixed stay fixed? A single scan is a
// snapshot and proves nothing about direction. Two dated scans and an honest
// diff between them are evidence.
//
// Findings are keyed by clause, not by axe rule. A clause can start failing for
// a different reason than it did last month — the rule changes, the obligation
// does not — and a diff keyed on rule ids would report that as one thing fixed
// and one new thing broken, which is a misleading way to describe a page that
// never stopped failing clause 9.4.1.2.

const BAND_ORDER = ['P1', 'P2', 'P3', 'P4'];

function index(analysis) {
  const map = new Map();
  for (const f of analysis?.findings ?? []) map.set(f.clause, f);
  return map;
}

function rank(band) {
  const i = BAND_ORDER.indexOf(band);
  return i === -1 ? BAND_ORDER.length : i;
}

/**
 * Diff a later scan against an earlier one.
 *
 * `regressed` is deliberately separate from `introduced`: a clause that was
 * already failing and got worse is a different conversation from one that was
 * clean and broke. Both matter, and collapsing them loses the distinction.
 */
export function compareAnalyses(before, after) {
  const prev = index(before);
  const next = index(after);

  const fixed = [];
  const introduced = [];
  const regressed = [];
  const improved = [];
  const unchanged = [];

  for (const [clause, f] of next) {
    const was = prev.get(clause);
    if (!was) {
      introduced.push({
        clause,
        title: f.title,
        priority: f.priority,
        nodeCount: f.nodeCount,
      });
      continue;
    }

    const worseBand = rank(f.priority) < rank(was.priority);
    const betterBand = rank(f.priority) > rank(was.priority);
    const moreNodes = f.nodeCount > was.nodeCount;
    const fewerNodes = f.nodeCount < was.nodeCount;

    const entry = {
      clause,
      title: f.title,
      priority: f.priority,
      wasPriority: was.priority,
      nodeCount: f.nodeCount,
      wasNodeCount: was.nodeCount,
    };

    if (worseBand || moreNodes) regressed.push(entry);
    else if (betterBand || fewerNodes) improved.push(entry);
    else unchanged.push(entry);
  }

  for (const [clause, f] of prev) {
    if (next.has(clause)) continue;
    fixed.push({
      clause,
      title: f.title,
      wasPriority: f.priority,
      wasNodeCount: f.nodeCount,
    });
  }

  const bySeverity = (a, b) =>
    rank(a.priority ?? a.wasPriority) - rank(b.priority ?? b.wasPriority) ||
    a.clause.localeCompare(b.clause);

  fixed.sort(bySeverity);
  introduced.sort(bySeverity);
  regressed.sort(bySeverity);
  improved.sort(bySeverity);
  unchanged.sort(bySeverity);

  // Pages that could not be loaded are not evidence of anything. If the earlier
  // scan covered more of the site than the later one, a shrinking list of
  // failures may just mean a shrinking list of pages, and saying "fixed" then
  // would be a lie by arithmetic.
  const coverageBefore = before?.scannedPages ?? 0;
  const coverageAfter = after?.scannedPages ?? 0;
  const coverageShrank = coverageAfter < coverageBefore;

  return {
    fixed,
    introduced,
    regressed,
    improved,
    unchanged,
    coverage: {
      before: coverageBefore,
      after: coverageAfter,
      shrank: coverageShrank,
    },
    // Worth waking somebody up for.
    alarming: introduced.concat(regressed).some((e) => e.priority === 'P1' || e.priority === 'P2'),
    changed:
      fixed.length > 0 ||
      introduced.length > 0 ||
      regressed.length > 0 ||
      improved.length > 0,
  };
}

/** A short human summary, used in the CLI and in alert emails. */
export function describeComparison(diff) {
  const lines = [];

  if (diff.coverage.shrank) {
    lines.push(
      `Coverage fell from ${diff.coverage.before} page(s) to ${diff.coverage.after}. ` +
        'Fewer failures may simply mean fewer pages were assessed, so treat anything ' +
        'below as provisional.'
    );
    lines.push('');
  }

  if (!diff.changed) {
    lines.push('No change against the baseline.');
    return lines.join('\n');
  }

  const section = (title, items, fmt) => {
    if (items.length === 0) return;
    lines.push(`${title} (${items.length})`);
    for (const e of items) lines.push('  ' + fmt(e));
    lines.push('');
  };

  section('Newly failing', diff.introduced, (e) =>
    `${e.priority}  clause ${e.clause} — ${e.title}, ${e.nodeCount} element(s)`);
  section('Worse than the baseline', diff.regressed, (e) =>
    `${e.priority}  clause ${e.clause} — ${e.title}, ${e.wasNodeCount} → ${e.nodeCount} element(s)`);
  section('No longer failing', diff.fixed, (e) =>
    `${e.wasPriority}  clause ${e.clause} — ${e.title}`);
  section('Improved but still failing', diff.improved, (e) =>
    `${e.priority}  clause ${e.clause} — ${e.title}, ${e.wasNodeCount} → ${e.nodeCount} element(s)`);

  return lines.join('\n').trimEnd();
}
