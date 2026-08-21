import { chromium } from 'playwright';
import { BAND_MEANING } from './risk.js';
import { browserMissingError } from './scan.js';

// A PDF conformance report.
//
// Rendered through the same Chromium that does the scanning, so this adds no
// dependency. The document is deliberately plain: black on white, no cover art,
// page numbers on every sheet. It is meant to be printed, attached to an email
// to a client, or handed to somebody who asked what you have done about the
// European Accessibility Act. Anything that looks like a certificate would be
// misleading, because it is not one.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const BAND_COLOUR = { P1: '#a11b06', P2: '#8a5a00', P3: '#0b4f7a', P4: '#4a4d55' };

function summaryRows(analysis) {
  const s = analysis.summary;
  return [
    ['Clauses failing', s.clausesFailing],
    ['Of those, in the harmonised standard', s.clausesFailingHarmonised],
    ['Elements affected', s.totalElements],
    ['P1 — task-blocking', s.byPriority.P1],
    ['P2 — required clause', s.byPriority.P2],
    ['P3 — required, narrower reach', s.byPriority.P3],
    ['P4 — debt or outside the standard', s.byPriority.P4],
  ];
}

export function pdfHtml(analysis, meta = {}) {
  const {
    target = '',
    generatedAt = new Date().toISOString(),
    orgName = '',
    scannedUrls = [],
  } = meta;

  const date = generatedAt.slice(0, 10);
  const st = analysis.standard;

  const findings = analysis.findings
    .map((f) => {
      const rules = f.rules
        .map((rule) => {
          const examples = rule.examples
            .map(
              (ex) =>
                `<li><code class="sel">${esc(ex.selector)}</code>
                 <span class="on">on ${esc(ex.page)}</span>
                 <pre>${esc(String(ex.html).replace(/\s+/g, ' ').slice(0, 400))}</pre></li>`
            )
            .join('');
          return `
            <div class="rule">
              <p class="rule-help">${esc(rule.help)}</p>
              <p class="rule-id">axe rule <code>${esc(rule.id)}</code></p>
              <ul class="examples">${examples}</ul>
            </div>`;
        })
        .join('');

      const notes = f.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('');
      const outside = f.inHarmonised
        ? ''
        : '<p class="note"><strong>Not a current EAA obligation.</strong> Reported so the ' +
          'gap is visible, not because the harmonised standard requires it today.</p>';

      return `
        <section class="finding">
          <h3>
            <span class="band" style="color:${BAND_COLOUR[f.priority]}">${f.priority}</span>
            Clause ${esc(f.clause)} — ${esc(f.title)}
          </h3>
          <p class="meta">WCAG ${esc(f.criterion)}, level ${esc(f.level)} ·
            ${f.nodeCount} element${f.nodeCount === 1 ? '' : 's'} across
            ${f.pageCount} page${f.pageCount === 1 ? '' : 's'} ·
            worst impact ${esc(f.impact)}</p>
          ${outside}${notes}${rules}
        </section>`;
    })
    .join('');

  const noFindings = `
    <section class="finding">
      <p>No automatically detectable failures were found. Read the coverage note
      above before drawing a conclusion from that.</p>
    </section>`;

  const urlList = scannedUrls.length
    ? `<h2>Pages covered</h2>
       <p class="quiet">${scannedUrls.length} page${scannedUrls.length === 1 ? '' : 's'}
       were loaded and evaluated.</p>
       <ol class="urls">${scannedUrls.map((u) => `<li>${esc(u)}</li>`).join('')}</ol>`
    : '';

  const assetWarn = analysis.assetWarnings?.length
    ? `<div class="caveat" style="border-left-color:#a11b06">
         <p><strong>This scan may not be trustworthy.</strong> Stylesheets or
         scripts failed to load while these pages were being assessed. An
         unstyled page fails layout-dependent rules that the real page passes, so
         some findings below may be artefacts of the failed load. Re-run before
         acting on this report.</p>
         <ul>${analysis.assetWarnings
           .map((w) => `<li>${esc(w.url)}<ul>${w.problems
             .map((p) => `<li>${esc(p.url)} &mdash; ${esc(p.reason)}</li>`)
             .join('')}</ul></li>`)
           .join('')}</ul>
       </div>`
    : '';

  // Printed before the findings, for the same reason the coverage note is: the
  // reader is deciding what to fund, and one of their current failures is about
  // to stop counting while five things nobody can scan for start counting.
  const t = analysis.transition;
  const transition = t
    ? `<h2>What changes when ${esc(t.to.version)} is cited</h2>
       <p class="quiet">${esc(t.to.citationCaveat)}</p>
       <table class="kv"><tbody>
         <tr><td>WCAG adopted today (${esc(analysis.standard.version)})</td><td>${esc(analysis.standard.adoptsWcag)}</td></tr>
         <tr><td>WCAG adopted from citation (${esc(t.to.version)})</td><td>${esc(t.to.adoptsWcag)}</td></tr>
         <tr><td>Clauses failing today</td><td>${t.failingToday}</td></tr>
         <tr><td>Clauses failing at citation</td><td>${t.failingAtCitation}</td></tr>
       </tbody></table>
       ${t.becomingRequired.length ? `<p><strong>Failures that become obligations.</strong></p>
         <ul class="bands">${t.becomingRequired
           .map((f) => `<li>Clause ${esc(f.clause)} &mdash; ${esc(f.title)} (WCAG ${esc(f.criterion)}, level ${esc(f.level)}), ${f.nodeCount} element${f.nodeCount === 1 ? '' : 's'}</li>`)
           .join('')}</ul>` : ''}
       ${t.noLongerRequired.length ? `<p><strong>Failures that stop being obligations.</strong> Still worth fixing, but they should not compete for a budget cycle with the list above.</p>
         <ul class="bands">${t.noLongerRequired
           .map((f) => `<li>Clause ${esc(f.clause)} &mdash; ${esc(f.title)}. ${esc(f.why)}</li>`)
           .join('')}</ul>` : ''}
       <div class="caveat">
         <p><strong>What this scan will not tell you about the transition.</strong>
         WCAG ${esc(t.to.adoptsWcag)} adds ${t.arriving.length} criteria at levels A and AA.
         This scan has a check for ${t.arriving.length - t.undetectable.length} of them.
         The other ${t.undetectable.length} require a person, and are absent from the
         findings below because they were never assessed &mdash; not because they pass.</p>
         <ul class="bands">${t.arriving
           .map((c) => `<li><strong>${esc(c.criterion)} ${esc(c.title)}</strong> (${esc(c.level)}) &mdash; ${c.automatable ? 'checked by this scan. ' : '<em>requires a person.</em> '}${esc(c.why)}</li>`)
           .join('')}</ul>
       </div>`
    : '';

  const errors = analysis.errors.length
    ? `<h2>Pages that could not be scanned</h2>
       <p class="quiet">These are reported rather than dropped. A page that failed to
       load has not been assessed, and is not covered by anything in this report.</p>
       <ul>${analysis.errors.map((e) => `<li>${esc(e.url)} — ${esc(e.message)}</li>`).join('')}</ul>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>EN 301 549 conformance findings</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font: 10.5pt/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111; margin: 0;
  }
  h1 { font-size: 20pt; letter-spacing: -.02em; margin: 0 0 4pt; }
  h2 { font-size: 13pt; letter-spacing: -.01em; margin: 22pt 0 6pt; padding-bottom: 4pt;
       border-bottom: 1px solid #ccc; break-after: avoid; }
  h3 { font-size: 11pt; margin: 0 0 4pt; break-after: avoid; }
  p { margin: 0 0 6pt; }
  .lede { color: #444; font-size: 11pt; }
  .quiet { color: #555; }
  .kv { width: 100%; border-collapse: collapse; margin: 10pt 0 0; }
  .kv td { padding: 4pt 0; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
  .kv td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .caveat { border: 1px solid #999; border-left: 3px solid #8a5a00; padding: 8pt 10pt; margin: 14pt 0; }
  .caveat p:last-child { margin-bottom: 0; }
  .bands { margin: 0; padding-left: 14pt; }
  .bands li { margin-bottom: 3pt; }
  .finding { break-inside: avoid-page; margin: 0 0 14pt; padding-bottom: 10pt;
             border-bottom: 1px solid #eee; }
  .band { font-weight: 700; font-family: ui-monospace, Consolas, monospace; margin-right: 4pt; }
  .meta { color: #555; font-size: 9.5pt; }
  .note { background: #f6f4ef; border-left: 2px solid #8a5a00; padding: 5pt 8pt; font-size: 9.5pt; }
  .rule { margin-top: 8pt; }
  .rule-help { font-weight: 600; margin-bottom: 2pt; }
  .rule-id { color: #555; font-size: 9pt; margin-bottom: 4pt; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 9pt; }
  .examples { list-style: none; margin: 0; padding: 0; }
  .examples li { margin-bottom: 6pt; }
  .sel { font-weight: 600; }
  .on { color: #555; font-size: 9pt; }
  pre { background: #f5f5f5; border: 1px solid #e2e2e2; padding: 5pt 6pt; margin: 3pt 0 0;
        font-family: ui-monospace, Consolas, monospace; font-size: 8.5pt;
        white-space: pre-wrap; word-break: break-word; }
  .urls { font-size: 9.5pt; color: #333; padding-left: 16pt; }
  .urls li { margin-bottom: 2pt; word-break: break-all; }
  .cover-foot { margin-top: 18pt; padding-top: 8pt; border-top: 1px solid #ccc;
                color: #555; font-size: 9pt; }
</style></head><body>

<h1>EN 301 549 conformance findings</h1>
<p class="lede">${orgName ? esc(orgName) + ' · ' : ''}${esc(target)}</p>

<table class="kv">
  <tbody>
    <tr><td>Standard</td><td>${esc(st.standard)} ${esc(st.version)}</td></tr>
    <tr><td>Success criteria adopted</td><td>WCAG ${esc(st.adoptsWcag)}</td></tr>
    <tr><td>Pages assessed</td><td>${analysis.scannedPages}</td></tr>
    <tr><td>Report date</td><td>${esc(date)}</td></tr>
    ${analysis.provenance ? `<tr><td>Evaluated by</td><td>${esc(analysis.provenance.engine)}</td></tr>
    <tr><td>Rule tags executed</td><td>${esc(analysis.provenance.ruleTags.join(', '))}</td></tr>` : ''}
    ${summaryRows(analysis)
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`)
      .join('')}
  </tbody>
