import { google, vision_v1 } from 'googleapis';
import type { Response } from 'node-fetch';
import fetch from 'node-fetch';

const REQUIRED_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];
const MAX_RESULTS = 5;
const textDelimiter = /\s+/;
const DEFAULT_PROVIDER = normalizeProvider(process.env.VISION_PROVIDER);
const AZURE_ENDPOINT = process.env.AZURE_VISION_ENDPOINT?.replace(/\/$/, '');
const AZURE_KEY = process.env.AZURE_VISION_KEY;
const AZURE_POLL_INTERVAL_MS = Number(process.env.AZURE_VISION_POLL_INTERVAL_MS || 1500);
const AZURE_POLL_TIMEOUT_MS = Number(process.env.AZURE_VISION_POLL_TIMEOUT_MS || 15000);

export type VisionProvider = 'google' | 'azure';

export interface VisionInsights {
  provider: VisionProvider;
  textBlocks: string[];
  logos: string[];
  labels: string[];
  raw?: unknown;
}

export interface AnalyzeImageOptions {
  imageUrl?: string;
  imageBuffer?: Buffer;
  provider?: VisionProvider;
}

type ImageSource = {
  buffer?: Buffer;
  imageUrl?: string;
};

type AzureAnalyzeResponse = {
  description?: { captions?: Array<{ text?: string; confidence?: number }> };
  tags?: Array<{ name?: string; confidence?: number }>;
  brands?: Array<{ name?: string; confidence?: number }>;
};

type AzureReadOperation = {
  status?: 'notStarted' | 'running' | 'succeeded' | 'failed';
  analyzeResult?: {
    readResults?: Array<{
      lines?: Array<{ text?: string }>;
    }>;
  };
};

const auth = new google.auth.GoogleAuth({ scopes: REQUIRED_SCOPES });

export async function analyzeBannerImage(options: AnalyzeImageOptions): Promise<VisionInsights> {
  if (!options.imageUrl && !options.imageBuffer) {
    throw new Error('analyzeBannerImage: imageUrl vagy imageBuffer kötelező');
  }
  const provider = normalizeProvider(options.provider ?? DEFAULT_PROVIDER);
  if (provider === 'azure') {
    return analyzeWithAzure({ imageUrl: options.imageUrl, buffer: options.imageBuffer });
  }
  const buffer = options.imageBuffer ?? (await fetchImage(options.imageUrl!));
  return analyzeWithGoogle({ imageUrl: options.imageUrl, buffer });
}

function normalizeProvider(value?: string | VisionProvider | null): VisionProvider {
  return value && typeof value === 'string' && value.toLowerCase() === 'azure' ? 'azure' : 'google';
}

async function analyzeWithGoogle(source: ImageSource): Promise<VisionInsights> {
  if (!source.buffer) {
    throw new Error('Google Vision integrációhoz buffer szükséges');
  }
  const vision = new vision_v1.Vision({ auth });
  const response = await vision.images.annotate({
    requestBody: {
      requests: [
        {
          image: { content: source.buffer.toString('base64') },
          features: [
            { type: 'DOCUMENT_TEXT_DETECTION' },
            { type: 'LOGO_DETECTION', maxResults: MAX_RESULTS },
            { type: 'LABEL_DETECTION', maxResults: MAX_RESULTS },
          ],
        },
      ],
    },
  });
  const payload = response.data.responses?.[0];
  if (!payload) {
    throw new Error('Vision API üres választ adott');
  }
  return {
    provider: 'google',
    textBlocks: normalizeText(payload.fullTextAnnotation?.text),
    logos: (payload.logoAnnotations ?? [])
      .map(annotation => annotation.description?.trim())
      .filter((value): value is string => Boolean(value))
      .slice(0, MAX_RESULTS),
    labels: (payload.labelAnnotations ?? [])
      .map(annotation =>
        annotation.description && annotation.score
          ? `${annotation.description} (${Math.round(annotation.score * 100)}%)`
          : annotation.description || null,
      )
      .filter((value): value is string => Boolean(value))
      .slice(0, MAX_RESULTS),
    raw: payload,
  } satisfies VisionInsights;
}

