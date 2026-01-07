import { getArukeresoSnapshot } from './sources/arukereso.js';
import { getManualSnapshot } from './sources/manual-coupons.js';
import { getGmailSnapshot } from './sources/gmail-promotions.js';
import { getCjSnapshot } from './sources/cj-links.js';
import { getImpactShopsSnapshot } from './sources/impact-shops.js';
import type { SourceSnapshot } from './sources/types.js';

export async function loadSourceSnapshots(): Promise<SourceSnapshot[]> {
  const [manual, arukereso, gmail, cj, impactShops] = await Promise.all([
    getManualSnapshot(),
    getArukeresoSnapshot(),
    getGmailSnapshot(),
    getCjSnapshot(),
    getImpactShopsSnapshot(),
  ]);
  return [manual, arukereso, gmail, cj, impactShops];
}
