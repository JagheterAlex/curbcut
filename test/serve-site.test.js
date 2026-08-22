import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
