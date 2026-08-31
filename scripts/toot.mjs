// Post to Mastodon as @curbcut@mastodon.social.
//
// The token has one permission, write:statuses. It cannot read our messages,
// edit the profile, or follow anybody, so the worst it can do if it leaks is
// post — which is loud, visible and reversible, rather than quiet.
//
// It lives in business/secrets/, outside this repository. Nothing here reads it
// from anywhere a public checkout could reach, and the value is never printed.
//
//   node scripts/toot.mjs draft.txt                 # shows what would go out
//   node scripts/toot.mjs draft.txt --post           # actually posts it
//   node scripts/toot.mjs draft.txt --post --edit ID # corrects a post already up
//
// Editing exists because a correction is worth more than a tidy history.
// Mastodon marks an edited post as edited and keeps the previous versions
// readable, so this cannot be used to quietly rewrite what was said — which is
// exactly why it is safe to use.
//
// Text comes from a file rather than the command line: 500 characters of prose
// with quotes and newlines in it does not survive a shell argument intact, and
// a post mangled by quoting rules would go out under the brand.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SERVER = 'https://mastodon.social';
const TOKEN_FILE = fileURLToPath(
  new URL('../../business/secrets/mastodon-token.txt', import.meta.url)
);

// Mastodon counts every URL as 23 characters no matter how long it is, so the
// naive length of the string overstates a post full of links. This mirrors the
// server's own arithmetic; the server is still the authority and will reject
// anything genuinely too long.
const LIMIT = 500;
const URL_WEIGHT = 23;
function weigh(text) {
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(URL_WEIGHT)).length;
}

const [fileArg, ...flags] = process.argv.slice(2);
if (!fileArg) {
  console.error(
    'usage: node scripts/toot.mjs <file.txt> [--post] [--reply-to <id>] [--edit <id>]'
  );
  process.exit(2);
}

const post = flags.includes('--post');
const replyTo = flags.includes('--reply-to') ? flags[flags.indexOf('--reply-to') + 1] : null;
const editId = flags.includes('--edit') ? flags[flags.indexOf('--edit') + 1] : null;

const status = readFileSync(fileArg, 'utf8').trim();
if (!status) {
  console.error('the file is empty');
  process.exit(2);
}

const counted = weigh(status);
console.log('---');
console.log(status);
console.log('---');
console.log(`${counted}/${LIMIT} characters as Mastodon counts them` +
  (counted !== status.length ? ` (${status.length} raw; links count as ${URL_WEIGHT})` : ''));

if (counted > LIMIT) {
  console.error('too long — the server will refuse it');
  process.exit(1);
}

if (!post) {
  console.log('');
  console.log('Nothing was posted. Add --post to send it.');
  process.exit(0);
}

let token;
try {
  token = readFileSync(TOKEN_FILE, 'utf8').trim();
} catch {
  console.error('no token at ' + TOKEN_FILE);
  process.exit(1);
}
if (!token) {
  console.error('the token file is empty — paste the access token into it first');
  process.exit(1);
}

const res = await fetch(
  SERVER + '/api/v1/statuses' + (editId ? '/' + editId : ''),
  {
  method: editId ? 'PUT' : 'POST',
  headers: {
    authorization: 'Bearer ' + token,
    'content-type': 'application/json',
    // Same text posted twice by mistake lands once. Derived from the text, so a
    // retry after a network failure cannot produce a duplicate.
    'idempotency-key': [...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(status))
    )].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join(''),
  },
  body: JSON.stringify({
    status,
    language: 'en',
    ...(editId ? {} : { visibility: 'public' }),
    ...(replyTo ? { in_reply_to_id: replyTo } : {}),
  }),
  }
);

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Mastodon refused it: HTTP ' + res.status + ' ' + (body.error ?? ''));
  process.exit(1);
}

console.log('');
console.log((editId ? 'edited: ' : 'posted: ') + body.url);
console.log('id:     ' + body.id + '   (use with --reply-to to add to the thread)');
