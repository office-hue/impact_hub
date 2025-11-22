import OpenAI from 'openai';
import { logger } from '@libs/logger';

let cachedClient: OpenAI | null = null;

export async function runCompletion(prompt: string): Promise<string> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY missing – returning deterministic stub response');
      return `MVP response: feldolgozott prompt (${prompt.slice(0, 80)}...)`;
    }
    if (!cachedClient) {
      cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    const response = await cachedClient.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt
    });
    const output = response.output?.[0];
    if (output && 'content' in output) {
      const content = output.content?.[0];
      if (content && 'text' in content) {
        return content.text;
      }
    }
    return 'No response';
  } catch (error) {
    logger.error({ error }, 'OpenAI completion failed');
    return 'OpenAI error – see logs';
  }
}
