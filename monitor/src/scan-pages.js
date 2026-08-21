// The /scan pages.
//
// No JavaScript, because the site has none and because the people this page is
// for are not developers. A form post, a full page back, a result they can
// print or send to somebody.

import { shell, esc } from './pages.js';
import { CACHE_MINUTES } from './limits.js';

const BAND_NOTE = {
  P1: 'Blocks somebody from finishing what they came to do, and the clause is in the harmonised standard. Fix these first.',
  P2: 'A clear failure of a required clause. Schedule into the current cycle.',
  P3: 'A required clause, narrower in reach or lower in impact.',
  P4: 'Accessibility debt, or a criterion outside the currently harmonised standard.',
};

function formBlock(prefill = '', error = '') {
  return `
  <form method="post" action="/scan" class="signup" id="scan-form">
    <h2 style="margin-bottom:.5rem">Check a page</h2>
    <p>One page, in a real browser, mapped onto EN 301 549 clauses. No account,
      nothing installed, and the result is a page you can print.</p>
    ${error ? `<div class="callout" style="margin-top:1.25rem"><p><strong>${esc(error)}</strong></p></div>` : ''}
    <div class="fields">
      <div class="field wide">
        <label for="s-url">Address of the page</label>
        <input type="text" id="s-url" name="url" required inputmode="url"
               placeholder="example.com/checkout" value="${esc(prefill)}"
               autocomplete="url" autocapitalize="off" spellcheck="false">
      </div>
    </div>
    <button type="submit" class="btn btn-primary">Check it</button>
    <p class="small">Takes about ten seconds. We fetch the page the way a browser
      does, we obey your robots.txt, and we do not keep the page or its content.
      Results are cached for ${CACHE_MINUTES} minutes.</p>
  </form>`;
}

export function scanForm(prefill = '', error = '') {
  return shell(
    'Check a page',
    `<h1>Check a page against EN&nbsp;301&nbsp;549</h1>
     <p class="lede">Most scanners hand you rule names. This one hands you clause
     numbers, which is the form a conformance claim has to take.</p>
     ${formBlock(prefill, error)}
     <h2>What this will not do</h2>
     <p>Automated testing reaches roughly a third of accessibility barriers. This
     page checks one URL and tells you which clauses it could not evaluate at all,
     rather than staying quiet about them and letting the silence read as a pass.</p>
     <p>For a whole site, a dated PDF report, or comparing today against last
     month, use the command line tool. It is free, MIT licensed, and runs on your
     machine:</p>
     <pre class="cmd"><code>npx curbcut https://example.com --crawl --pdf</code></pre>`,
    {
      index: true,
      canonical: 'https://curbcut.org/scan',
      description:
        'Free EN 301 549 accessibility checker. Enter a URL and get findings ' +
        'mapped onto clauses of the harmonised European standard, ranked by ' +
        'regulatory exposure, with the clauses no automated tool can check ' +
        'listed rather than omitted.',
    }
  );
}

function findingsHtml(analysis) {
  if (analysis.findings.length === 0) {
    return `<div class="callout">
      <p><strong>No automatically detectable failures on this page.</strong>
      That is a starting point, not a pass. Read what was not checked, below.</p>
    </div>`;
  }

  const bands = ['P1', 'P2', 'P3', 'P4'];
  let out = '';
  for (const band of bands) {
    const items = analysis.findings.filter((f) => f.priority === band);
    if (!items.length) continue;
    out += `<h3 style="margin-top:2rem">${band} &mdash; ${items.length} clause${items.length === 1 ? '' : 's'}</h3>
            <p class="quiet" style="color:var(--faint);font-size:.9rem">${esc(BAND_NOTE[band])}</p>
            <div class="tablewrap" style="margin-top:1rem"><table><thead><tr>
              <th scope="col">Clause</th><th scope="col">What fails</th>
              <th scope="col">Elements</th><th scope="col">axe rules</th>
            </tr></thead><tbody>`;
    for (const f of items) {
      const rules = f.rules.map((r) => `<code>${esc(r.id)}</code>`).join(', ');
      const outside = f.inHarmonised
        ? ''
        : '<br><span style="color:var(--faint);font-size:.85em">Not a current EAA obligation</span>';
      out += `<tr>
        <td><span class="clause">${esc(f.clause)}</span><br>
            <span style="color:var(--faint);font-size:.85em">WCAG ${esc(f.criterion)}, level ${esc(f.level)}</span></td>
        <td>${esc(f.title)}${outside}</td>
        <td>${f.nodeCount}</td>
        <td>${rules}</td>
      </tr>`;
    }
    out += '</tbody></table></div>';
  }
  return out;
}

