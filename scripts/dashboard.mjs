// Renders business/metrics/daily.json into a page Alexander can open.
//
// Generated rather than hand-written, so refreshing it is one command and the
// numbers can never drift from the series they came from.
//
// The page has one job: answer "did anybody come, and did anybody do anything".
// Cloudflare's own dashboard answers the first half and cannot answer the
// second, which is the half that decides whether this business continues.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', 'business', 'metrics', 'daily.json');
const OUT = join(HERE, '..', '..', 'business', 'metrics', 'dashboard.html');

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const days = Object.keys(data).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
const rows = days.map((d) => ({ date: d, ...data[d], actions: data[d].actions ?? {} }));

const sum = (f) => rows.reduce((n, r) => n + (f(r) || 0), 0);
const totals = {
  readerViews: sum((r) => r.readerViews),
  uniques: sum((r) => r.uniques),
  searchBots: sum((r) => r.searchBotViews),
  ours: sum((r) => r.ourRequests),
  scanViewed: sum((r) => r.actions.scan_viewed),
  scanRan: sum((r) => r.actions.scan_ran),
  leads: data.meta?.interestTotal ?? 0,
  stylesheets: sum((r) => r.stylesheetFetches),
  probes: sum((r) => r.probeRequests),
};
// Days where the stylesheet method was actually running. Cloudflare only serves
// the dataset it needs for one day at a time on this plan, so the series starts
// when we started asking rather than when the site did.
const measuredDays = rows.filter((r) => typeof r.stylesheetFetches === 'number').length;

// The one bot-excluded measurement this site will ever have, read off the
// Cloudflare Web Analytics dashboard before the beacon was removed. Kept as a
// fixed record rather than a live figure, because the instrument that produced
// it is being switched off on purpose.
const truth = data.webAnalyticsBaseline ?? null;

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => Number(v || 0).toLocaleString('en-GB');

const measured = data.meta?.lastRun
  ? new Date(data.meta.lastRun).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  : 'unknown';

// The funnel, as type rather than as a chart. Two days is not a trend, and a bar
// of 971 against 0 teaches nobody anything they cannot read from the digits.
const funnel = [
  {
    label: 'Arrived',
    value: totals.stylesheets,
    note: 'Stylesheet fetches. A crawler asks for the HTML and stops; a browser goes back for style.css. Under-counts anyone returning with it cached, so read it as a floor.',
  },
  {
    label: 'Opened the scanner',
    value: totals.scanViewed,
    note: 'Reached the one page that asks them to do something.',
  },
  {
    label: 'Ran a scan',
    value: totals.scanRan,
    note: 'Typed an address and pressed the button.',
  },
  {
    label: 'Left an address',
    value: totals.leads,
    note: 'The only step that can turn into money.',
  },
];

const dayRows = rows.map((r) => `
  <tr>
    <td>${esc(r.date)}</td>
    <td>${typeof r.stylesheetFetches === 'number' ? n(r.stylesheetFetches) : '&mdash;'}</td>
    <td class="dim">${n(r.readerViews)}</td>
    <td class="dim">${typeof r.probeRequests === 'number' ? n(r.probeRequests) : '&mdash;'}</td>
    <td class="dim">${n(r.searchBotViews)}</td>
    <td>${n(r.actions.scan_viewed)}</td>
    <td>${n(r.actions.scan_ran)}</td>
    <td class="${r.actions.interest_left ? 'good' : 'zero'}">${n(r.actions.interest_left)}</td>
  </tr>`).join('');

const countryRow = rows.length ? rows[rows.length - 1].topCountries ?? [] : [];
const countries = countryRow.map((c) => {
  const [name, hits] = c.split(':');
  return `<li><span class="cc">${esc(name)}</span><span class="ccn">${n(hits)}</span></li>`;
}).join('');

const funnelRows = funnel.map((step, i) => {
  const prev = i === 0 ? null : funnel[i - 1].value;
  const drop = prev && prev > 0 ? Math.round((1 - step.value / prev) * 1000) / 10 : null;
  return `
    <li class="${step.value === 0 ? 'is-zero' : ''}">
      <div class="step-head">
        <span class="step-label">${esc(step.label)}</span>
        <span class="step-value">${n(step.value)}</span>
      </div>
      ${drop !== null ? `<p class="step-drop">${drop}% did not get this far</p>` : ''}
      <p class="step-note">${esc(step.note)}</p>
    </li>`;
}).join('');

