import { google, slides_v1 } from 'googleapis';
import { logger } from '@libs/logger';
import { getOAuthClient } from '@libs/integrations/google-auth';

let slidesClient: slides_v1.Slides | null = null;

export interface SlideSummary {
  objectId?: string | null;
  slideIndex: number;
  title?: string;
  notesPreview?: string;
}

export interface PresentationSummary {
  presentationId: string;
  title?: string | null;
  slideCount: number;
  slides: SlideSummary[];
}

function ensureSlidesClient(): slides_v1.Slides {
  if (slidesClient) {
    return slidesClient;
  }
  const auth = getOAuthClient(['GSLIDES', 'GDRIVE']);
  slidesClient = google.slides({ version: 'v1', auth });
  return slidesClient;
}

function extractFirstText(elements?: slides_v1.Schema$PageElement[]): string | undefined {
  if (!elements) {
    return undefined;
  }
  for (const element of elements) {
    const textElements = element.shape?.text?.textElements;
    if (!textElements) continue;
    const combined = textElements.map((te) => te.textRun?.content ?? '').join('').trim();
    if (combined) {
      return combined.replace(/\s+/g, ' ');
    }
  }
  return undefined;
}

function extractNotes(notesPage?: slides_v1.Schema$Page): string | undefined {
  if (!notesPage) {
    return undefined;
  }
  const text = extractFirstText(notesPage.pageElements);
  return text ? text.slice(0, 280) : undefined;
}

export async function fetchPresentationSummary(presentationId: string): Promise<PresentationSummary> {
  if (!presentationId) {
    throw new Error('presentationId is required');
  }

  try {
    const slides = ensureSlidesClient();
    const response = await slides.presentations.get({ presentationId });
    const presentation = response.data;
    const slidesData = presentation.slides ?? [];
    const summaries: SlideSummary[] = slidesData.map((slide, index) => ({
      objectId: slide.objectId,
      slideIndex: index + 1,
      title: extractFirstText(slide.pageElements),
      notesPreview: extractNotes(slide.slideProperties?.notesPage)
    }));

    return {
      presentationId: presentation.presentationId ?? presentationId,
      title: presentation.title,
      slideCount: slidesData.length,
      slides: summaries
    };
  } catch (error) {
    logger.error({ error, presentationId }, 'Google Slides fetch failed');
    throw error;
  }
}
