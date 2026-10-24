import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const retired = (operation = 'legacy-adapter') => ({
  schemaVersion: 1, status: 'retired', operation, advisoryOnly: true,
  authorityGranted: false, authoritative: false, ready: false, writes: false,
  sourceChecks: 'not-evaluated', lifecycleExecuted: false,
  next: 'Use native Git and affected project checks; workspace support is optional.',
});
export function run(argv = process.argv.slice(2)) {
  process.stdout.write(JSON.stringify(retired(argv[0] || 'status')) + '\n');
  return 0;
}

export const controllerPath = () => null;
export const readJson = () => retired('readJson');
export const installedEngineDescriptor = () => retired('installedEngineDescriptor');
export const assertTargetOrigin = () => retired('assertTargetOrigin');
export const assertTargetPolicy = () => retired('assertTargetPolicy');
export const buildArgs = () => retired('buildArgs');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = run();
