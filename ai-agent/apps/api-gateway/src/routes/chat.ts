import { Router } from 'express';
import { requireRole } from '@libs/auth';
import { handleCommand } from '@libs/chat/commands';

const router = Router();

router.post('/command', requireRole(['admin', 'finance']), async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });
  const reply = await handleCommand(text, { userId: req.user!.id });
  res.json({ reply });
});

export default router;
