import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retired } from './dev-v4-installed-controller-adapter.mjs';
export const verifyStageB = () => retired('stage-b');
export const validateRecordedBase = () => retired('recorded-base');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(verifyStageB()));
