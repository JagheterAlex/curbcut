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
    <h2 class="mb-05">Check a page</h2>
    <p>One page, in a real browser, mapped onto EN 301 549 clauses. No account,
      nothing installed, and the result is a page you can print.</p>
    ${error ? `<div class="callout mt-125"><p><strong>${esc(error)}</strong></p></div>` : ''}
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
     numbers, which is the form a conformance claim has to take &mdash; plus what
     changes when V4.1.1 is cited, and a list of what no machine checked.</p>

     <p class="actions"><a class="btn btn-ghost" href="/scan/example">Read a
     complete example first</a></p>
     <p class="small">A full report on a page we broke on purpose, with the faults
     our study found most often across 149 EU-domain sites. No address to type,
     nothing installed, nobody else's website named.</p>

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
    out += `<h3 class="mt-2">${band} &mdash; ${items.length} clause${items.length === 1 ? '' : 's'}</h3>
            <p class="quiet faint-sm">${esc(BAND_NOTE[band])}</p>
            <div class="tablewrap mt-1"><table><thead><tr>
              <th scope="col">Clause</th><th scope="col">What fails</th>
              <th scope="col">Elements</th><th scope="col">axe rules</th>
            </tr></thead><tbody>`;
    for (const f of items) {
      const rules = f.rules.map((r) => `<code>${esc(r.id)}</code>`).join(', ');
      const outside = f.inHarmonised
        ? ''
        : '<br><span class="faint-xs">Not a current EAA obligation</span>';
      out += `<tr>
        <td><span class="clause">${esc(f.clause)}</span><br>
            <span class="faint-xs">WCAG ${esc(f.criterion)}, level ${esc(f.level)}</span></td>
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
  const {
    target,
    cached = false,
    scannedAt = new Date().toISOString(),
    // Only the example page passes this: a block explaining that the result
    // below describes a page we broke deliberately. It sits above everything
    // because a reader who mistakes the example for their own result has been
    // misled, and no amount of small print further down undoes that.
    intro = '',
    indexable = false,
    canonical = '',
  } = meta;
  const s = analysis.summary;
  const date = scannedAt.slice(0, 10);

  // The transition sits between the summary and the findings on purpose. This
  // page is where somebody who does not use a terminal arrives, which makes it
  // the one surface where the date matters most: their last audit was written
  // against WCAG 2.1, and five of the six criteria arriving cannot be scanned
  // for at all.
  const t = analysis.transition;
  const transitionHtml = t
    ? `<h2 class="mt-25">What changes when ${esc(t.to.version)} is cited</h2>
       <p>${esc(t.to.citationCaveat)}</p>
       <div class="tablewrap mt-1">
         <table>
           <tbody>
             <tr><td>WCAG adopted today</td><td>${esc(analysis.standard.adoptsWcag)}</td></tr>
             <tr><td>WCAG adopted from citation</td><td>${esc(t.to.adoptsWcag)}</td></tr>
             <tr><td>Clauses failing on this page today</td><td>${t.failingToday}</td></tr>
             <tr><td>Clauses failing at citation</td><td>${t.failingAtCitation}</td></tr>
           </tbody>
         </table>
       </div>
       ${t.becomingRequired.length
         ? `<p class="mt-1"><strong>Found here, not required yet, required then:</strong></p>
            <ul>${t.becomingRequired
              .map((f) => `<li>Clause ${esc(f.clause)} &mdash; ${esc(f.title)} (level ${esc(f.level)}), ${f.nodeCount} element${f.nodeCount === 1 ? '' : 's'}</li>`)
              .join('')}</ul>`
         : '<p class="mt-1">Nothing on this page fails a criterion that is arriving. That is not the same as being ready for it &mdash; see below.</p>'}
       <div class="callout mt-15">
         <p><strong>Six criteria arrive. This scan can check one of them.</strong>
         WCAG ${esc(t.to.adoptsWcag)} adds ${t.arriving.length} success criteria at levels A and AA.
         Automated testing has a rule for ${t.arriving.length - t.undetectable.length}:
         target size. The other ${t.undetectable.length} need a person, so they are
         missing from the findings below because nobody looked, not because they pass.</p>
         <ul>${t.arriving
           .map((c) => `<li><strong>${esc(c.criterion)} ${esc(c.title)}</strong> (${esc(c.level)}) &mdash; ${c.automatable ? 'checked above. ' : '<em>needs a person.</em> '}${esc(c.why)}</li>`)
           .join('')}</ul>
         <p>Which is the honest reason a readiness check for this transition is
         mostly manual work, whoever you buy it from.</p>
       </div>`
    : '';

  const notChecked = analysis.manualOnly
    .map((m) => `<li><strong>${esc(m.clause)}</strong> &mdash; ${esc(m.what)}. ${esc(m.why)}</li>`)
    .join('');

  return shell(
    intro ? 'Example result' : 'Result',
    `${intro}
     <h1>${s.clausesFailingHarmonised} clause${s.clausesFailingHarmonised === 1 ? '' : 's'} of the harmonised standard failing</h1>
     <p class="lede">${esc(target)}<br>
       <span class="faint-sm">Checked ${esc(date)}${cached ? ', from a result cached in the last ' + CACHE_MINUTES + ' minutes' : ''}</span></p>

     <div class="tablewrap mt-15">
       <table>
         <tbody>
           <tr><td>Clauses failing</td><td>${s.clausesFailing}</td></tr>
           <tr><td>Of those, in the harmonised standard</td><td>${s.clausesFailingHarmonised}</td></tr>
           <tr><td>Elements affected</td><td>${s.totalElements}</td></tr>
           <tr><td>P1 / P2 / P3 / P4</td><td>${s.byPriority.P1} / ${s.byPriority.P2} / ${s.byPriority.P3} / ${s.byPriority.P4}</td></tr>
         </tbody>
       </table>
     </div>

     ${analysis.provenance ? `<p class="micro mt-1">
       Evaluated by ${esc(analysis.provenance.engine)}, rule tags
       <code>${esc(analysis.provenance.ruleTags.join(' '))}</code>. Recorded from the
       run itself rather than read off a constant, so this line cannot outlive the
       configuration it describes.${analysis.provenance.executedBeyondStandard?.length
         ? ` Tags ${esc(analysis.provenance.executedBeyondStandard.join(', '))} cover
           criteria ${esc(analysis.standard.version)} does not adopt; their findings are
           marked below and left out of the count above.` : ''}</p>` : ''}

     <div class="callout mt-15">
       <p><strong>What this is.</strong> Evidence toward a conformance claim,
       expressed as clauses of EN 301 549. It is not the claim, it is not a
       certificate, and it is not legal advice.</p>
       <p><strong>What it cannot be.</strong> ${esc(analysis.coverageNote)}</p>
     </div>

     ${transitionHtml}

     <h2 class="mt-25">Findings</h2>
     ${findingsHtml(analysis)}

     <h2 class="mt-25">What was not checked</h2>
     <p>No automated tool can evaluate these. Their absence from the list above
     means they were never assessed &mdash; not that they pass.</p>
     <ul>${notChecked}</ul>

     <h2 class="mt-25">Taking this further</h2>
     <p>This checked <strong>one page</strong>. A conformance claim covers a
     service. To crawl the whole site, produce a dated PDF you can hand to a
     client, and compare against a baseline later to prove a fix happened:</p>
     <pre class="cmd"><code>npx curbcut ${esc(new URL(target).origin)} --crawl --pdf</code></pre>
     <p>Free, MIT licensed, runs on your machine, uploads nothing.</p>

     <div class="callout mt-15">
       <p><strong>Or have it done for you, &euro;290.</strong> The whole site up to
       200 pages, delivered as a dated PDF you can forward to whoever asked, with a
       statement draft and a fix list ordered by regulatory exposure. Two working
       days, fixed price quoted before anything is invoiced.</p>
       <p class="actions"><a class="btn btn-primary" href="/audit?site=${encodeURIComponent(new URL(target).origin)}&amp;clauses=${s.clausesFailingHarmonised}">Ask for a fixed price</a></p>
       <p>It is the same automation you just ran, done thoroughly and written up &mdash;
       <strong>not a manual audit</strong>. Nobody tests your site with a screen reader
       or tabs your checkout. Anyone selling a &euro;290 &ldquo;full audit&rdquo; is
       selling you something automation cannot deliver.</p>
     </div>

     <p class="mt-2"><a class="btn btn-primary" href="/scan">Check a page of your own</a>
     &nbsp; <a class="btn btn-ghost" href="/#signup">Get told when monitoring opens</a></p>`,
    { index: indexable, canonical, description: indexable
        ? 'A complete EN 301 549 report from the free scanner, run against a page '
          + 'broken on purpose with the failures most common across the EU web. '
          + 'See the whole output before checking a page of your own.'
        : '' }
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

/**
 * The example result, rendered from a fixture rather than a live scan.
 *
 * Built by scripts/build-example.mjs, which scans the deliberately broken page
 * in demo.js with the same code the CLI runs. It costs no browser budget, and
 * because it is a real run it cannot describe an output the tool does not
 * produce.
 */
export function exampleResult(fixture) {
  const intro = `<div class="callout">
    <p><strong>This is an example, not your site.</strong> The page below is one
    Curbcut hosts and broke on purpose, so you can read a whole report before
    deciding whether to run one. Nobody else's website is being shown here.</p>
    <p>The faults were chosen from our
    <a href="/blog/european-web-readiness-2026">August study of 149 EU-domain
    sites</a>, in roughly the proportions it found them: a link that announces
    itself as nothing, an untitled advert frame, a button with no name, ARIA
    without the state its role requires, low contrast, tap targets under the
    coming minimum. You can
    <a href="/demo/broken.html">look at the page itself</a>.</p>
    <p>Dated ${esc(fixture.scannedAt.slice(0, 10))}, which is the day it was
    measured and not today. A report describes a moment, and re-dating an old
    one is the habit this tool exists to argue against.</p>
  </div>`;

  return scanResult(fixture.analysis, {
    target: 'https://curbcut.org/demo/broken.html',
    scannedAt: fixture.scannedAt,
    intro,
    indexable: true,
    canonical: 'https://curbcut.org/scan/example',
  });
}
