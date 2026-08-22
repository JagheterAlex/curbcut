// How ready is the European web for the WCAG 2.2 criteria arriving in
// EN 301 549 V4.1.1?
//
// Nobody has published this, and we have no clients yet, so we have no case
// studies either. Measuring somebody else's problem is the one kind of evidence
// available to a business with no customers.
//
// Method, stated so it can be argued with:
//
//   Sample      Domains from the Tranco research list whose TLD belongs to an
//               EU member state, in rank order. Tranco averages five ranking
//               providers over thirty days to resist the manipulation that
//               single-source top-site lists suffer from, and pins each list to
//               an id so a study can be repeated exactly.
//   Unit        One page per site, the apex URL, loaded twice. Never a crawl.
//               This is somebody else's server and we are uninvited.
//   Agreement   Only criteria that fail on both loads are counted. A single
//               load of a commercial page is a sample of one: the pilot had a
//               site pass target size on one load and fail on the next.
//               Disagreement is reported rather than averaged away.
//   Exclusions  Recorded, never silently dropped: robots.txt disallows it, it
//               did not load, it redirected off its own domain, or a stylesheet
//               failed. Infrastructure domains fall out here on their own
//               rather than by our opinion of what counts as a site.
//   Publication Aggregate only. Naming companies is legal and would get more
//               attention, and it would turn a measurement into an accusation
//               from a vendor who sells the fix. WebAIM has published the same
//               shape of study for years without naming anybody.
//
// The headline this can honestly carry is narrow: of the six criteria arriving,
// automated testing reaches one. The finding is about target size, and the rest
// of the story is the five nobody can measure at scale, us included.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { runAxe, watchAssets, provenanceOf, browserMissingError } from '../src/scan.js';
import { analyze } from '../src/analyze.js';
import { parseRobots } from '../src/robots.js';
import { INCOMING_CHANGES } from '../src/en301549.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', '..', 'business', 'benchmark');

const EU_TLDS = new Set(
  'at be bg hr cy cz dk ee fi fr de gr hu ie it lv lt lu mt nl pl pt ro sk si es se eu'
    .split(' ')
);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? fallback : args[i + 1];
};
const LIST = opt('list', join(HERE, 'tranco.csv'));
const LIMIT = Number(opt('limit', 25));
const LIST_ID = opt('list-id', 'unknown');
const DELAY_MS = Number(opt('delay', 1200));

const ARRIVING = INCOMING_CHANGES.arriving;
const CHECKABLE = ARRIVING.filter((c) => c.automatable).map((c) => c.criterion);

function sample(path, limit) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const [rank, domain] = line.trim().split(',');
    if (!domain) continue;
    if (!EU_TLDS.has(domain.split('.').pop().toLowerCase())) continue;
    out.push({ rank: Number(rank), domain });
    if (out.length >= limit) break;
  }
  return out;
}

