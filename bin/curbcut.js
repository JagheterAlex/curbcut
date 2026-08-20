#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanUrls } from '../src/scan.js';
import { analyze } from '../src/analyze.js';
import { markdownReport } from '../src/report.js';
import { draftStatement } from '../src/statement.js';

const USAGE = `
curbcut — map accessibility findings to EN 301 549 clauses

  curbcut <url> [url...] [options]

Options
  --out <dir>          Write output files to <dir> (default: ./curbcut-report)
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
    org: {}, failOn: 'P1', quiet: false, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--out': opts.out = next(); break;
      case '--statement': opts.statement = true; break;
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
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

log('Scanning ' + opts.urls.length + ' page' + (opts.urls.length === 1 ? '' : 's') + '…');

const pages = await scanUrls(opts.urls, {
  onProgress: (url) => log('  ' + url),
});

const analysis = analyze(pages);

if (analysis.scannedPages === 0) {
  console.error('No page could be scanned.');
  for (const e of analysis.errors) console.error('  ' + e.url + ' — ' + e.message);
  process.exit(2);
}

mkdirSync(opts.out, { recursive: true });

const target = opts.urls.length === 1 ? opts.urls[0] : opts.urls.length + ' pages';
writeFileSync(join(opts.out, 'findings.md'), markdownReport(analysis, { target }), 'utf8');

if (opts.json) {
  writeFileSync(join(opts.out, 'analysis.json'), JSON.stringify(analysis, null, 2), 'utf8');
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

if (opts.failOn === 'none') process.exit(0);
const cutoff = BAND_ORDER.indexOf(opts.failOn);
if (cutoff === -1) { console.error('Bad --fail-on value: ' + opts.failOn); process.exit(2); }
const triggered = analysis.findings.some((f) => BAND_ORDER.indexOf(f.priority) <= cutoff);
process.exit(triggered ? 1 : 0);
