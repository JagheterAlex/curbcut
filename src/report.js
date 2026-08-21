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
  out.push('');

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
