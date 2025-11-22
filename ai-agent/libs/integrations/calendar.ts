import { google, calendar_v3 } from 'googleapis';
import { logger } from '@libs/logger';
import { getOAuthClient } from '@libs/integrations/google-auth';

let calendarClient: calendar_v3.Calendar | null = null;

interface ListCalendarEventsOptions {
  calendarId?: string;
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
}

export interface CalendarEventSummary {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: calendar_v3.Schema$EventDateTime | null;
  end?: calendar_v3.Schema$EventDateTime | null;
  htmlLink?: string | null;
}

export interface CreateCalendarEventInput {
  calendarId?: string;
  summary: string;
  description?: string;
  start: calendar_v3.Schema$EventDateTime;
  end: calendar_v3.Schema$EventDateTime;
  attendees?: { email: string; optional?: boolean }[];
  location?: string;
  conferenceData?: calendar_v3.Schema$ConferenceData;
}

function ensureClient(): calendar_v3.Calendar {
  if (calendarClient) {
    return calendarClient;
  }
  const auth = getOAuthClient(['GCAL', 'GMAIL', 'GDRIVE']);
  calendarClient = google.calendar({ version: 'v3', auth });
  return calendarClient;
}

export async function listCalendarEvents(
  options: ListCalendarEventsOptions = {}
): Promise<CalendarEventSummary[]> {
  try {
    const calendar = ensureClient();
    const calendarId = options.calendarId ?? process.env.GCAL_CALENDAR_ID ?? 'primary';

    const response = await calendar.events.list({
      calendarId,
      maxResults: options.maxResults ?? 10,
      timeMin: options.timeMin ?? new Date().toISOString(),
      timeMax: options.timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (
      response.data.items?.map((event) => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        htmlLink: event.htmlLink ?? null,
      })) ?? []
    );
  } catch (error) {
    logger.error({ error }, 'Calendar list failed');
    throw error;
  }
}

export async function createCalendarEvent(input: CreateCalendarEventInput): Promise<calendar_v3.Schema$Event> {
  try {
    const calendar = ensureClient();
    const calendarId = input.calendarId ?? process.env.GCAL_CALENDAR_ID ?? 'primary';
    const event: calendar_v3.Schema$Event = {
      summary: input.summary,
      description: input.description,
      start: input.start,
      end: input.end,
      attendees: input.attendees?.map((attendee) => ({
        email: attendee.email,
        optional: attendee.optional
      })),
      location: input.location,
      conferenceData: input.conferenceData
    };
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
      conferenceDataVersion: input.conferenceData ? 1 : undefined,
      sendUpdates: 'all'
    });
    return response.data;
  } catch (error) {
    logger.error({ error }, 'Calendar create failed');
    throw error;
  }
}
