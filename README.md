# Curbcut

[![npm](https://img.shields.io/npm/v/curbcut?color=f5c344&label=npm)](https://www.npmjs.com/package/curbcut)
[![licence](https://img.shields.io/npm/l/curbcut?color=f5c344)](./LICENSE)

Map accessibility findings onto **EN 301 549** clauses, rank them by what a
regulator will actually ask about, and draft an accessibility statement that
does not lie on your behalf.

Built for the **European Accessibility Act**. MIT licensed, runs locally, sends
your pages nowhere.

**[curbcut.org](https://curbcut.org)**

```bash
npx curbcut https://example.com --statement
```

The first run needs a browser, once:

```bash
npx playwright install chromium
```

Curbcut drives a real browser so it sees the page the way a person does,
including anything rendered by JavaScript. Nothing is uploaded: the browser
runs on your machine and the report is written next to you.

## Try it on something broken

There is a deliberately inaccessible page published for exactly this purpose,
so you can check the output against a known answer instead of trusting a
screenshot:

```bash
npx curbcut https://curbcut.org/demo/broken.html
```

It should report five failing clauses across sixteen elements — two P1, one P2
and two P3. If it reports something else, that is a bug worth an issue.

## Scan a whole site

```bash
npx curbcut https://example.com --crawl
```

The crawler follows links from the starting URL, stays on that one origin, and
**obeys robots.txt**. A conformance claim covers a service you control, not
whatever you happen to link to, and a tool that lectures people about
compliance has no business ignoring the one machine-readable instruction a site
gives crawlers.

`--max-pages <n>` caps the run at 200 pages by default. If the cap is reached,
the run says so and reports how many known pages went unscanned, because a
report that silently covers less of the site than the reader assumes is worse
than no report.

`--ignore-robots` exists for sites you own. It is recorded in the output either
way.

## Why this exists

The EAA deadline passed on 28 June 2025. Enforcement started in June 2026, and
2026 is the first full year national authorities are supervising against it.
Penalties run from €5,000 to €40,000 in most member states, and up to 5% of
turnover for large companies.

Two things are on sale to solve this, and neither does.

**Overlay widgets** promise compliance from one line of JavaScript. In April
2025 the FTC fined accessiBe $1,000,000 for misrepresenting exactly that.
UserWay is defending a class action over similar claims. In the first half of
2025, **22.6% of US web accessibility lawsuits targeted sites that had an
overlay installed** — the widget is a liability, not a shield. The National
Federation of the Blind, the American Council of the Blind and hundreds of
disability organisations have said so publicly for years.

**Free statement generators** emit "this website is fully compliant" without
testing anything. A statement is a public claim. An unsupported one is the
first document anyone investigating you will read.

Meanwhile the good free scanners — axe-core, Lighthouse, Pa11y — give you a
list of rule IDs. Correct, useful, and not a thing you can hand to a regulator,
because conformance is claimed against clauses of EN 301 549, not against axe
rule names.

Curbcut fills that gap. It is the translation layer, not another widget.

## What it does

**Maps findings to the standard.** Every finding is reported as an EN 301 549
clause. WCAG 1.4.3 becomes clause 9.1.4.3, which is the form a conformance
claim takes.

**Knows which WCAG version is actually binding.** The harmonised standard is
EN 301 549 V3.2.1 (2021-03), and it adopts WCAG **2.1**. Criteria introduced in
WCAG 2.2 — target size, dragging movements, accessible authentication — are
good practice and are not current EAA obligations. Curbcut reports them,
separately and clearly marked. Tools that present them as legal requirements are
inflating your problem.

**Ranks by legal exposure, not by rule severity.** One unlabelled checkout
button outranks four hundred low-contrast footer links. Scoring weights whether
the clause is in the harmonised standard, whether the criterion is level A,
whether the failure blocks task completion outright, and only then how many
elements are affected — logarithmically, because four hundred instances of one
problem is usually one fix in one shared component.

**Says what it did not check.** Automated testing detects roughly 30 to 40
percent of WCAG failures. Curbcut prints the clauses it structurally cannot
evaluate, so a clean run reads as a starting point instead of an all-clear.

**Drafts a statement it can support.** The generator will not produce a
full-conformance claim from scan data, because scan data cannot support one.
Everything requiring a human decision stays a visible `[bracket]`.

## Usage

```bash
# One page, report only
npx curbcut https://example.com

# Several pages, with a statement draft and raw JSON
npx curbcut https://example.com https://example.com/checkout \
  --statement --json \
  --org-name "Example GmbH" \
  --org-email accessibility@example.com \
  --org-country Germany
```

| Option | Meaning |
| --- | --- |
| `--crawl` | Follow links from the starting URL and scan the whole site. One origin, obeys `robots.txt` |
| `--max-pages <n>` | Page cap while crawling. Default `200` |
| `--ignore-robots` | Crawl paths `robots.txt` disallows. For sites you own |
| `--pdf` | Also write a dated PDF conformance report |
| `--baseline <file>` | Compare against a previous `analysis.json` |
| `--fail-on-regression` | Exit non-zero if anything newly failed or got worse |
| `--out <dir>` | Output directory. Default `./curbcut-report` |
| `--statement` | Also draft an accessibility statement |
| `--json` | Also write the raw analysis |
| `--fail-on <band>` | Exit non-zero at or above this band. `P1` (default) … `P4`, or `none` |
| `--quiet` | Print only the summary line |

Output lands in `curbcut-report/`: `findings.md`, plus
`accessibility-statement.md`, `analysis.json` and `conformance-report.pdf` when
asked for.

### The PDF report

```bash
npx curbcut https://example.com --crawl --pdf --org-name "Example GmbH"
```

A dated A4 document you can attach to an email or hand to a client. It states
what was assessed, what failed and against which clause, which pages could not
be loaded, and which clauses no automated tool can evaluate. The coverage limit
is printed on the first page, above the findings, rather than in small type at
the end.

It is rendered by the same browser that does the scanning, so it adds no
dependency. It is deliberately plain: no cover art, no score out of ten, no
badge. Anything resembling a certificate would misrepresent what it is.

### Proving a fix happened

A single scan is a snapshot and proves nothing about direction. Two dated scans
and an honest diff between them are evidence.

```bash
# Record where you are today
npx curbcut https://example.com --crawl --json

# Later, after the work
npx curbcut https://example.com --crawl --baseline curbcut-report/analysis.json
```

Findings are matched by **clause**, not by axe rule. A clause can start failing
for a different reason than it did last month — the rule changes, the obligation
does not — and a diff keyed on rule ids would call that one fix plus one new
break, which badly describes a page that never stopped failing 9.4.1.2.

Four outcomes are reported separately, because they are different conversations:
newly failing, worse than baseline, no longer failing, and improved but still
failing.

If the later scan covered **fewer pages** than the baseline, the comparison says
so before anything else. Fewer failures can simply mean fewer pages were
assessed, and reporting that as progress would be a lie by arithmetic.

`--fail-on-regression` is for CI: fail the build when something breaks that used
to work, even if the absolute result is otherwise within tolerance.

### Priority bands

| Band | Meaning |
| --- | --- |
| **P1** | Blocks a user from completing a task, and the clause is in the harmonised standard. Fix first. |
| **P2** | A clear failure of a required clause. This cycle. |
| **P3** | A required clause, narrower reach or lower impact. |
| **P4** | Accessibility debt, or a criterion outside the currently harmonised standard. |

### In CI

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 20 }
- run: npx playwright install --with-deps chromium
- run: npx curbcut https://staging.example.com --fail-on P1
```

The build fails on P1 findings only, so a contrast regression in the footer
does not block a release while a keyboard trap does.

## Library use

```js
import { scanUrls, analyze, markdownReport, draftStatement } from 'curbcut';

const pages = await scanUrls(['https://example.com']);
const analysis = analyze(pages);

console.log(analysis.summary);
// { clausesFailing: 6, clausesFailingHarmonised: 5, totalElements: 53,
//   byPriority: { P1: 2, P2: 2, P3: 1, P4: 1 } }
```

## Limits, stated plainly

- Automated testing finds roughly a third of WCAG failures. The clauses in the
  "what this scan did not check" section were **not evaluated** — that is not
  the same as passing.
- Curbcut produces evidence toward a conformance claim. It does not produce the
  claim, and it is not legal advice.
- Nothing here makes you compliant. Fixing what it finds, and then testing with
  people who use assistive technology, is what does that.

Detection is powered by [axe-core](https://github.com/dequelabs/axe-core)
(Mozilla Public License 2.0), which does the hard rule work. Curbcut adds the
standard mapping, the risk model and the reporting on top.

## License

MIT
