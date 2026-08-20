import { HARMONISED } from './en301549.js';

/**
 * Draft an accessibility statement.
 *
 * The free generators in this space will happily emit "this website is fully
 * compliant" on the strength of nothing at all. A statement is a public claim,
 * and an inaccurate one is the thing regulators and litigants read first. So
 * this function will not produce a full-conformance claim from scan data:
 * automated testing cannot support one, and `analysis` alone never will.
 */
export function draftStatement(analysis, org = {}) {
  const {
    name = '[Organisation name]',
    site = '[Website address]',
    email = '[Contact email]',
    phone = null,
    country = null,
  } = org;

  const failing = analysis.summary.clausesFailingHarmonised;
  const status = failing > 0 ? 'partially conformant' : 'conformance not established';
  const today = new Date().toISOString().slice(0, 10);

  const lines = [];
  lines.push('# Accessibility statement for ' + name);
  lines.push('');
  lines.push('DRAFT. Review every bracketed field and every claim below before publishing.');
  lines.push('');
  lines.push(name + ' is committed to making ' + site + ' accessible, in line with the');
  lines.push('European Accessibility Act (Directive (EU) 2019/882) and the harmonised');
  lines.push('standard ' + HARMONISED.standard + ' ' + HARMONISED.version + '.');
  lines.push('');

  lines.push('## Conformance status');
  lines.push('');
  if (failing > 0) {
    lines.push('This website is **' + status + '** with ' + HARMONISED.standard + ' ' +
      HARMONISED.version + '. Automated testing found failures against ' + failing +
      ' clause' + (failing === 1 ? '' : 's') + ' of the standard. Those are listed below.');
  } else {
    lines.push('Automated testing found no failures against ' + HARMONISED.standard + ' ' +
      HARMONISED.version + '. This is **not** a claim of full conformance. ' +
      analysis.coverageNote + ' A manual audit is required before any stronger claim ' +
      'can honestly be made here.');
  }
  lines.push('');

  lines.push('## Non-accessible content');
  lines.push('');
  if (failing > 0) {
    lines.push('The following clauses are known to be failing:');
    lines.push('');
    for (const f of analysis.findings.filter((x) => x.inHarmonised)) {
      lines.push('- **Clause ' + f.clause + ' (' + f.title + ', level ' + f.level + ')** — ' +
        'affects ' + f.nodeCount + ' element' + (f.nodeCount === 1 ? '' : 's') +
        ' across ' + f.pageCount + ' page' + (f.pageCount === 1 ? '' : 's') + '. [State the remedy and target date.]');
    }
  } else {
    lines.push('[No failures were detected automatically. List anything known from manual testing, ' +
      'user feedback or third-party components here. Leaving this section empty implies a ' +
      'completeness that an automated scan cannot support.]');
  }
  lines.push('');

  lines.push('## Content outside the scope of this statement');
  lines.push('');
  lines.push('[List third-party content you neither fund, develop nor control — for example ' +
    'embedded maps, payment widgets or user-generated content — and say so explicitly.]');
  lines.push('');

  lines.push('## How this statement was prepared');
  lines.push('');
  lines.push('This statement was prepared on ' + today + '.');
  lines.push('');
  lines.push('It is based on an automated evaluation of ' + analysis.scannedPages + ' page' +
    (analysis.scannedPages === 1 ? '' : 's') + ' carried out with Curbcut, which uses axe-core.');
  lines.push('');
  lines.push(analysis.coverageNote + ' The following areas of ' + HARMONISED.standard +
    ' were not evaluated, because no automated tool can evaluate them:');
  lines.push('');
  for (const m of analysis.manualOnly) {
    lines.push('- Clause ' + m.clause + ' — ' + m.what + '.');
  }
  lines.push('');
  lines.push('[If a manual audit or a review by users with disabilities has been carried out, ' +
    'describe it here. If it has not, say so. An honest statement of limits is worth more ' +
    'than an unsupported claim of conformance.]');
  lines.push('');

  lines.push('## Feedback');
  lines.push('');
  lines.push('If you encounter a barrier on this website, contact us at ' + email + '.' +
    (phone ? ' Telephone: ' + phone + '.' : ''));
  lines.push('');
  lines.push('We aim to respond within [number] working days.');
  lines.push('');

  lines.push('## Enforcement procedure');
  lines.push('');
  lines.push('[Name the national enforcement body' + (country ? ' for ' + country : '') +
    ' and give its contact details. Each EU member state designates its own, so this ' +
    'cannot be filled in automatically.]');
  lines.push('');

  return lines.join('\n');
}
