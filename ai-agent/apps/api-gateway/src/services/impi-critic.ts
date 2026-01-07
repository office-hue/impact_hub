import type OpenAI from 'openai';
import { getOpenAIClient } from './impi-openai.js';

const criticEnabled = (process.env.AI_AGENT_CRITIC_ENABLED || '1').toLowerCase() !== '0';
const criticModel = process.env.OPENAI_IMPI_CRITIC_MODEL;

export interface CriticReport {
  score: number;
  summary: string;
  improvements: string[];
  rewrite?: string;
}

function buildCriticPrompt(userMessage: string, impiAnswer: string): string {
  return [
    'Feladat: értékeld az Impi (Sharity AI asszisztens) válaszát a "kritikus barát" checklist alapján.',
    '- Szempontok: intent felismerése, 5 lépéses mérlegelés, CTA-k, transzparencia, empátia.',
    '- Adj pontszámot 1-5 között, és legfeljebb 3 javítási javaslatot.',
    '- Ha a pontszám <=3, adj meg egy rövid javított választ (rewrite), ami a checklist szerint helyes.',
    '',
    `Felhasználói kérdés: ${userMessage}`,
    `Impi válasza: ${impiAnswer}`,
    '',
    'VÁLASZFORMÁTUM (JSON): {"score":4,"summary":"rövid értékelés","improvements":["hiba1","hiba2"],"rewrite":"javított válasz vagy üres"}',
  ].join('\n');
}

export async function runCriticReview(userMessage: string, impiAnswer: string): Promise<CriticReport | null> {
  if (!criticEnabled) {
    return null;
  }
  const client: OpenAI | null = getOpenAIClient();
  if (!client) {
    return null;
  }
  try {
    const completion = await client.chat.completions.create({
      model: criticModel || process.env.OPENAI_IMPI_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Te vagy az Impi QA kritikus barátja. Adj tömör, magyar visszajelzést JSON formátumban.' },
        { role: 'user', content: buildCriticPrompt(userMessage, impiAnswer) },
      ],
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return null;
    }
    const parsed = JSON.parse(text);
    if (
      typeof parsed.score === 'number'
      && typeof parsed.summary === 'string'
      && Array.isArray(parsed.improvements)
    ) {
      return {
        score: parsed.score,
        summary: parsed.summary,
        improvements: parsed.improvements.slice(0, 3).map((item: unknown) => String(item)).filter(Boolean),
        rewrite: typeof parsed.rewrite === 'string' ? parsed.rewrite.trim() || undefined : undefined,
      };
    }
  } catch (err) {
    console.warn('Impi critic review failed', err);
  }
  return null;
}
