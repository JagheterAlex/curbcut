// A fingerprint of the deliberately broken page, so the example report cannot
// quietly stop describing it.
//
// Its own module because the generator and the test both need it, and importing
// the generator would start a server. It stays out of monitor/src for the
// opposite reason: that directory is bundled into the Worker, which has no
// node:crypto.

import { createHash } from 'node:crypto';
import { DEMO_PAGE, DEMO_CSS } from '../monitor/src/demo.js';

export const demoHash = () =>
  createHash('sha256').update(DEMO_PAGE).update(DEMO_CSS).digest('hex').slice(0, 16);