</table>

<div class="caveat">
  <p><strong>What this document is.</strong> Evidence gathered by automated
  testing, expressed against the clauses of the harmonised standard. It supports
  a conformance claim. It is not the claim, it is not a certificate, and it is
  not legal advice.</p>
  <p><strong>What it cannot be.</strong> ${esc(analysis.coverageNote)}</p>
</div>

${assetWarn}

${analysis.provenance && !analysis.provenance.consistent
  ? `<div class="caveat" style="border-left-color:#a11b06"><p><strong>These pages were
     not all assessed the same way.</strong> More than one engine version or rule set
     appears in this run, so the single version stated above describes no single
     assessment. Re-run before treating any of this as a conformance claim.</p></div>`
  : ''}
${analysis.provenance?.executedBeyondStandard?.length
  ? `<div class="caveat"><p><strong>This run executed rules beyond
     ${esc(analysis.standard.version)}.</strong> The tags
     ${esc(analysis.provenance.executedBeyondStandard.join(', '))} cover criteria the
     harmonised standard does not yet adopt. Findings from them are marked below as not
     currently required and are excluded from the harmonised count, so the version above
     states what conformance is claimed against &mdash; not everything that ran.</p></div>`
  : ''}

${transition}

<h2>How to read the priority bands</h2>
<ul class="bands">
  ${Object.entries(BAND_MEANING)
    .map(([band, meaning]) => `<li><strong>${band}</strong> — ${esc(meaning)}</li>`)
    .join('')}
