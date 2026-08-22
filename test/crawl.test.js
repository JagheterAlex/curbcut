import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseUrl } from '../src/crawl.js';
import { parseRobots } from '../src/robots.js';

test('normaliseUrl drops the fragment', () => {
  assert.equal(
    normaliseUrl('/about#team', 'https://example.com/'),
    'https://example.com/about'
  );
});

test('normaliseUrl treats a trailing slash as the same page', () => {
  assert.equal(
    normaliseUrl('https://example.com/about/', 'https://example.com/'),
    normaliseUrl('https://example.com/about', 'https://example.com/')
  );
});

test('normaliseUrl keeps the root slash', () => {
  assert.equal(normaliseUrl('/', 'https://example.com/'), 'https://example.com/');
});

test('normaliseUrl keeps the query string, because it can change the page', () => {
  assert.equal(
    normaliseUrl('/search?q=alt+text', 'https://example.com/'),
    'https://example.com/search?q=alt+text'
  );
});

test('normaliseUrl rejects non-http schemes', () => {
  assert.equal(normaliseUrl('mailto:hello@example.com', 'https://example.com/'), null);
  assert.equal(normaliseUrl('javascript:void(0)', 'https://example.com/'), null);
  assert.equal(normaliseUrl('tel:+441234567890', 'https://example.com/'), null);
});

test('an empty robots.txt allows everything', () => {
  const r = parseRobots('');
  assert.equal(r.isAllowed('/anything'), true);
});

test('Disallow blocks a prefix', () => {
  const r = parseRobots('User-agent: *\nDisallow: /demo/');
  assert.equal(r.isAllowed('/demo/broken.html'), false);
  assert.equal(r.isAllowed('/terms'), true);
});

test('an empty Disallow value means no restriction', () => {
  const r = parseRobots('User-agent: *\nDisallow:');
  assert.equal(r.isAllowed('/anything'), true);
});

test('the longer rule wins, so Allow can carve out an exception', () => {
  const r = parseRobots('User-agent: *\nDisallow: /admin\nAllow: /admin/public');
  assert.equal(r.isAllowed('/admin/secret'), false);
  assert.equal(r.isAllowed('/admin/public/page'), true);
});

test('rules for other agents are ignored', () => {
  const r = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private');
  assert.equal(r.isAllowed('/terms'), true);
  assert.equal(r.isAllowed('/private/x'), false);
});

test('a group naming curbcut takes precedence over the wildcard', () => {
  const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: curbcut\nDisallow: /admin');
  assert.equal(r.isAllowed('/terms'), true);
  assert.equal(r.isAllowed('/admin'), false);
});

test('consecutive User-agent lines share one group', () => {
  const r = parseRobots('User-agent: curbcut\nUser-agent: *\nDisallow: /shared');
  assert.equal(r.isAllowed('/shared'), false);
});

test('comments and blank lines are ignored', () => {
  const r = parseRobots('# a comment\n\nUser-agent: *   # trailing\nDisallow: /x\n');
  assert.equal(r.isAllowed('/x'), false);
  assert.equal(r.isAllowed('/y'), true);
});

test('a wildcard inside a path is honoured', () => {
  const r = parseRobots('User-agent: *\nDisallow: /*.json');
  assert.equal(r.isAllowed('/data/report.json'), false);
  assert.equal(r.isAllowed('/data/report.html'), true);
});

test('a dollar sign anchors the end of the path', () => {
  const r = parseRobots('User-agent: *\nDisallow: /report$');
  assert.equal(r.isAllowed('/report'), false);
  assert.equal(r.isAllowed('/report/2026'), true);
});

test('rules split across several groups for the same agent are merged', () => {
  // Exactly the shape Cloudflare serves: a managed wildcard block prepended
  // ahead of the site owner's own wildcard block. Reading only the first group
  // meant the owner's Disallow was silently ignored.
  const r = parseRobots([
    'User-agent: *',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /demo/',
    'Sitemap: https://example.com/sitemap.xml',
  ].join('\n'));

  assert.equal(r.isAllowed('/demo/broken.html'), false, 'the later Disallow must apply');
  assert.equal(r.isAllowed('/terms'), true);
});

test('a curbcut group still overrides every wildcard group', () => {
  const r = parseRobots([
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: curbcut',
    'Allow: /',
  ].join('\n'));
  assert.equal(r.isAllowed('/terms'), true);
});

test('both of our user-agent tokens can refuse the crawler', () => {
  // The research crawler introduces itself as CurbcutResearch and the /research
  // page tells site owners to write that exact token. Honouring only "curbcut"
  // would have made a published promise false.
  const deny = 'User-agent: CurbcutResearch\nDisallow: /\n';
  assert.equal(parseRobots(deny).isAllowed('/'), false);

  const denyShort = 'User-agent: curbcut\nDisallow: /\n';
  assert.equal(parseRobots(denyShort).isAllowed('/'), false);

  // A rule aimed at somebody else still does not apply to us.
  const other = 'User-agent: SomeOtherBot\nDisallow: /\n';
  assert.equal(parseRobots(other).isAllowed('/'), true);

  // A named group beats the wildcard, as it should.
  const mixed = 'User-agent: *\nDisallow: /\n\nUser-agent: CurbcutResearch\nAllow: /\n';
  assert.equal(parseRobots(mixed).isAllowed('/'), true);
});
