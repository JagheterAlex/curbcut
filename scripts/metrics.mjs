// Daily metrics snapshot.
//
// Cloudflare's free plan keeps zone analytics for a short window, so a number
// that is not written down today cannot be looked up in October. The hypothesis
// check at the end of September needs a series, not a screenshot, and it needs
// to survive the data ageing out from under it. Every run merges into
// business/metrics/daily.json and never overwrites a day it did not measure.
//
// Two sources, deliberately separate:
//   arrivals  — Cloudflare's server-side request statistics. No beacon, no JS.
//   actions   — our own aggregate counters in D1. See monitor/src/usage.js.
//
// Arrivals without actions is the whole question. A site can be visited by
// hundreds of people a day and still be a failure, and a month of page views
// with nothing behind them is a fact worth recording rather than avoiding.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

function token() {
  const cfg = join(
    process.env.APPDATA ?? '',
    'xdg.config', '.wrangler', 'config', 'default.toml'
  );
  const m = readFileSync(cfg, 'utf8').match(/^oauth_token = "(.+)"$/m);
  if (!m) throw new Error('No oauth_token in ' + cfg + ' — run `wrangler login`.');
  return m[1];
}

const day = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

async function cf(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json', ...(init?.headers) },
  });
  const body = await res.json();
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

async function sql(statement) {
  const body = await cf(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,
    { method: 'POST', body: JSON.stringify({ sql: statement }) }
  );
  return body.result[0].results;
}

async function actions() {
  const rows = await sql('SELECT day, event, hits FROM usage_daily ORDER BY day ASC;');
  const out = {};
  for (const r of rows) {
    out[r.day] ??= {};
    out[r.day][r.event] = r.hits;
  }
  return out;
}

const since = day(13);
const until = day(0);

const [seen, did, leads] = await Promise.all([
  arrivals(since, until),
  actions(),
  sql('SELECT COUNT(*) AS n FROM interest;').then((r) => r[0].n),
]);

mkdirSync(dirname(OUT), { recursive: true });
const history = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

for (const date of new Set([...Object.keys(seen), ...Object.keys(did)])) {
  history[date] = { ...history[date], ...(seen[date] ?? {}), actions: did[date] ?? {} };
}
history.meta = { lastRun: new Date().toISOString(), interestTotal: leads };

writeFileSync(OUT, JSON.stringify(history, null, 2) + '\n', 'utf8');

const dates = Object.keys(history).filter((k) => k !== 'meta').sort();
const pad = (v, n) => String(v).padStart(n);
console.log('date         views  readers  bots  uniq | viewed  ran  cached  leads');
for (const d of dates) {
  const h = history[d];
  const a = h.actions ?? {};
  console.log(
    d + ' ' + pad(h.pageViews ?? 0, 7) + pad(h.readerViews ?? 0, 9) + pad(h.searchBotViews ?? 0, 6) +
    pad(h.uniques ?? 0, 6) + ' |' + pad(a.scan_viewed ?? 0, 7) + pad(a.scan_ran ?? 0, 5) +
    pad(a.scan_cached ?? 0, 8) + pad(a.interest_left ?? 0, 7)
  );
}
console.log('\nAddresses left, all time: ' + leads);
console.log('Written to ' + OUT);