async function robotsAllows(origin) {
  try {
    const res = await fetch(origin + '/robots.txt', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return true;
    return parseRobots(await res.text()).isAllowed('/');
  } catch {
    // A robots file we cannot read is not a refusal.
    return true;
  }
}

/**
 * Many EU sites answer an uninvited visitor with a consent dialog before
 * anything else. Whatever gets measured then is partly the dialog, and a
 * target-size figure that silently mixes the two is measuring cookie banners
 * and calling it the European web.
 *
 * We do not click it away. Dismissing consent on somebody else's site,
 * unattended and at scale, is not ours to do, so it is recorded and reported as
 * its own group instead.
 */
function detectConsent(page) {
  return page.evaluate(() => {
    const words = /\b(accept all|reject all|consent|cookies?|zustimmen|akzeptieren|einwilligung|accepter|refuser|consentement|aceptar|rechazar|consentimento|accetta|rifiuta|consenso|akceptuj|zgoda|godkann|accepter|hyvaksy|toestemming|accepteren)\b/i;
    const visible = [...document.querySelectorAll(
      '[id*="consent" i],[class*="consent" i],[id*="cookie" i],[class*="cookie" i],' +
      '[id*="gdpr" i],[class*="gdpr" i],[role="dialog"],dialog[open]'
    )].filter((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 200 && r.height > 80 &&
        st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.1;
    });
    if (!visible.length) return { present: false };

    const worded = visible.filter((el) => words.test(el.innerText || ''));
    if (!worded.length) return { present: false };

    const biggest = worded.reduce((a, b) =>
      a.getBoundingClientRect().height >= b.getBoundingClientRect().height ? a : b);
    const r = biggest.getBoundingClientRect();
    const share = (r.width * r.height) / (window.innerWidth * window.innerHeight);
    return {
      present: true,
      // Covering most of the viewport means the site underneath was never
      // really assessed at all.
      blocking: share > 0.4,
      viewportShare: Math.round(share * 100) / 100,
    };
  }).catch(() => ({ present: false, error: true }));
}

async function measureOnce(context, origin, domain) {
  const page = await context.newPage();
  const assetProblems = watchAssets(page);
  try {
    const response = await page.goto(origin, {
      waitUntil: 'domcontentloaded', timeout: 25000,
    });
    const status = response ? response.status() : 0;
    if (status >= 400) throw new Error('HTTP ' + status);

    // Redirected to a different registrable domain: whatever we would be
    // measuring, it is not the site we sampled.
    const landed = new URL(page.url()).hostname.replace(/^www\./, '');
    if (!landed.endsWith(domain.replace(/^www\./, ''))) {
      throw new Error('redirected to ' + landed);
    }

    await page.waitForTimeout(1200);
    const consent = await detectConsent(page);
    const axeResults = await runAxe(page);
    const analysis = analyze([{
      url: page.url(),
      provenance: provenanceOf(axeResults),
      violations: axeResults.violations,
      incomplete: axeResults.incomplete,
      assetProblems,
    }]);

    // A page whose stylesheet did not arrive fails layout rules the real page
    // passes, and target size is exactly such a rule. That bug cost us a day in
    // August and it is not going into a published statistic.
    //
    // Stylesheets only. A large commercial site nearly always has a third-party
    // script that fails, and a dead analytics beacon changes no geometry.
    // Rejecting on those excluded most of the first pilot for a reason that
    // could not affect the finding.
    const cssFailed = analysis.assetWarnings
      .flatMap((w) => w.problems)
      .filter((a) => /\.css(\?|$)/i.test(a.url));
    if (cssFailed.length) {
      throw new Error('stylesheet did not load (' + cssFailed.length + ')');
    }

    return {
      failing: analysis.findings.map((f) => f.criterion),
      harmonised: analysis.summary.clausesFailingHarmonised,
      elements: analysis.summary.totalElements,
      consent,
      engine: analysis.provenance.engine,
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const sites = sample(LIST, LIMIT);
  console.error(`Sampling ${sites.length} EU-TLD domains from Tranco ${LIST_ID}.`);
  console.error(`Two loads each, ${DELAY_MS}ms apart, robots.txt respected.\n`);

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    throw browserMissingError(err) ?? err;
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // Say who we are. A site that wants to refuse us should be able to.
    userAgent: 'Mozilla/5.0 (compatible; CurbcutResearch/1.0; +https://curbcut.org/research)',
  });

  const results = [];
  const pause = () => new Promise((r) => setTimeout(r, DELAY_MS));

  try {
    for (const [i, site] of sites.entries()) {
      const origin = 'https://' + site.domain;
      const label = `[${i + 1}/${sites.length}] ${site.domain}`;

      if (!(await robotsAllows(origin))) {
        console.error(label + ' — excluded: robots.txt');
        results.push({ ...site, excluded: 'robots.txt' });
        continue;
      }

      let first;
      let second;
      try {
        first = await measureOnce(context, origin, site.domain);
        await pause();
        second = await measureOnce(context, origin, site.domain);
      } catch (err) {
        console.error(label + ' — excluded: ' + err.message);
        results.push({ ...site, excluded: err.message });
        await pause();
        continue;
      }

      const agreed = first.failing.filter((c) => second.failing.includes(c));
      const unstable = [...new Set([...first.failing, ...second.failing])]
        .filter((c) => !agreed.includes(c));

      results.push({
        ...site,
        ok: true,
        harmonisedClausesFailing: Math.min(first.harmonised, second.harmonised),
        elements: Math.min(first.elements, second.elements),
        arrivingFailed: CHECKABLE.filter((c) => agreed.includes(c)),
        allFailing: agreed,
        // Failed on one load and not the other. Not noise to be averaged away:
        // it means what a regulator sees depends on when they look.
        unstable,
        consent: first.consent,
        engine: first.engine,
      });

      console.error(
        label + ' — ' + Math.min(first.harmonised, second.harmonised) + ' clause(s), ' +
        (agreed.includes('2.5.8') ? 'FAILS target size'
          : unstable.includes('2.5.8') ? 'target size UNSTABLE' : 'target size ok') +
        (first.consent.present
          ? (first.consent.blocking ? ' [consent wall]' : ' [consent banner]') : '') +
        (unstable.length ? ' {' + unstable.length + ' unstable}' : '')
      );
      await pause();
    }
  } finally {
    await browser.close();
  }

  const measured = results.filter((r) => r.ok);
  const payload = {
    method: {
      list: 'Tranco ' + LIST_ID,
      selection: 'Domains with an EU member state TLD, in Tranco rank order',
      loadsPerSite: 2,
      countedWhen: 'the criterion failed on both loads',
      sampled: sites.length,
      measured: measured.length,
      excluded: results.length - measured.length,
      runAt: new Date().toISOString(),
      engine: measured[0]?.engine ?? 'unknown',
    },
    consent: {
      withBanner: measured.filter((r) => r.consent?.present).length,
      blockingThePage: measured.filter((r) => r.consent?.blocking).length,
      note: 'Consent dialogs were never dismissed. Sites showing one were ' +
        'measured as an uninvited visitor sees them, which is also how a ' +
        'regulator arrives.',
    },
    instability: {
      sitesDisagreeingBetweenLoads: measured.filter((r) => r.unstable.length).length,
      note: 'Two loads of the same page, seconds apart, produced different ' +
        'findings on these sites. Nothing was fixed in between. It is the ' +
        'reason a dated one-off audit describes a moment rather than a site.',
    },
    arriving: ARRIVING.map((c) => ({
      criterion: c.criterion,
      title: c.title,
      level: c.level,
      automatable: c.automatable,
      failing: c.automatable
        ? measured.filter((r) => r.arrivingFailed.includes(c.criterion)).length
        : null,
    })),
    results,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, 'run-' + new Date().toISOString().slice(0, 10) + '.json');
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.error('\n--- measured ' + measured.length + ' of ' + sites.length + ' ---');
  for (const c of payload.arriving) {
    console.error('  ' + c.criterion.padEnd(7) + c.title.padEnd(38) +
      (c.automatable ? c.failing + '/' + measured.length + ' failing' : 'needs a person'));
  }
  console.error('  consent banner on ' + payload.consent.withBanner +
    ', blocking the page on ' + payload.consent.blockingThePage);
  console.error('  disagreed between two loads: ' +
    payload.instability.sitesDisagreeingBetweenLoads);
  console.error('\nWrote ' + file);
}

await main();
