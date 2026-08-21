import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The converter is exercised end to end rather than unit tested, because both
// bugs it has had so far were in the interaction between steps, not inside one.
function build(body) {
  const dir = mkdtempSync(join(tmpdir(), 'curbcut-build-'));
  const md = join(dir, 'a.md');
  writeFileSync(
    md,
    ['---', 'title: "Test"', 'canonical_url: https://curbcut.org/blog/test-page', '---', '', body].join('\n'),
    'utf8'
  );
  execFileSync(process.execPath, ['site/build-article.mjs', md, '1 January 2026'], { stdio: 'pipe' });
  const out = readFileSync('site/blog/test-page.html', 'utf8');
  rmSync(dir, { recursive: true, force: true });
  rmSync('site/blog/test-page.html', { force: true });
  return out;
}

test('a link survives the typography pass', () => {
  // The first version curly-quoted the finished anchor, turning href="..." into
  // href=&ldquo;...&rdquo; and silently destroying every link in the article.
  const html = build('Try [the scanner](https://curbcut.org/scan) today.');
  assert.match(html, /<a href="https:\/\/curbcut\.org\/scan">the scanner<\/a>/);
  assert.ok(!html.includes('href=&ldquo;'), 'attribute quotes must not be curled');
});

test('numbers in prose are not mistaken for code placeholders', () => {
  // " 10 " used to match the placeholder pattern and index past the array.
  const html = build('Fewer than 10 people and 2 million euro, with `--crawl` set.');
  assert.match(html, /Fewer than 10 people and 2 million euro/);
  assert.match(html, /<code>--crawl<\/code>/);
  assert.ok(!html.includes('undefined'));
});

test('straight quotes in prose still become curly', () => {
  const html = build('They say "fully compliant" and mean it.');
  assert.match(html, /&ldquo;fully compliant&rdquo;/);
});

test('headings, lists and code blocks convert', () => {
  const html = build(['## A heading', '', '- one', '- two', '', '```bash', 'npx curbcut x', '```'].join('\n'));
  assert.match(html, /<h2>A heading<\/h2>/);
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /<pre class="cmd"><code>npx curbcut x<\/code><\/pre>/);
});

test('no markdown syntax survives into the page', () => {
  const html = build('**bold** and [a link](https://example.com) and `code`.');
  assert.ok(!html.includes('**'), 'no leftover asterisks');
  assert.ok(!html.includes(']('), 'no leftover link syntax');
});