const css = [
  ':root{--ground:#f5f7f8;--surface:#ffffff;--ink:#14181c;--muted:#68727c;',
  '--line:#dde3e7;--line-soft:#eef2f4;--arrive:#4a6d8c;--act:#a9781a;',
  '--act-bright:#c8912a;--zero:#a9391f;',
  '--mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;',
  '--sans:"IBM Plex Sans",-apple-system,"Segoe UI",Roboto,sans-serif;}',
  '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){',
  '--ground:#0e1114;--surface:#171b1f;--ink:#e4e9ed;--muted:#8b959f;',
  '--line:#252c32;--line-soft:#1d2328;--arrive:#7ea3c4;--act:#f5c344;',
  '--act-bright:#f5c344;--zero:#e0705a;}}',
  ':root[data-theme="dark"]{--ground:#0e1114;--surface:#171b1f;--ink:#e4e9ed;',
  '--muted:#8b959f;--line:#252c32;--line-soft:#1d2328;--arrive:#7ea3c4;',
  '--act:#f5c344;--act-bright:#f5c344;--zero:#e0705a;}',
  '*{box-sizing:border-box}',
  'body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);',
  'font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}',
  '.wrap{max-width:52rem;margin:0 auto;padding:3rem 1.5rem 5rem;display:flex;',
  'flex-direction:column;gap:2rem}',
  'header{display:flex;flex-direction:column;gap:.35rem;',
  'border-bottom:1px solid var(--line);padding-bottom:1.4rem}',
  'h1{font-family:var(--mono);font-size:1.35rem;font-weight:600;letter-spacing:-.01em;',
  'margin:0;text-wrap:balance}',
  '.sub{color:var(--muted);font-family:var(--mono);font-size:.78rem;letter-spacing:.02em}',
  'h2{font-family:var(--mono);font-size:.72rem;font-weight:600;text-transform:uppercase;',
  'letter-spacing:.12em;color:var(--muted);margin:0 0 1rem}',
  'section{background:var(--surface);border:1px solid var(--line);border-radius:2px;',
  'padding:1.5rem}',
  '.lead{font-size:1.02rem;margin:0 0 1.4rem;text-wrap:pretty}',
  '.lead strong{font-family:var(--mono);font-weight:600}',
  'ol.funnel{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}',
  'ol.funnel li{padding:1rem 0;border-top:1px solid var(--line-soft)}',
  'ol.funnel li:first-child{border-top:0;padding-top:0}',
  '.step-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}',
  '.step-label{font-family:var(--mono);font-size:.95rem;font-weight:500}',
  '.step-value{font-family:var(--mono);font-size:2rem;font-weight:600;',
  'font-variant-numeric:tabular-nums;color:var(--arrive);line-height:1}',
  'ol.funnel li.is-zero .step-value{color:var(--zero)}',
  'ol.funnel li:nth-child(3) .step-value{color:var(--act)}',
  '.step-drop{font-family:var(--mono);font-size:.74rem;color:var(--muted);',
  'margin:.4rem 0 0;letter-spacing:.02em}',
  '.step-note{font-size:.88rem;color:var(--muted);margin:.3rem 0 0}',
  '.tablewrap{overflow-x:auto}',
  'table{border-collapse:collapse;width:100%;font-family:var(--mono);font-size:.83rem;',
  'font-variant-numeric:tabular-nums}',
  'th,td{text-align:right;padding:.55rem .6rem;border-bottom:1px solid var(--line-soft);',
  'white-space:nowrap}',
  'th{font-weight:500;font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;',
  'color:var(--muted)}',
  'th:first-child,td:first-child{text-align:left}',
  'td.dim{color:var(--muted)}td.zero{color:var(--zero)}td.good{color:var(--act)}',
  'ul.countries{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;',
  'gap:.4rem;font-family:var(--mono);font-size:.79rem}',
  'ul.countries li{display:flex;gap:.4rem;border:1px solid var(--line);border-radius:2px;',
  'padding:.25rem .55rem}',
  '.cc{font-weight:600}.ccn{color:var(--muted);font-variant-numeric:tabular-nums}',
  '.caveat{border-left:2px solid var(--act-bright);padding-left:1rem}',
  '.caveat p{margin:0 0 .7rem}.caveat p:last-child{margin-bottom:0}',
  'ol.branches{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1rem}',
  'ol.branches li{display:flex;gap:.9rem;align-items:flex-start}',
  '.verdict{font-family:var(--mono);font-size:.66rem;font-weight:600;text-transform:uppercase;',
  'letter-spacing:.08em;white-space:nowrap;border:1px solid var(--line);border-radius:2px;',
  'padding:.25rem .5rem;margin-top:.2rem;color:var(--muted)}',
  'footer{color:var(--muted);font-family:var(--mono);font-size:.73rem;text-align:center;',
  'line-height:1.7}',
  'a{color:inherit}',
  '@media (max-width:36rem){.step-value{font-size:1.6rem}.wrap{padding:2rem 1rem 3rem}}',
].join('');

