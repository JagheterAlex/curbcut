#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanUrls } from '../src/scan.js';
import { crawlAndScan } from '../src/crawl.js';
import { analyze } from '../src/analyze.js';
import { markdownReport } from '../src/report.js';
import { draftStatement } from '../src/statement.js';
import { writePdf } from '../src/pdf.js';
import { compareAnalyses, describeComparison } from '../src/baseline.js';

const USAGE = `
curbcut — map accessibility findings to EN 301 549 clauses

  curbcut <url> [url...] [options]

Options
  --crawl              Follow links from the starting URL and scan the whole
                       site. Stays on one origin and obeys robots.txt.
  --max-pages <n>      Page cap while crawling (default: 200)
  --ignore-robots      Crawl paths robots.txt disallows. Only for a site you
                       own, and it is recorded in the report either way.
  --out <dir>          Write output files to <dir> (default: ./curbcut-report)
  --pdf                Also write a dated PDF conformance report
  --baseline <file>    Compare against a previous analysis.json and report what
                       changed. Writes comparison.md
  --fail-on-regression Exit non-zero if anything newly failed or got worse,
                       even when the absolute result is otherwise acceptable
  --statement          Also draft an accessibility statement
  --json               Also write the raw analysis as JSON
  --org-name <name>    Organisation name, used in the statement
  --org-email <email>  Contact address for accessibility feedback
  --org-country <c>    Country, used to prompt for the right enforcement body
  --fail-on <band>     Exit non-zero at or above this band: P1, P2, P3, P4, none
                       (default: P1)
  --quiet              Only print the summary line
  -h, --help           Show this

Exit codes
  0  no findings at or above --fail-on
  1  findings at or above --fail-on
  2  bad usage, or no page could be scanned

Automated testing detects roughly 30 to 40 percent of WCAG failures. A clean
run is a starting point, not a conformance claim.
`;

function parseArgs(argv) {
  const opts = {
    urls: [], out: 'curbcut-report', statement: false, json: false,
    org: {}, failOn: 'P1', quiet: false, help: false, pdf: false,
    baseline: null, failOnRegression: false,
    crawl: false, maxPages: 200, ignoreRobots: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--out': opts.out = next(); break;
      case '--statement': opts.statement = true; break;
      case '--pdf': opts.pdf = true; break;
      case '--baseline': opts.baseline = next(); break;
      case '--fail-on-regression': opts.failOnRegression = true; break;
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--crawl': opts.crawl = true; break;
      case '--ignore-robots': opts.ignoreRobots = true; break;
      case '--max-pages': opts.maxPages = Number(next()); break;
      case '--org-name': opts.org.name = next(); break;
      case '--org-email': opts.org.email = next(); break;
      case '--org-country': opts.org.country = next(); break;
      case '--fail-on': opts.failOn = next(); break;
      default:
        if (a.startsWith('-')) { console.error('Unknown option: ' + a); process.exit(2); }
        opts.urls.push(a);
    }
  }
  return opts;
}

const BAND_ORDER = ['P1', 'P2', 'P3', 'P4'];

const opts = parseArgs(process.argv.slice(2));

if (opts.help || opts.urls.length === 0) {
  console.log(USAGE.trim());
  process.exit(opts.help ? 0 : 2);
}

const log = (...a) => { if (!opts.quiet) console.error(...a); };

if (opts.crawl && opts.urls.length !== 1) {
  console.error('--crawl takes exactly one starting URL.');
  process.exit(2);
}
if (opts.crawl && (!Number.isInteger(opts.maxPages) || opts.maxPages < 1)) {
  console.error('--max-pages must be a positive whole number.');
  process.exit(2);
}

let pages;
let crawlResult = null;

if (opts.crawl) {
  log('Crawling ' + opts.urls[0] + '…');
  crawlResult = await crawlAndScan(opts.urls[0], {
    maxPages: opts.maxPages,
    respectRobots: !opts.ignoreRobots,
    onProgress: (url, n) => log('  [' + n + '] ' + url),
    onSkip: (url) => log('  skipped by robots.txt: ' + url),
  });
  pages = crawlResult.pages;
  if (crawlResult.reachedLimit) {
    log('');
    log('Stopped at the --max-pages limit of ' + opts.maxPages + '. ' +
        crawlResult.notReached + ' known page(s) were not scanned, so this run ' +
        'does not cover the whole site.');
  }
} else {
  log('Scanning ' + opts.urls.length + ' page' + (opts.urls.length === 1 ? '' : 's') + '…');
  pages = await scanUrls(opts.urls, {
    onProgress: (url) => log('  ' + url),
  });
}

const analysis = analyze(pages);

if (analysis.scannedPages === 0) {
  console.error('No page could be scanned.');
  for (const e of analysis.errors) console.error('  ' + e.url + ' — ' + e.message);
  process.exit(2);
}

mkdirSync(opts.out, { recursive: true });

const target = opts.crawl
  ? opts.urls[0] + ' (crawled, ' + pages.length + ' page' + (pages.length === 1 ? '' : 's') + ')'
  : (opts.urls.length === 1 ? opts.urls[0] : opts.urls.length + ' pages');
writeFileSync(join(opts.out, 'findings.md'), markdownReport(analysis, { target }), 'utf8');

if (opts.json) {
  writeFileSync(join(opts.out, 'analysis.json'), JSON.stringify(analysis, null, 2), 'utf8');
}
let diff = null;
if (opts.baseline) {
  let before;
  try {
    before = JSON.parse(readFileSync(opts.baseline, 'utf8'));
  } catch (err) {
    console.error('Could not read the baseline at ' + opts.baseline + ' — ' + err.message);
    process.exit(2);
  }
  diff = compareAnalyses(before, analysis);
  const text = describeComparison(diff);
  writeFileSync(
    join(opts.out, 'comparison.md'),
    [
      '# Change since the baseline',
      '',
      'Baseline: `' + opts.baseline + '`  ',
      'Compared: ' + new Date().toISOString(),
      '',
      '```',
      text,
      '```',
      '',
    ].join('\n'),
    'utf8'
  );
  if (!opts.quiet) {
    console.error('');
    console.error(text);
    console.error('');
  }
}

if (opts.pdf) {
  const file = join(opts.out, 'conformance-report.pdf');
  await writePdf(analysis, {
    target,
    scannedUrls: pages.filter((p) => !p.error).map((p) => p.url),
    orgName: opts.org.name,
  }, file);
  log('  wrote ' + file);
}
if (opts.statement) {
  const site = opts.urls[0];
  writeFileSync(
    join(opts.out, 'accessibility-statement.md'),
    draftStatement(analysis, { site, ...opts.org }),
    'utf8'
  );
}

const s = analysis.summary;
console.log(
  s.clausesFailingHarmonised + ' clause(s) of the harmonised standard failing · ' +
  s.totalElements + ' element(s) · ' +
  'P1 ' + s.byPriority.P1 + ' P2 ' + s.byPriority.P2 +
  ' P3 ' + s.byPriority.P3 + ' P4 ' + s.byPriority.P4 +
  ' · written to ' + opts.out
);

if (opts.failOnRegression && diff && (diff.introduced.length > 0 || diff.regressed.length > 0)) {
  process.exit(1);
}

if (opts.failOn === 'none') process.exit(0);
const cutoff = BAND_ORDER.indexOf(opts.failOn);
if (cutoff === -1) { console.error('Bad --fail-on value: ' + opts.failOn); process.exit(2); }
const triggered = analysis.findings.some((f) => BAND_ORDER.indexOf(f.priority) <= cutoff);
process.exit(triggered ? 1 : 0);
