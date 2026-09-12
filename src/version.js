// Which build of this tool produced a report.
//
// The standard version in the header already tells a reader which side of the
// citation a report came from, because that version is a constant compiled into
// each release rather than something the clock decides. But it does not
// distinguish two releases that name the same standard and map it differently —
// a corrected clause mapping, a changed band rule — and those reports would
// otherwise be indistinguishable on paper.
//
// Hardcoded rather than read from package.json, because the Worker behind
// curbcut.org/scan imports this module and has no filesystem. A test asserts
// the two agree, so the copy cannot drift.

export const TOOL = { name: 'curbcut', version: '0.6.0' };
