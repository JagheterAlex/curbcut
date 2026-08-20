// WCAG success criteria, levels A and AA only.
// Level AAA is deliberately absent: EN 301 549 clause 9 does not require it,
// and reporting AAA failures as legal exposure would be misleading.
//
// `since` is the WCAG version that introduced the criterion. This matters:
// the harmonised EN 301 549 v3.2.1 (2021-03) adopts WCAG 2.1, so criteria
// introduced in 2.2 are NOT current legal requirements under the EAA.

export const SUCCESS_CRITERIA = {
  '1.1.1':  { title: 'Non-text Content', level: 'A', since: '2.0' },
  '1.2.1':  { title: 'Audio-only and Video-only (Prerecorded)', level: 'A', since: '2.0' },
  '1.2.2':  { title: 'Captions (Prerecorded)', level: 'A', since: '2.0' },
  '1.2.3':  { title: 'Audio Description or Media Alternative (Prerecorded)', level: 'A', since: '2.0' },
  '1.2.4':  { title: 'Captions (Live)', level: 'AA', since: '2.0' },
  '1.2.5':  { title: 'Audio Description (Prerecorded)', level: 'AA', since: '2.0' },
  '1.3.1':  { title: 'Info and Relationships', level: 'A', since: '2.0' },
  '1.3.2':  { title: 'Meaningful Sequence', level: 'A', since: '2.0' },
  '1.3.3':  { title: 'Sensory Characteristics', level: 'A', since: '2.0' },
  '1.3.4':  { title: 'Orientation', level: 'AA', since: '2.1' },
  '1.3.5':  { title: 'Identify Input Purpose', level: 'AA', since: '2.1' },
  '1.4.1':  { title: 'Use of Color', level: 'A', since: '2.0' },
  '1.4.2':  { title: 'Audio Control', level: 'A', since: '2.0' },
  '1.4.3':  { title: 'Contrast (Minimum)', level: 'AA', since: '2.0' },
  '1.4.4':  { title: 'Resize Text', level: 'AA', since: '2.0' },
  '1.4.5':  { title: 'Images of Text', level: 'AA', since: '2.0' },
  '1.4.10': { title: 'Reflow', level: 'AA', since: '2.1' },
  '1.4.11': { title: 'Non-text Contrast', level: 'AA', since: '2.1' },
  '1.4.12': { title: 'Text Spacing', level: 'AA', since: '2.1' },
  '1.4.13': { title: 'Content on Hover or Focus', level: 'AA', since: '2.1' },
  '2.1.1':  { title: 'Keyboard', level: 'A', since: '2.0' },
  '2.1.2':  { title: 'No Keyboard Trap', level: 'A', since: '2.0' },
  '2.1.4':  { title: 'Character Key Shortcuts', level: 'A', since: '2.1' },
  '2.2.1':  { title: 'Timing Adjustable', level: 'A', since: '2.0' },
  '2.2.2':  { title: 'Pause, Stop, Hide', level: 'A', since: '2.0' },
  '2.3.1':  { title: 'Three Flashes or Below Threshold', level: 'A', since: '2.0' },
  '2.4.1':  { title: 'Bypass Blocks', level: 'A', since: '2.0' },
  '2.4.2':  { title: 'Page Titled', level: 'A', since: '2.0' },
  '2.4.3':  { title: 'Focus Order', level: 'A', since: '2.0' },
  '2.4.4':  { title: 'Link Purpose (In Context)', level: 'A', since: '2.0' },
  '2.4.5':  { title: 'Multiple Ways', level: 'AA', since: '2.0' },
  '2.4.6':  { title: 'Headings and Labels', level: 'AA', since: '2.0' },
  '2.4.7':  { title: 'Focus Visible', level: 'AA', since: '2.0' },
  '2.4.11': { title: 'Focus Not Obscured (Minimum)', level: 'AA', since: '2.2' },
  '2.5.1':  { title: 'Pointer Gestures', level: 'A', since: '2.1' },
  '2.5.2':  { title: 'Pointer Cancellation', level: 'A', since: '2.1' },
  '2.5.3':  { title: 'Label in Name', level: 'A', since: '2.1' },
  '2.5.4':  { title: 'Motion Actuation', level: 'A', since: '2.1' },
  '2.5.7':  { title: 'Dragging Movements', level: 'AA', since: '2.2' },
  '2.5.8':  { title: 'Target Size (Minimum)', level: 'AA', since: '2.2' },
  '3.1.1':  { title: 'Language of Page', level: 'A', since: '2.0' },
  '3.1.2':  { title: 'Language of Parts', level: 'AA', since: '2.0' },
  '3.2.1':  { title: 'On Focus', level: 'A', since: '2.0' },
  '3.2.2':  { title: 'On Input', level: 'A', since: '2.0' },
  '3.2.3':  { title: 'Consistent Navigation', level: 'AA', since: '2.0' },
  '3.2.4':  { title: 'Consistent Identification', level: 'AA', since: '2.0' },
  '3.2.6':  { title: 'Consistent Help', level: 'A', since: '2.2' },
  '3.3.1':  { title: 'Error Identification', level: 'A', since: '2.0' },
  '3.3.2':  { title: 'Labels or Instructions', level: 'A', since: '2.0' },
  '3.3.3':  { title: 'Error Suggestion', level: 'AA', since: '2.0' },
  '3.3.4':  { title: 'Error Prevention (Legal, Financial, Data)', level: 'AA', since: '2.0' },
  '3.3.7':  { title: 'Redundant Entry', level: 'A', since: '2.2' },
  '3.3.8':  { title: 'Accessible Authentication (Minimum)', level: 'AA', since: '2.2' },
  // Removed in WCAG 2.2, but still present in the harmonised EN 301 549 v3.2.1,
  // which adopts WCAG 2.1. Kept, and flagged, rather than silently dropped.
  '4.1.1':  { title: 'Parsing', level: 'A', since: '2.0', obsoletedIn: '2.2' },
  '4.1.2':  { title: 'Name, Role, Value', level: 'A', since: '2.0' },
  '4.1.3':  { title: 'Status Messages', level: 'AA', since: '2.1' },
};

// axe-core tags criteria as `wcag111`, `wcag412`, `wcag2410`.
// The digits are principle, guideline, then the remainder as the criterion
// number, which is why `wcag2410` is 2.4.10 and not 2.41.0.
export function criterionFromAxeTag(tag) {
  const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
  if (!m) return null;
  return m[1] + '.' + m[2] + '.' + m[3];
}

export function criteriaFromAxeTags(tags = []) {
  const found = [];
  for (const tag of tags) {
    const sc = criterionFromAxeTag(tag);
    if (sc && SUCCESS_CRITERIA[sc] && !found.includes(sc)) found.push(sc);
  }
  return found;
}
