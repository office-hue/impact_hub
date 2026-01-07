#!/usr/bin/env tsx
import process from 'process';
import { loadShopRegistry } from '../ingest/shops-registry.js';

const REQUIRED_PLAYWRIGHT_SLUGS = ['arukereso', 'decathlon', 'notino'];

async function main(): Promise<void> {
  const registry = await loadShopRegistry();
  const flagged = registry.entries.filter(entry => entry.arukereso_playwright);

  if (flagged.length === 0) {
    console.error('❌ Nincs `arukereso_playwright` flaggel ellátott shop a registry-ben.');
    process.exit(1);
    return;
  }

  const missingRequired = REQUIRED_PLAYWRIGHT_SLUGS.filter(requiredSlug =>
    !flagged.some(entry => entry.slug === requiredSlug),
  );

  if (missingRequired.length > 0) {
    console.error('❌ Hiányzik a flag az alábbi kötelező shopoknál:', missingRequired.join(', '));
    process.exit(1);
    return;
  }

  console.log('✅ Shop registry Playwright flag rendben. Lefedett shopok:', flagged.map(entry => entry.slug).join(', '));
}

main().catch(err => {
  console.error('Shop registry ellenőrzés sikertelen:', err);
  process.exit(1);
});
