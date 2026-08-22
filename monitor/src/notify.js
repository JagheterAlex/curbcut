// Telling a human that somebody left their address.
//
// Until this existed, the form wrote a row to D1 and told nobody. The person
// saw a thank-you page, and the enquiry sat in a database until someone
// happened to run a query against it. For a business whose entire September
// hypothesis check is "did anybody get in touch", that is the one failure that
// cannot be allowed to be silent.
//
// Sent to hello@curbcut.org, which is a verified Email Routing destination that
// forwards to a person. Using the role address rather than a personal one keeps
// a real inbox out of a public repository, and it means the notification keeps
// working if the person behind it ever changes.

import { EmailMessage } from 'cloudflare:email';

const FROM = 'forms@curbcut.org';
const TO = 'hello@curbcut.org';

/** Fold anything a stranger typed into a single safe header-or-body line. */
const oneLine = (v, max = 200) =>
  String(v ?? '—').replace(/[\r\n]+/g, ' ').trim().slice(0, max) || '—';

function mime({ from, to, subject, body }) {
  // Built by hand rather than pulling in a MIME library for six headers.
  // Everything interpolated is either ours or has been through oneLine, so no
  // stranger's newline can inject a header of their own.
  return [
    'From: Curbcut forms <' + from + '>',
    'To: <' + to + '>',
    'Subject: ' + oneLine(subject, 120),
    'Message-ID: <' + crypto.randomUUID() + '@curbcut.org>',
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="utf-8"',
    '',
    body,
  ].join('\r\n');
}

/**
 * Announce a new enquiry. Never throws and never delays the response: a
 * notification that can break the form would lose the very thing it exists to
 * report. A failure is logged and the row is still in D1 either way.
 */
export function notifyInterest(env, ctx, row) {
  if (!env?.NOTIFY) return;

  const body = [
    'Somebody left their address on curbcut.org.',
    '',
    'Email:    ' + oneLine(row.email),
    'Site:     ' + oneLine(row.site),
    'Use case: ' + oneLine(row.use_case, 600),
    'Came from: ' + oneLine(row.source),
    'When:     ' + row.created_at,
    '',
    'Reply from hello@curbcut.org. If this is an audit enquiry, the delivery',
    'order is in business/AUDIT-RUNBOOK.md: confirm scope and a fixed price',
    'before any work starts, and say what the audit does not cover in the same',
    'size type as everything else.',
  ].join('\n');

  const work = (async () => {
    try {
      await env.NOTIFY.send(
        new EmailMessage(
          FROM,
          TO,
          mime({
            from: FROM,
            to: TO,
            subject: 'Curbcut enquiry from ' + oneLine(row.email, 80),
            body,
          })
        )
      );
    } catch (err) {
      console.error('interest notification failed', err && err.message);
    }
  })();

  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(work);
  return work;
}
