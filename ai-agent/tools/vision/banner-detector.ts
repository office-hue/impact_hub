import fs from 'fs/promises';
import path from 'path';
import { analyzeBannerImage } from '@apps/api-gateway/src/services/vision-client.js';

function parseArgs(): Record<string, string | boolean> {
  return process.argv.slice(2).reduce<Record<string, string | boolean>>((acc, arg) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.replace(/^--/, '').split('=');
      acc[key] = value ?? true;
    }
    return acc;
  }, {});
}

function isHttp(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

async function main() {
  const args = parseArgs();
  const imageArg = (args.image as string) || (args.i as string);
  if (!imageArg) {
    console.error('Használat: npx tsx tools/vision/banner-detector.ts --image=<útvonal|url> [--provider=google|azure] [--json]');
    process.exitCode = 1;
    return;
  }

  let buffer: Buffer | undefined;
  let imageUrl: string | undefined;
  if (isHttp(imageArg)) {
    imageUrl = imageArg;
  } else {
    const absolutePath = path.resolve(imageArg);
    buffer = await fs.readFile(absolutePath);
  }

  try {
    const insights = await analyzeBannerImage({
      imageUrl,
      imageBuffer: buffer,
      provider: typeof args.provider === 'string' ? (args.provider as any) : undefined,
    });
    if (args.json) {
      console.log(JSON.stringify(insights, null, 2));
      return;
    }
    console.log(`--- Vision API eredmények (${insights.provider}) ---`);
    if (insights.textBlocks.length) {
      console.log('🎯 Felismert szöveg:');
      insights.textBlocks.forEach((line, index) => {
        console.log(`  ${index + 1}. ${line}`);
      });
    } else {
      console.log('🎯 Felismert szöveg: nincs');
    }
    if (insights.logos.length) {
      console.log('\n🏷  Logók:');
      insights.logos.forEach((logo, index) => console.log(`  ${index + 1}. ${logo}`));
    }
    if (insights.labels.length) {
      console.log('\n🔖 Kulcsszavak:');
      insights.labels.forEach((label, index) => console.log(`  ${index + 1}. ${label}`));
    }
  } catch (error) {
    console.error('Vision API hívás sikertelen:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();