export function scanResult(analysis, meta) {
  const { target, cached = false, scannedAt = new Date().toISOString() } = meta;
  const s = analysis.summary;
  const date = scannedAt.slice(0, 10);

  const notChecked = analysis.manualOnly
    .map((m) => `<li><strong>${esc(m.clause)}</strong> &mdash; ${esc(m.what)}. ${esc(m.why)}</li>`)
    .join('');

  return shell(
    'Result',
    `<h1>${s.clausesFailingHarmonised} clause${s.clausesFailingHarmonised === 1 ? '' : 's'} of the harmonised standard failing</h1>
     <p class="lede">${esc(target)}<br>
       <span style="color:var(--faint);font-size:.9rem">Checked ${esc(date)}${cached ? ', from a result cached in the last ' + CACHE_MINUTES + ' minutes' : ''}</span></p>

     <div class="tablewrap" style="margin-top:1.5rem">
       <table>
         <tbody>
           <tr><td>Clauses failing</td><td>${s.clausesFailing}</td></tr>
           <tr><td>Of those, in the harmonised standard</td><td>${s.clausesFailingHarmonised}</td></tr>
           <tr><td>Elements affected</td><td>${s.totalElements}</td></tr>
           <tr><td>P1 / P2 / P3 / P4</td><td>${s.byPriority.P1} / ${s.byPriority.P2} / ${s.byPriority.P3} / ${s.byPriority.P4}</td></tr>
         </tbody>
       </table>
     </div>

     <div class="callout" style="margin-top:1.5rem">
       <p><strong>What this is.</strong> Evidence toward a conformance claim,
       expressed as clauses of EN 301 549. It is not the claim, it is not a
       certificate, and it is not legal advice.</p>
       <p><strong>What it cannot be.</strong> ${esc(analysis.coverageNote)}</p>
     </div>

     <h2 style="margin-top:2.5rem">Findings</h2>
     ${findingsHtml(analysis)}

     <h2 style="margin-top:2.5rem">What was not checked</h2>
     <p>No automated tool can evaluate these. Their absence from the list above
     means they were never assessed &mdash; not that they pass.</p>
     <ul>${notChecked}</ul>

     <h2 style="margin-top:2.5rem">Taking this further</h2>
     <p>This checked <strong>one page</strong>. A conformance claim covers a
     service. To crawl the whole site, produce a dated PDF you can hand to a
     client, and compare against a baseline later to prove a fix happened:</p>
     <pre class="cmd"><code>npx curbcut ${esc(new URL(target).origin)} --crawl --pdf</code></pre>
     <p>Free, MIT licensed, runs on your machine, uploads nothing.</p>

     <p style="margin-top:2rem"><a class="btn btn-ghost" href="/scan">Check another page</a>
     &nbsp; <a class="btn btn-ghost" href="/#signup">Get told when monitoring opens</a></p>`
  );
}

export function scanBusy(message, retryAfter) {
  return shell(
    'Busy',
    `<h1>The scanner is busy.</h1>
     <p class="lede">${esc(message)}</p>
     <p>Try again in about ${Math.max(1, Math.round((retryAfter || 60) / 60))} minute(s),
     or skip the queue entirely — the command line tool has no limits and does
     more:</p>
     <pre class="cmd"><code>npx curbcut https://example.com --crawl --pdf</code></pre>
     <p><a href="/scan">Back to the scanner</a></p>`
  );
}
