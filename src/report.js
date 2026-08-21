import { BAND_MEANING } from './risk.js';

export function markdownReport(analysis, meta = {}) {
  const { target = '', generatedAt = new Date().toISOString() } = meta;
  const s = analysis.summary;
  const out = [];

  out.push('# EN 301 549 conformance findings');
  out.push('');
  if (target) out.push('**Target:** ' + target + '  ');
  out.push('**Standard:** ' + analysis.standard.standard + ' ' + analysis.standard.version +
    ' (adopts WCAG ' + analysis.standard.adoptsWcag + ')  ');
  out.push('**Pages scanned:** ' + analysis.scannedPages + '  ');
  out.push('**Generated:** ' + generatedAt);

  // Directly under the version line, because that line is the conformance claim
  // and this is the only evidence that it describes the run rather than a
  // constant in our source.
  const prov = analysis.provenance;
  if (prov) {
    out.push('**Evaluated by:** ' + prov.engine + '  ');
    out.push('**Rule tags executed:** `' + prov.ruleTags.join('`, `') + '`');
  }
  out.push('');

  if (prov && !prov.consistent) {
    out.push('> **These pages were not all assessed the same way.** More than one');
    out.push('> engine version or rule set appears across this run, which means the');
    out.push('> single version line above describes no single assessment. Re-run');
    out.push('> before treating any of it as a conformance claim.');
    out.push('');
  }

  if (prov && prov.executedBeyondStandard.length) {
    out.push('> **This run executed rules beyond ' + analysis.standard.version + '.** Tags `' +
      prov.executedBeyondStandard.join('`, `') + '` cover criteria the harmonised');
    out.push('> standard does not yet adopt. Their findings appear below marked as not');
    out.push('> currently required, and they are excluded from the harmonised count. The');
    out.push('> version line above therefore describes what conformance is claimed');
    out.push('> against, not the full set of rules that ran.');
    out.push('');
  }

  out.push('> ' + analysis.coverageNote);
  out.push('>');
  out.push('> This report is evidence for a conformance claim. It is not the claim itself,');
  out.push('> and it is not legal advice.');
  out.push('');

  out.push('## Summary');
  out.push('');
  out.push('| | |');
  out.push('|---|---|');
  out.push('| Clauses failing | ' + s.clausesFailing + ' |');
  out.push('| Of those, in the harmonised standard | ' + s.clausesFailingHarmonised + ' |');
  out.push('| Elements affected | ' + s.totalElements + ' |');
  out.push('| P1 / P2 / P3 / P4 | ' + s.byPriority.P1 + ' / ' + s.byPriority.P2 + ' / ' +
    s.byPriority.P3 + ' / ' + s.byPriority.P4 + ' |');
  out.push('');

  if (analysis.assetWarnings?.length) {
    out.push('## Warning: this scan may not be trustworthy');
    out.push('');
    out.push('Stylesheets or scripts failed to load on the pages below. An unstyled');
    out.push('page fails layout-dependent rules — target size above all — that the real');
    out.push('page passes, so some findings here may be artefacts of the failed load');
    out.push('rather than problems with the site.');
    out.push('');
    out.push('**Re-run the scan before acting on this report.**');
    out.push('');
    for (const w of analysis.assetWarnings) {
      out.push('- ' + w.url);
      for (const p of w.problems) out.push('  - ' + p.url + ' — ' + p.reason);
    }
    out.push('');
  }

  if (analysis.errors.length) {
    out.push('### Pages that could not be scanned');
    out.push('');
    for (const e of analysis.errors) out.push('- ' + e.url + ' — ' + e.message);
    out.push('');
  }

  // The transition section sits above the findings on purpose. Somebody reading
  // this in 2026 is deciding what to fund next quarter, and the fact that one
  // of their current failures stops mattering — while five things they cannot
  // scan for start mattering — changes that decision more than any single
  // finding below does.
  const t = analysis.transition;
  if (t) {
    out.push('## What changes when ' + t.to.version + ' is cited');
    out.push('');
    out.push(t.to.citationCaveat);
    out.push('');
    out.push('| | Today (' + analysis.standard.version + ') | From citation (' + t.to.version + ') |');
    out.push('| --- | --- | --- |');
    out.push('| WCAG version adopted | ' + analysis.standard.adoptsWcag + ' | ' + t.to.adoptsWcag + ' |');
    out.push('| Clauses failing on this scan | ' + t.failingToday + ' | ' + t.failingAtCitation + ' |');
    out.push('');

    if (t.becomingRequired.length) {
      out.push('**Failures that become obligations.** Found on this scan, not ' +
               'currently required, required once the new version is cited.');
      out.push('');
      for (const f of t.becomingRequired) {
        out.push('- Clause ' + f.clause + ' — ' + f.title + ' (WCAG ' + f.criterion +
                 ', level ' + f.level + ') · ' + f.nodeCount +
                 ' element' + (f.nodeCount === 1 ? '' : 's'));
      }
      out.push('');
    }

    if (t.noLongerRequired.length) {
      out.push('**Failures that stop being obligations.** Fixing these is still ' +
               'defensible, but they should not compete for a budget cycle with ' +
               'the list above.');
      out.push('');
      for (const f of t.noLongerRequired) {
        out.push('- Clause ' + f.clause + ' — ' + f.title + '. ' + f.why);
      }
      out.push('');
    }

    if (t.leaving.length && !t.noLongerRequired.length) {
      out.push('**What the revision removes.**');
      out.push('');
      for (const c of t.leaving) {
        out.push('- **' + c.criterion + ' ' + c.title + '** (' + c.level + ') — ' + c.why +
                 ' This scan does not test for it and never reported it, so nothing ' +
                 'in the findings below changes when it goes.');
      }
      out.push('');
    }

    out.push('**What this scan will not tell you about the transition.** WCAG ' +
             t.to.adoptsWcag + ' adds ' + t.arriving.length + ' criteria at levels A and AA. ' +
             'This scan has a check for ' +
             (t.arriving.length - t.undetectable.length) + ' of them.');
    out.push('');
    for (const c of t.arriving) {
      out.push('- **' + c.criterion + ' ' + c.title + '** (' + c.level + ') — ' +
               (c.automatable ? 'checked by this scan. ' : '*requires a person.* ') +
               c.why);
    }
    out.push('');
    out.push('That means ' + t.undetectable.length + ' of the ' + t.arriving.length +
             ' criteria arriving are absent from the findings above because they ' +
             'were never assessed, not because they pass.');
    out.push('');
  }

  out.push('## Priority bands');
  out.push('');
  for (const [band, meaning] of Object.entries(BAND_MEANING)) {
    out.push('- **' + band + '** — ' + meaning);
  }
  out.push('');

  out.push('## Findings');
  out.push('');
  if (analysis.findings.length === 0) {
    out.push('No automatically detectable failures. See the limits section below before');
    out.push('reading anything more into that.');
    out.push('');
  }

  for (const f of analysis.findings) {
    out.push('### ' + f.priority + ' · Clause ' + f.clause + ' — ' + f.title);
    out.push('');
    out.push('WCAG ' + f.criterion + ', level ' + f.level + '. ' +
      f.nodeCount + ' element' + (f.nodeCount === 1 ? '' : 's') + ' across ' +
      f.pageCount + ' page' + (f.pageCount === 1 ? '' : 's') + '. Worst impact: ' + f.impact + '.');
    out.push('');
    if (!f.inHarmonised) {
      out.push('**Not a current EAA obligation.**');
      out.push('');
    }
    for (const n of f.notes) {
      out.push('> ' + n);
      out.push('');
    }
    for (const rule of f.rules) {
      out.push('**' + rule.help + '**  ');
      out.push('Rule `' + rule.id + '` · [reference](' + rule.helpUrl + ')');
      out.push('');
      for (const ex of rule.examples) {
        out.push('- `' + ex.selector + '` on ' + ex.page);
        out.push('  ```html');
        out.push('  ' + ex.html.replace(/\n/g, ' '));
        out.push('  ```');
      }
      out.push('');
    }
  }

  out.push('## What this scan did not check');
  out.push('');
  out.push('These clauses require a person. Their absence from the findings above means');
  out.push('they were never evaluated, not that they pass.');
  out.push('');
  for (const m of analysis.manualOnly) {
    out.push('- **' + m.clause + '** — ' + m.what + '. ' + m.why);
  }
  out.push('');

  return out.join('\n');
}
