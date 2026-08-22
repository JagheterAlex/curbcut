// Daily metrics snapshot.
//
// Cloudflare's free plan keeps zone analytics for a short window, so a number
// that is not written down today cannot be looked up in October. The hypothesis
// check at the end of September needs a series, not a screenshot, and it needs
// to survive the data ageing out from under it. Every run merges into
// business/metrics/daily.json and never overwrites a day it did not measure.
//
// Three sources, deliberately separate:
//   arrivals  — Cloudflare's server-side request statistics. No beacon, no JS.
//   actions   — our own aggregate counters in D1. See monitor/src/usage.js.
//   adoption  — npm downloads of the command line tool.
//
// The arrival figure that matters is `stylesheetFetches`, not page requests. A
// crawler asks for the HTML and stops; a browser goes back for style.css. Over
// one 23-hour window this site served 1,040 page requests and 87 stylesheets,
// while Cloudflare's own bot-filtered analytics counted 77 page views. Those
// last two agreeing to within a rounding error is the whole argument for the
// method, and it needs no JavaScript on the page, which is the point: we tell
// people this site carries no scripts.
//
// It under-counts returning visitors, whose browser has the stylesheet cached.
// A floor we can defend beats a ceiling we cannot.
//
// Arrivals without actions is the whole question. A site can be visited by
// hundreds of people a day and still be a failure, and a month of page views
// with nothing behind them is a fact worth recording rather than avoiding.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'business', 'metrics', 'daily.json');

const ACCOUNT = '911235ab4dc2e06ea9396d8aee285469';
const ZONE = 'fd0c67aa8730bc81ee31900a7bb04bf7';
const DB = '03bade3a-799a-481c-8eab-1e4978a6ddcc';

// Traffic from our own machine is not an audience. Ukraine is where this is
// built, so it is excluded from the "real arrivals" figure rather than quietly
// inflating it. Headless Chrome and curl are our own crawls of our own site.
const OUR_COUNTRY = 'UA';
const NOT_A_READER = new Set(['ChromeHeadless', 'Curl', 'Unknown', 'HeadlessChrome']);

const CONFIG = join(
  process.env.APPDATA ?? '',
  'xdg.config', '.wrangler', 'config', 'default.toml'
);

function token() {
  const m = readFileSync(CONFIG, 'utf8').match(/^oauth_token = "(.+)"$/m);
  if (!m) throw new Error('No oauth_token in ' + CONFIG + ' — run `wrangler login`.');
  return m[1];
}

// The wrangler OAuth token lasts about an hour, which is shorter than the gap
// between runs of this script. Wrangler refreshes it whenever it runs, so a
// throwaway command is the whole recovery: no second credential to store, and
// nothing for a person to do at three in the morning. Called once, on the first
// authentication failure, and never in a loop.
function refreshToken() {
  execFileSync('npx', ['wrangler', 'whoami'], {
    stdio: 'ignore', shell: true, cwd: join(HERE, '..'),
  });
}

const day = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

const isAuthError = (body) =>
  Array.isArray(body?.errors) && body.errors.some((e) => e.code === 10000);

async function cf(url, init, retried = false) {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json', ...(init?.headers) },
  });
  const body = await res.json();

  if (isAuthError(body) && !retried) {
    refreshToken();
    return cf(url, init, true);
  }
  if (!body.success && body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 300));
  return body;
}

