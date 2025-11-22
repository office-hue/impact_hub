import { google, docs_v1 } from 'googleapis';
import { logger } from '@libs/logger';
import { getOAuthClient } from '@libs/integrations/google-auth';

let docsClient: docs_v1.Docs | null = null;
const DOCS_CACHE_TTL_MS = Number(process.env.GDOCS_CACHE_TTL_MS ?? 60_000);

interface CacheEntry {
  summary: DocumentSummary;
  expiresAt: number;
}

const docsCache = new Map<string, CacheEntry>();

export interface DocumentHeading {
  level: string;
  text: string;
  startIndex?: number | null;
  endIndex?: number | null;
}

export interface DocumentSummary {
  documentId: string;
  title?: string | null;
  revisionId?: string | null;
  preview?: string;
  wordCount?: number;
  headings?: DocumentHeading[];
  cachedAt?: string;
}

function ensureDocsClient(): docs_v1.Docs {
  if (docsClient) {
    return docsClient;
  }
  const auth = getOAuthClient(['GDOCS', 'GDRIVE']);
  docsClient = google.docs({ version: 'v1', auth });
  return docsClient;
}

function getCached(documentId: string): DocumentSummary | undefined {
  const cached = docsCache.get(documentId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.summary;
  }
  if (cached) {
    docsCache.delete(documentId);
  }
  return undefined;
}

function storeCache(documentId: string, summary: DocumentSummary) {
  docsCache.set(documentId, {
    summary: { ...summary, cachedAt: new Date().toISOString() },
    expiresAt: Date.now() + DOCS_CACHE_TTL_MS
  });
}

function extractPreview(content?: docs_v1.Schema$StructuralElement[]): string | undefined {
  if (!content) {
    return undefined;
  }
  const pieces: string[] = [];
  for (const element of content) {
    const paragraphs = element.paragraph?.elements;
    if (!paragraphs) continue;
    for (const paragraphElement of paragraphs) {
      const text = paragraphElement.textRun?.content;
      const normalized = text?.trim();
      if (normalized) {
        pieces.push(normalized);
      }
      if (pieces.join(' ').length > 280) {
        break;
      }
    }
    if (pieces.join(' ').length > 280) {
      break;
    }
  }
  if (!pieces.length) {
    return undefined;
  }
  const preview = pieces.join(' ').replace(/\s+/g, ' ').trim();
  return preview.slice(0, 280);
}

function analyzeStructure(content?: docs_v1.Schema$StructuralElement[]) {
  const headings: DocumentHeading[] = [];
  let wordCount = 0;

  if (!content) {
    return { headings, wordCount };
  }

  for (const element of content) {
    const paragraph = element.paragraph;
    const textElements = paragraph?.elements;
    if (!textElements) {
      continue;
    }

    const combined = textElements.map((el) => el.textRun?.content ?? '').join('').trim();
    if (combined) {
      wordCount += combined.split(/\s+/).filter(Boolean).length;
    }

    const namedStyle = paragraph?.paragraphStyle?.namedStyleType;
    if (namedStyle?.startsWith('HEADING') && combined) {
      headings.push({
        level: namedStyle,
        text: combined.replace(/\s+/g, ' '),
        startIndex: element.startIndex,
        endIndex: element.endIndex
      });
    }
  }

  return { headings, wordCount };
}

export async function fetchDocumentSummary(documentId: string, forceRefresh = false): Promise<DocumentSummary> {
  if (!documentId) {
    throw new Error('documentId is required');
  }

  if (!forceRefresh) {
    const cached = getCached(documentId);
    if (cached) {
      return cached;
    }
  }

  try {
    const docs = ensureDocsClient();
    const response = await docs.documents.get({ documentId });
    const document = response.data;
    const structure = analyzeStructure(document.body?.content);
    const summary: DocumentSummary = {
      documentId: document.documentId ?? documentId,
      title: document.title,
      revisionId: document.revisionId,
      preview: extractPreview(document.body?.content),
      wordCount: structure.wordCount,
      headings: structure.headings
    };
    summary.cachedAt = new Date().toISOString();
    storeCache(documentId, summary);
    return summary;
  } catch (error) {
    logger.error({ error, documentId }, 'Google Docs fetch failed');
    throw error;
  }
}

interface FormAnswerDetail {
  questionId: string;
  question?: string;
  answer?: string;
}

export interface CreateFormDocumentInput {
  title: string;
  formId: string;
  responseId: string;
  respondentEmail?: string | null;
  submittedAt?: string | null;
  answerDetails?: FormAnswerDetail[];
  answers?: Record<string, string | undefined>;
}

export interface CreatedDocumentInfo {
  documentId: string;
  title?: string | null;
  url: string;
}

export async function createDocumentFromFormResponse(input: CreateFormDocumentInput): Promise<CreatedDocumentInfo> {
  const docs = ensureDocsClient();
  const createResponse = await docs.documents.create({
    requestBody: { title: input.title }
  });
  const documentId = createResponse.data.documentId;
  if (!documentId) {
    throw new Error('Failed to create document');
  }

  const lines: string[] = [];
  lines.push(`# ${input.title}`);
  lines.push('');
  lines.push(`- **Form ID:** ${input.formId}`);
  lines.push(`- **Response ID:** ${input.responseId}`);
  if (input.respondentEmail) {
    lines.push(`- **Respondent:** ${input.respondentEmail}`);
  }
  if (input.submittedAt) {
    lines.push(`- **Submitted at:** ${input.submittedAt}`);
  }
  lines.push('');
  lines.push('## Answers');

  const details = input.answerDetails && input.answerDetails.length > 0
    ? input.answerDetails
    : Object.entries(input.answers ?? {}).map(([questionId, answer]) => ({
        questionId,
        question: questionId,
        answer
      }));

  details.forEach((detail) => {
    const questionText = detail.question ?? detail.questionId;
    const answer = detail.answer ?? '—';
    lines.push(`- **${questionText}:** ${answer}`);
  });

  const content = `${lines.join('\n')}\n`;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            text: content,
            endOfSegmentLocation: { segmentId: '' }
          }
        }
      ]
    }
  });

  return {
    documentId,
    title: createResponse.data.title ?? input.title,
    url: `https://docs.google.com/document/d/${documentId}/edit`
  };
}