const html = `<title>Curbcut Vital Signs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>${css}</style>

<div class="wrap">
  <header>
    <h1>Curbcut vital signs</h1>
    <p class="sub">Measured ${esc(measured)} &middot; ${rows.length} day${rows.length === 1 ? '' : 's'} of record</p>
  </header>

  ${truth ? `<section>
    <h2>The one honest measurement</h2>
    <p class="lead">Cloudflare had quietly injected an analytics beacon into our
      pages. Before removing it &mdash; we tell people this site carries no scripts
      &mdash; it was read once, with Cloudflare&rsquo;s own bot filter on. It was set
      to skip EU visitors, so <strong>these figures are non-EU only</strong>, and the
      EU is the market this is aimed at.</p>
    <ol class="funnel">
      <li>
        <div class="step-head">
          <span class="step-label">Visits, 24 hours, bots excluded</span>
          <span class="step-value">${n(truth.visits)}</span>
        </div>
        <p class="step-note">${esc(truth.window)}. Two days after two articles went out, so this is a peak and not a baseline.</p>
      </li>
      <li>
        <div class="step-head">
          <span class="step-label">Page views, same window</span>
          <span class="step-value">${n(truth.pageViews)}</span>
        </div>
        <p class="step-note">The user-agent method below reported 631 over the same period, but it counts everybody including EU visitors, so the two are not the same population and no honest ratio can be taken between them. The overstatement is large; its size is unknown.</p>
      </li>
    </ol>
  </section>` : ''}

  <section>
    <h2>The only question that matters yet</h2>
    <p class="lead">People arrive. The question is whether anything happens next.
      <strong>${n(totals.stylesheets)}</strong> browser page loads over
      ${measuredDays} measured day${measuredDays === 1 ? '' : 's'}, against
      ${n(totals.readerViews)} requests from clients merely <em>claiming</em> to be
      browsers. <strong>${n(totals.leads)}</strong> addresses have been left.</p>
    <ol class="funnel">${funnelRows}</ol>
  </section>

  <section>
    <h2>By day</h2>
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Browser loads</th>
            <th scope="col">UA-claimed</th>
            <th scope="col">Probes</th>
            <th scope="col">Search bots</th>
            <th scope="col">Scanner seen</th>
            <th scope="col">Scans run</th>
            <th scope="col">Addresses</th>
          </tr>
        </thead>
        <tbody>${dayRows}</tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Where the last day came from</h2>
    <ul class="countries">${countries}</ul>
  </section>

  <section>
    <h2>What these numbers are not</h2>
    <div class="caveat">
      <p><strong>The scanner figures are mine.</strong> Every scan recorded so far was
      run by me while testing the counter. No stranger has used it yet. When that
      changes it will show here, and it will be the first real signal this business
      has produced.</p>
      <p><strong>Two days is not a trend.</strong> Both days follow articles going out,
      so this is a spike and not a baseline. There is no chart on this page because
      two points cannot make one honestly.</p>
      <p><strong>The arrival figures over-count, by an unknown amount.</strong> A user
      agent is a string any script can set, so a filter built on one lets through every
      bot polite enough to lie. Cloudflare&rsquo;s own bot filter counted
      <strong>77</strong> page views across <strong>44</strong> visits where the method
      here reported 631 &mdash; but it had been set to skip EU visitors, so it measured
      a different population and the two cannot be divided into a correction factor.
      Read every arrival number here as an upper bound and nothing more.</p>
      <p><strong>${n(totals.probes)} requests were people looking for something to
      break into.</strong> WordPress login pages, <code>xmlrpc.php</code>, PHP shells
      dropped in theme folders, <code>.env</code> files, <code>.ssh/config</code>,
      Laravel logs. This site runs none of that. It is the background noise of the
      internet, it hits every domain, and it is excluded from the arrival figure
      rather than flattering it.</p>
      <p><strong>The shape looks like crawling, not reading.</strong> Requests spread
      evenly across every page rather than concentrating on one article, which is what
      a systematic crawler does and not what a person arriving from a link does. Our
      own site crawls, run several times a day while testing, are part of that.</p>
      <p><strong>Bulgaria is probably one script.</strong> It ranks high on both days
      with no plausible audience behind it, which is what a single crawler looks like
      from here.</p>
    </div>
  </section>

  <section>
    <h2>What happens on 30 September</h2>
    <ol class="branches">
      <li><span class="verdict">Fix the offer</span>
        <span>Traffic arrives, the scanner gets used, nobody leaves an address. The
        audience is right and the thing being asked of them is wrong.</span></li>
      <li><span class="verdict">Wrong room</span>
        <span>Traffic arrives and the scanner sits untouched. These are not buyers,
        and no amount of better copy fixes the channel.</span></li>
      <li><span class="verdict">Wind down</span>
        <span>Traffic dries up once the articles stop carrying it.</span></li>
    </ol>
  </section>

  <footer>Generated from business/metrics/daily.json<br>
  Arrivals from Cloudflare server logs, actions from our own counters<br>
  No cookies, no beacon, nobody tracked</footer>
</div>
`;

writeFileSync(OUT, html, 'utf8');
console.log('Wrote ' + OUT + ' (' + rows.length + ' days)');
