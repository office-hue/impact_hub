import { Router } from 'express';
import { requireRole } from '@libs/auth';
import { searchCSE } from '@libs/search/cse';

const router = Router();

router.get('/', requireRole(['admin', 'finance']), async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const num = typeof req.query.num === 'string' ? Number(req.query.num) : undefined;
  if (!q) {
    return res.status(400).json({ error: 'q param required' });
  }
  const results = await searchCSE(q, { num });
  res.json({ results });
});

export default router;