async function analyzeWithAzure(source: ImageSource): Promise<VisionInsights> {
  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    throw new Error('Azure Computer Vision nincs konfigurálva (AZURE_VISION_ENDPOINT + AZURE_VISION_KEY)');
  }
  const analyzePayload = buildAzureRequestBody(source);
  const analyzeUrl = `${AZURE_ENDPOINT}/vision/v3.2/analyze?visualFeatures=Description,Tags,Brands`;
  const analyzeResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: buildAzureHeaders(analyzePayload.contentType),
    body: analyzePayload.body,
  });
  if (!analyzeResponse.ok) {
    const errorBody = await safeReadText(analyzeResponse);
    throw new Error(`Azure Vision analyze hiba (${analyzeResponse.status}): ${errorBody}`);
  }
  const analyzeResult = (await analyzeResponse.json()) as AzureAnalyzeResponse;
  const { textBlocks, rawRead } = await runAzureReadOperation(source);
  const logos = (analyzeResult.brands ?? [])
    .map(brand =>
      brand?.name
        ? `${brand.name} (${Math.round((brand.confidence ?? 0) * 100)}%)`
        : null,
    )
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_RESULTS);
  const labelSet = new Set<string>();
  (analyzeResult.tags ?? []).forEach(tag => {
    if (tag?.name) {
      const percent = Math.round((tag.confidence ?? 0) * 100);
      labelSet.add(`${tag.name} (${percent}%)`);
    }
  });
  (analyzeResult.description?.captions ?? []).forEach(caption => {
    if (caption?.text) {
      labelSet.add(caption.text);
    }
  });
  const labels = Array.from(labelSet).slice(0, MAX_RESULTS);
  return {
    provider: 'azure',
    textBlocks: textBlocks.length ? textBlocks : deriveFallbackText(analyzeResult),
    logos,
    labels,
    raw: { analyze: analyzeResult, read: rawRead },
  } satisfies VisionInsights;
}

async function runAzureReadOperation(source: ImageSource): Promise<{ textBlocks: string[]; rawRead?: AzureReadOperation }>
{
  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    throw new Error('Azure Computer Vision nincs konfigurálva (AZURE_VISION_ENDPOINT + AZURE_VISION_KEY)');
  }
  const payload = buildAzureRequestBody(source);
  const readUrl = `${AZURE_ENDPOINT}/vision/v3.2/read/analyze`;
  const response = await fetch(readUrl, {
    method: 'POST',
    headers: buildAzureHeaders(payload.contentType),
    body: payload.body,
  });
  if (response.status !== 202) {
    const errorBody = await safeReadText(response);
    throw new Error(`Azure Vision read hiba (${response.status}): ${errorBody}`);
  }
  const operationLocation = response.headers.get('operation-location');
  if (!operationLocation) {
    throw new Error('Azure Vision read: hiányzik az operation-location header');
  }
  const deadline = Date.now() + AZURE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(AZURE_POLL_INTERVAL_MS);
    const pollResponse = await fetch(operationLocation, { headers: buildAzureHeaders() });
    if (!pollResponse.ok) {
      const errorBody = await safeReadText(pollResponse);
      throw new Error(`Azure Vision read poll hiba (${pollResponse.status}): ${errorBody}`);
    }
    const payloadJson = (await pollResponse.json()) as AzureReadOperation;
    if (payloadJson.status === 'succeeded') {
      const textBlocks = (payloadJson.analyzeResult?.readResults ?? [])
        .flatMap(page => page.lines ?? [])
        .map(line => line.text?.trim())
        .filter((line): line is string => Boolean(line));
      return { textBlocks, rawRead: payloadJson };
    }
    if (payloadJson.status === 'failed') {
      throw new Error('Azure Vision read: a feldolgozás sikertelen lett');
    }
  }
  throw new Error('Azure Vision read: timeout');
}

function deriveFallbackText(result: AzureAnalyzeResponse): string[] {
  const caption = result.description?.captions?.[0]?.text;
  return caption ? [caption] : [];
}

function buildAzureHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Ocp-Apim-Subscription-Key': AZURE_KEY!,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}

type AzureRequestBody = { body: Buffer | string; contentType: string };

function buildAzureRequestBody(source: ImageSource): AzureRequestBody {
  if (source.imageUrl && !source.buffer) {
    return {
      body: JSON.stringify({ url: source.imageUrl }),
      contentType: 'application/json',
    };
  }
  if (source.buffer) {
    return {
      body: Buffer.from(source.buffer),
      contentType: 'application/octet-stream',
    };
  }
  if (source.imageUrl) {
    return {
      body: JSON.stringify({ url: source.imageUrl }),
      contentType: 'application/json',
    };
  }
  throw new Error('Azure Vision kéréshez nincs elérhető kép');
}

async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Nem sikerült letölteni a képet (${response.status} ${response.statusText})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function normalizeText(fullText?: string | null): string[] {
  if (!fullText) {
    return [];
  }
  return fullText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(textDelimiter).map(word => word.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .slice(0, 20);
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return 'unknown_error';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