async function arrivals(since, until) {
  const query = `query($zone:String!,$since:Date!,$until:Date!){
    viewer{zones(filter:{zoneTag:$zone}){
      httpRequests1dGroups(limit:60,filter:{date_geq:$since,date_leq:$until},orderBy:[date_ASC]){
        dimensions{date}
        sum{requests pageViews
            countryMap{clientCountryName requests}
            browserMap{uaBrowserFamily pageViews}}
        uniq{uniques}
      }}}}`;
  const body = await cf('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, variables: { zone: ZONE, since, until } }),
  });
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 300));

  const out = {};
  for (const g of body.data.viewer.zones[0].httpRequests1dGroups) {
    const date = g.dimensions.date;
    const ours = g.sum.countryMap.find((c) => c.clientCountryName === OUR_COUNTRY);
    const readers = g.sum.browserMap
      .filter((b) => !NOT_A_READER.has(b.uaBrowserFamily))
      .reduce((n, b) => n + b.pageViews, 0);
    const bots = g.sum.browserMap
      .filter((b) => /bot|spider|crawl/i.test(b.uaBrowserFamily))
      .reduce((n, b) => n + b.pageViews, 0);
    out[date] = {
      requests: g.sum.requests,
      pageViews: g.sum.pageViews,
      uniques: g.uniq.uniques,
      ourRequests: ours ? ours.requests : 0,
      readerViews: readers,
      searchBotViews: bots,
      topCountries: g.sum.countryMap
        .filter((c) => c.clientCountryName !== OUR_COUNTRY)
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 6)
        .map((c) => c.clientCountryName + ':' + c.requests),
    };
  }
  return out;
}

// One day is the widest window the free plan allows on this dataset, so this is
// a daily snapshot or nothing.
async function todayDetail() {
  const since = new Date(Date.now() - 23 * 3600 * 1000).toISOString().slice(0, 19) + 'Z';
  const query = `query($zone:String!,$since:Time!){
    viewer{zones(filter:{zoneTag:$zone}){
      httpRequestsAdaptiveGroups(limit:300,filter:{datetime_geq:$since},orderBy:[count_DESC]){
        count dimensions{clientRequestPath}
      }}}}`;
  const body = await cf('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, variables: { zone: ZONE, since } }),
  });
  if (body.errors) return null;

  // Anything looking for a config file, a credential or a PHP shell. We do not
  // run PHP or WordPress; this is the background noise of the internet, and
  // counting it as audience would flatter us every single day.
  const PROBE = /\.(env|ssh|git|sql|bak|ya?ml|log|ini|php|asp|aspx)$|wp-|xmlrpc|actuator|laravel|credential|phpinfo|\/\./i;
  const PAGE =
    /^\/($|blog|scan$|scan\/example$|audit$|research$|privacy$|terms$|accessibility$|wcag-2-2$|demo\/)/;

  let stylesheetFetches = 0, pageRequests = 0, probeRequests = 0;
  for (const r of body.data.viewer.zones[0].httpRequestsAdaptiveGroups) {
    const path = r.dimensions.clientRequestPath;
    const c = r.count;
    // Only the site's own stylesheet. The demo page loads /demo/broken.css, and
    // its advert frame loads it a second time, so counting every .css would
    // credit one visitor to the demo with three browsers.
    if (path === '/style.css') stylesheetFetches += c;
    else if (/\.css$/i.test(path)) continue;
    else if (path.startsWith('/cdn-cgi/')) continue;
    else if (PROBE.test(path)) probeRequests += c;
    else if (PAGE.test(path) && !path.split('/').pop().includes('.')) pageRequests += c;
  }
  return { stylesheetFetches, pageRequests, probeRequests };
}

// Downloads of the published tool. Public, unauthenticated, and the one number
// here that nobody can inflate by pointing a crawler at us.
/**
 * npm downloads, and why the weekly total means almost nothing on its own.
 *
 * The first week returned 269, every one of them on 20 August, the day the
 * package first appeared. Zero on the days 0.4.0, 0.5.0 and 0.6.0 went out.
 * That is registry mirrors and scrapers ingesting a new name, not people
 * installing a tool: adoption arrives as a trickle across days, never as one
 * spike on publication day followed by silence.
 *
 * So the daily series is fetched alongside the total. Downloads spread over
 * several days mean something. A week that is one spike means a robot found us.
 */
async function npmDownloads() {
  try {
    const res = await fetch('https://api.npmjs.org/downloads/point/last-week/curbcut');
    const body = await res.json();
    return typeof body.downloads === 'number' ? body.downloads : null;
  } catch {
    return null;
  }
}

async function sql(statement) {
  const body = await cf(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,
    { method: 'POST', body: JSON.stringify({ sql: statement }) }
  );
  return body.result[0].results;
}

