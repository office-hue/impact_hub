import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Capability registry side-effect imports (auto-discovery).
const here = path.dirname(fileURLToPath(new URL(import.meta.url)));
const files = fs
  .readdirSync(here)
  .filter(file => {
    const isJs = file.endsWith('.js');
    const isTs = file.endsWith('.ts');
    if (!isJs && !isTs) return false;
    return (
      !['index.ts', 'index.js', 'types.ts', 'types.js', 'registry.ts', 'registry.js', 'decision.ts', 'decision.js'].includes(
        file,
      ) && !file.startsWith('_') && !file.endsWith('.d.ts')
    );
  });

for (const file of files) {
  await import(`./${file}`);
}
