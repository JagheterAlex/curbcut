import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseHeaders } from '../scripts/serve-site.mjs';

// The release gate scans the site through this server. If it stops sending the
// headers the real site sends, the gate goes back to testing a site nobody
// visits — which is how a Content Security Policy that blocked our own scanner
// got past it once already.

test('the catch-all block of _headers is read', () => {
  const headers = parseHeaders(
    readFileSync(new URL('../site/_headers', import.meta.url), 'utf8')
  );
  assert.match(headers['content-security-policy'], /default-src 'none'/);
  assert.equal(headers['x-frame-options'], 'DENY');
});

test('comments and blank lines are not headers', () => {
  const headers = parseHeaders('# a comment\n\n/*\n  X-Test: yes\n');
  assert.deepEqual(headers, { 'x-test': 'yes' });
});

test('a block this server does not understand fails loudly', () => {
  // Silently ignoring a path-specific block would serve headers the real site
  // does not, which is the same failure in the opposite direction.
  assert.throws(
    () => parseHeaders('/*\n  X-Test: yes\n\n/blog/*\n  X-Other: no\n'),
    /only understands the \/\* block/
  );
});

test('the site actually has the policy the gate relies on', () => {
  // Guards the case where _headers is deleted or emptied: parseHeaders would
  // happily return {} and every page would pass a check that tested nothing.
  const headers = parseHeaders(
    readFileSync(new URL('../site/_headers', import.meta.url), 'utf8')
  );
  assert.ok(
    Object.keys(headers).length >= 5,
    'the catch-all block lost its headers, so the gate is checking a bare site'
  );
});

// `style-src 'self'` blocks inline style attributes, not just <style> blocks.
// Every `style="…"` on this site was doing nothing from the moment the policy
// shipped: the markup read correctly and the rendered page did not, which no
// amount of reading the source would have shown. Presentational values belong
// in style.css.
// Walked by hand rather than with fs.globSync, which arrived in Node 22. The
// package supports Node 20 and CI runs Node 20, so a test that needs 22 passes
// on this machine and fails on the one that matters — which is precisely what
// it did.
function walk(dir, match, found = []) {
  for (const entry of readdirSync(new URL('../' + dir + '/', import.meta.url), { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) walk(path, match, found);
    else if (match.test(entry.name)) found.push(path);
  }
  return found;
}

test('nothing served carries a style attribute the policy will drop', () => {
  const files = [
    ...walk('site', /\.html$/),
    ...walk('monitor/src', /\.js$/),
    'site/build-article.mjs',
  ];
  const offenders = [];
  for (const file of files) {
    // The preview harness is a local scratch page, never linked and never in
    // the sitemap.
    if (file.includes('_preview-all')) continue;
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    if (/\sstyle="/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

// A description is what a search result and a shared link actually show. Four
// pages had none of their own and fell back to repeating the title, which
// wastes the only two lines we get; three others ran to 265 characters, of
// which Google shows about 155. Both are silent failures — the page looks
// perfect and the listing does not.
test('every indexable page has a description that fits and says something new', () => {
  const problems = [];
  for (const file of walk('site', /\.html$/)) {
    if (file.includes('_preview-all')) continue;
    const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    if (/<meta name="robots" content="noindex/.test(html)) continue;

    const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/ — Curbcut$/, '');
    if (!desc) { problems.push(file + ': no description'); continue; }
    if (desc.length > 160) problems.push(file + ': ' + desc.length + ' characters');
    if (title && desc.startsWith(title.slice(0, 40))) {
      problems.push(file + ': description just repeats the title');
    }
  }
  assert.deepEqual(problems, []);
});