</ul>

${errors}

<h2>Findings</h2>
${analysis.findings.length ? findings : noFindings}

<h2>What this scan did not check</h2>
<p class="quiet">These clauses cannot be evaluated by any automated tool. Their
absence from the findings above means they were never assessed — not that they
pass. Closing them requires a person, and for several of them a person using
assistive technology.</p>
<ul class="bands">
  ${analysis.manualOnly
    .map((m) => `<li><strong>${esc(m.clause)}</strong> — ${esc(m.what)}. ${esc(m.why)}</li>`)
    .join('')}
</ul>

${urlList}

<p class="cover-foot">Produced by Curbcut · curbcut.org · detection by axe-core.
Curbcut is not affiliated with, endorsed by or accredited by ETSI, CEN, CENELEC
or the European Commission.</p>

</body></html>`;
}

export async function writePdf(analysis, meta, outPath) {
  const html = pdfHtml(analysis, meta);
  const date = (meta.generatedAt ?? new Date().toISOString()).slice(0, 10);

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    throw browserMissingError(err) ?? err;
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%;font:8pt -apple-system,Arial,sans-serif;color:#666;
                    padding:0 16mm;display:flex;justify-content:space-between">
          <span>EN 301 549 findings · ${esc(meta.target ?? '')} · ${date}</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
    return outPath;
  } finally {
    await browser.close();
  }
}
