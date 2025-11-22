import express from 'express';
import tasksRouter from './routes/tasks';
import gmailRouter from './routes/gmail';
import driveRouter from './routes/drive';
import calendarRouter from './routes/calendar';
import { authenticate } from '@libs/auth';
import docsRouter from './routes/docs';
import sheetsRouter from './routes/sheets';
import slidesRouter from './routes/slides';
import formsRouter from './routes/forms';
import billingoRouter from './routes/billingo';
import searchRouter from './routes/search';
import chatRouter from './routes/chat';

export function createApiApp() {
  const app = express();
  app.use(express.json());
  app.use(authenticate);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'api-gateway' });
  });

  app.use('/api/v1/tasks', tasksRouter);
  app.use('/api/v1/gmail', gmailRouter);
  app.use('/api/v1/drive', driveRouter);
  app.use('/api/v1/calendar', calendarRouter);
  app.use('/api/v1/docs', docsRouter);
  app.use('/api/v1/sheets', sheetsRouter);
  app.use('/api/v1/slides', slidesRouter);
  app.use('/api/v1/forms', formsRouter);
  app.use('/api/v1/billingo', billingoRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/chat', chatRouter);

  return app;
}
