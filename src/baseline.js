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
    // Two runs assessed by different tooling are not comparable, and the diff
    // cannot tell the difference between a site that changed and a rule set
    // that did. Upgrading the engine can retire a rule or add one, and the
    // comparison would report that as a fix or a regression somebody caused.
    tooling: toolingDrift(before, after),
    // Worth waking somebody up for.
    alarming: introduced.concat(regressed).some((e) => e.priority === 'P1' || e.priority === 'P2'),
    changed:
      fixed.length > 0 ||
      introduced.length > 0 ||
      regressed.length > 0 ||
      improved.length > 0,
  };
}

/**
 * Whether the two runs were produced by the same tooling.
 *
 * Compares what each run recorded about itself rather than what the current
 * source says, because a baseline read off disk months later carries the
 * configuration of the day it was written and nothing in the file forces that
 * to still be true.
 */
function toolingDrift(before, after) {
  const a = before?.provenance;
  const b = after?.provenance;
  // Not knowing is a weaker statement than knowing they differ, and deserves a
  // weaker warning. A baseline written before this existed is the ordinary case
  // for anybody upgrading, and shouting at them every time would train them to
  // scroll past the shout that matters.
  if (!a || !b) return { comparable: true, unknown: true };
  const engineChanged = a.engine !== b.engine;
  const tagsChanged = a.ruleTags.join(',') !== b.ruleTags.join(',');
  if (!engineChanged && !tagsChanged) return { comparable: true };

  const parts = [];
  if (engineChanged) parts.push(a.engine + ' became ' + b.engine);
  if (tagsChanged) {
    const added = b.ruleTags.filter((t) => !a.ruleTags.includes(t));
    const removed = a.ruleTags.filter((t) => !b.ruleTags.includes(t));
    if (added.length) parts.push('rule tags added: ' + added.join(', '));
    if (removed.length) parts.push('rule tags removed: ' + removed.join(', '));
  }
  return { comparable: false, reason: parts.join('; ') + '.' };
}

/** A short human summary, used in the CLI and in alert emails. */
export function describeComparison(diff) {
  const lines = [];

  // Before coverage, and before any finding. If the two runs were not produced
  // the same way, everything underneath describes the tooling as much as the
  // site, and reading it as progress or regression is the mistake this whole
  // comparison exists to prevent.
  if (diff.tooling && !diff.tooling.comparable) {
    lines.push(
      'These two runs were not assessed the same way. ' + diff.tooling.reason + ' ' +
        'A difference below may be the rule set changing rather than the site, ' +
        'and the two cannot be separated from here.'
    );
    lines.push('');
  } else if (diff.tooling?.unknown && diff.changed) {
    lines.push('Note: one of these runs recorded no engine version, so a change ' +
      'below could be the tooling rather than the site.');
    lines.push('');
  }

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
