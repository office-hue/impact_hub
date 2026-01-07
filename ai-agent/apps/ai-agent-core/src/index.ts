import { pathToFileURL } from 'url';
import type { SourceSnapshot } from './sources/types.js';
import { loadSourceSnapshots } from './snapshots.js';
import { loadManualCoupons } from './sources/manual-coupons.js';
import { loadGmailPromotions } from './sources/gmail-promotions.js';

export { recommendCoupons } from './impi/recommend.js';
export { loadSourceSnapshots };
export { loadManualCoupons };
export { loadGmailPromotions };

const runDirect = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (runDirect) {
  loadSourceSnapshots()
    .then(snapshots => {
      snapshots.forEach(snapshot => {
        console.log(`${snapshot.id}: ${snapshot.count} entries (updated: ${snapshot.lastUpdated ?? 'n/a'})`);
      });
    })
    .catch(err => {
      console.error('Snapshot load failed:', err);
      process.exit(1);
    });
}