// Hits we know were ours, before self-tests started sending a header that keeps
// them out of the counters. Subtracted here rather than deleted from the
// database: the raw table stays a faithful record of what the Worker saw, and
// the correction stays visible instead of being quietly disappeared.
//
// This list must not grow. If it does, something is calling production without
// the x-curbcut-selftest header — fix that instead of adding a row.
const SELF_TESTS = {
  '2026-08-22': { audit_viewed: 9, example_viewed: 3, scan_ran: 1, scan_viewed: 2 },
};

async function actions() {
  const rows = await sql('SELECT day, event, hits FROM usage_daily ORDER BY day ASC;');
  const out = {};
  for (const r of rows) {
    out[r.day] ??= {};
    out[r.day][r.event] = Math.max(0, r.hits - (SELF_TESTS[r.day]?.[r.event] ?? 0));
  }
  return out;
}

const since = day(13);
const until = day(0);

async function npmDaily() {
  try {
    const res = await fetch(
      `https://api.npmjs.org/downloads/range/${day(13)}:${day(0)}/curbcut`
    );
    if (!res.ok) return null;
    const rows = ((await res.json()).downloads ?? []).filter((r) => r.downloads > 0);
    if (!rows.length) return null;
    const total = rows.reduce((n, r) => n + r.downloads, 0);
    return {
      total,
      daysWithAny: rows.length,
      // One day carrying nearly the whole total is a mirror, not an audience.
      looksLikeMirrors: Math.max(...rows.map((r) => r.downloads)) / total > 0.9,
      byDay: Object.fromEntries(rows.map((r) => [r.day, r.downloads])),
    };
  } catch { return null; }
}

const [seen, did, leads, detail, npmWeek, npm14] = await Promise.all([
  arrivals(since, until),
  actions(),
  sql('SELECT COUNT(*) AS n FROM interest;').then((r) => r[0].n),
  todayDetail(),
  npmDownloads(),
  npmDaily(),
]);

mkdirSync(dirname(OUT), { recursive: true });
const history = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

for (const date of new Set([...Object.keys(seen), ...Object.keys(did)])) {
  history[date] = { ...history[date], ...(seen[date] ?? {}), actions: did[date] ?? {} };
}
if (detail) {
  history[until] = { ...history[until], ...detail };
}
history.meta = {
  lastRun: new Date().toISOString(),
  interestTotal: leads,
  npmDownloadsLastWeek: npmWeek,
  npm: npm14,
};

writeFileSync(OUT, JSON.stringify(history, null, 2) + '\n', 'utf8');

// A day key is a date. Everything else in the file is metadata, and treating
// one as a day printed a phantom row — the same bug twice, in two scripts.
const dates = Object.keys(history).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
const pad = (v, n) => String(v).padStart(n);
console.log('date          css*  pageReq  probes | viewed  ran  leads');
for (const d of dates) {
  const h = history[d];
  const a = h.actions ?? {};
  console.log(
    d + pad(h.stylesheetFetches ?? '-', 7) + pad(h.pageRequests ?? '-', 9) +
    pad(h.probeRequests ?? '-', 8) + ' |' + pad(a.scan_viewed ?? 0, 7) +
    pad(a.scan_ran ?? 0, 5) + pad(a.interest_left ?? 0, 7)
  );
}
console.log('\n* stylesheet fetches: the closest thing to a real browser we can');
console.log('  count without putting a script on the page. Under-counts repeat');
console.log('  visitors, whose browser already has it cached.');
if (npmWeek !== null) console.log('\nnpm downloads, last week: ' + npmWeek);
if (npm14) {
  console.log('  spread over ' + npm14.daysWithAny + ' day(s) of the last 14: ' +
    Object.entries(npm14.byDay).map(([d, n]) => d.slice(5) + '=' + n).join(' '));
  if (npm14.looksLikeMirrors) {
    console.log('  NOT ADOPTION. One day carries over 90 per cent of the total,');
    console.log('  which is what registry mirrors ingesting a new name look like.');
  }
}
console.log('\nAddresses left, all time: ' + leads);
console.log('Written to ' + OUT);
