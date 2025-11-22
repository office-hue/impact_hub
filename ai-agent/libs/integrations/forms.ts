import { google, forms_v1 } from 'googleapis';
import { logger } from '@libs/logger';
import { getOAuthClient } from '@libs/integrations/google-auth';

let formsClient: forms_v1.Forms | null = null;

interface QuestionMapResult {
  titles: Record<string, string | undefined>;
  linkedSheetId?: string | null;
}

export interface AnswerDetail {
  questionId: string;
  question?: string;
  answer?: string;
}

export interface FormResponseSummary {
  responseId?: string | null;
  respondentEmail?: string | null;
  createTime?: string | null;
  lastSubmittedTime?: string | null;
  answers: Record<string, string | undefined>;
  answerDetails?: AnswerDetail[];
  linkedSheetId?: string | null;
}

export interface ListFormResponsesResult {
  responses: FormResponseSummary[];
  nextPageToken?: string | null;
}

interface ListFormResponsesInput {
  formId: string;
  pageSize?: number;
  pageToken?: string;
  includeQuestionText?: boolean;
}

function ensureFormsClient(): forms_v1.Forms {
  if (formsClient) {
    return formsClient;
  }
  const auth = getOAuthClient(['GFORMS', 'GDRIVE']);
  formsClient = google.forms({ version: 'v1', auth });
  return formsClient;
}

function mapAnswers(answerMap: forms_v1.Schema$FormResponse['answers']): Record<string, string | undefined> {
  if (!answerMap) {
    return {};
  }

  return Object.entries(answerMap).reduce<Record<string, string | undefined>>((acc, [questionId, answer]) => {
    const textAnswer = answer.textAnswers?.answers?.map((value) => value?.value ?? '').join('\n').trim();
    acc[questionId] = textAnswer || undefined;
    return acc;
  }, {});
}

function buildAnswerDetails(answerMap: forms_v1.Schema$FormResponse['answers'], titles?: Record<string, string | undefined>): AnswerDetail[] | undefined {
  if (!answerMap || !titles) {
    return undefined;
  }
  return Object.entries(answerMap).map(([questionId, answer]) => {
    const textAnswer = answer.textAnswers?.answers?.map((value) => value?.value ?? '').join('\n').trim() || undefined;
    return {
      questionId,
      question: titles[questionId],
      answer: textAnswer
    };
  });
}

async function fetchQuestionMap(formId: string): Promise<QuestionMapResult | null> {
  try {
    const forms = ensureFormsClient();
    const response = await forms.forms.get({ formId });
    const map: Record<string, string | undefined> = {};
    response.data.items?.forEach((item) => {
      if (!item?.itemId) return;
      const questionTitle = item.title ?? item.description ?? undefined;
      map[item.itemId] = questionTitle ?? undefined;
    });
    return { titles: map, linkedSheetId: response.data.linkedSheetId };
  } catch (error) {
    logger.warn({ error, formId }, 'Failed to fetch form structure for question map');
    return null;
  }
}

export async function listFormResponses(input: ListFormResponsesInput): Promise<ListFormResponsesResult> {
  if (!input.formId) {
    throw new Error('formId is required');
  }

  try {
    const forms = ensureFormsClient();
    const [response, questionMap] = await Promise.all([
      forms.forms.responses.list({
        formId: input.formId,
        pageSize: input.pageSize,
        pageToken: input.pageToken
      }),
      input.includeQuestionText ? fetchQuestionMap(input.formId) : Promise.resolve(null)
    ]);

    const responses =
      response.data.responses?.map((item) => ({
        responseId: item.responseId,
        respondentEmail: item.respondentEmail,
        createTime: item.createTime,
        lastSubmittedTime: item.lastSubmittedTime,
        answers: mapAnswers(item.answers),
        answerDetails: buildAnswerDetails(item.answers, questionMap?.titles),
        linkedSheetId: questionMap?.linkedSheetId
      })) ?? [];

    return {
      responses,
      nextPageToken: response.data.nextPageToken
    };
  } catch (error) {
    logger.error({ error, formId: input.formId }, 'Google Forms fetch failed');
    throw error;
  }
}
