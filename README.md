# Curbcut

Map accessibility findings onto **EN 301 549** clauses, rank them by what a
regulator will actually ask about, and draft an accessibility statement that
does not lie on your behalf.

Built for the **European Accessibility Act**. MIT licensed, runs locally, sends
your pages nowhere.

**[curbcut.org](https://curbcut.org)**

```bash
npx curbcut https://example.com --statement
```

> **Not published to npm yet.** The command above will work once it is. Until
> then:
> ```bash
> git clone https://github.com/JagheterAlex/curbcut && cd curbcut
> npm install && npx playwright install chromium
> node bin/curbcut.js https://example.com --statement
> ```

## Try it on something broken

There is a deliberately inaccessible page published for exactly this purpose,
so you can check the output against a known answer instead of trusting a
screenshot:

```bash
node bin/curbcut.js https://curbcut.org/demo/broken.html
```

It should report five failing clauses across sixteen elements — two P1, one P2
and two P3. If it reports something else, that is a bug worth an issue.

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
| `--out <dir>` | Output directory. Default `./curbcut-report` |
| `--statement` | Also draft an accessibility statement |
| `--json` | Also write the raw analysis |
| `--fail-on <band>` | Exit non-zero at or above this band. `P1` (default) … `P4`, or `none` |
| `--quiet` | Print only the summary line |

Output lands in `curbcut-report/`: `findings.md`, plus
`accessibility-statement.md` and `analysis.json` when asked for.

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
