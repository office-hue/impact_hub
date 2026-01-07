import { strict as assert } from 'assert';
import path from 'path';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';

async function runTest() {
  const fixture = path.resolve('tests/fixtures/excel/pivot-sample.json');
  const output = path.resolve('tests/fixtures/excel/pivot-output.json');
  try {
    const result = spawnSync('npx', ['tsx', 'tools/excel/pivot-normalizer.ts', `--input=${fixture}`, `--output=${output}`], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const raw = await fs.readFile(output, 'utf8');
    const payload = JSON.parse(raw);
    assert.equal(payload.rows.length, 4);
    assert.deepEqual(payload.rows[0], { dimension: 'Marketing', metric: 'Q1', value: 1200 });
    console.log('pivot-normalizer.test.ts: OK');
  } finally {
    try {
      await fs.unlink(output);
    } catch {
      // ignore
    }
  }
}

runTest().catch(error => {
  console.error('pivot-normalizer test failed:', error);
  process.exit(1);
});
