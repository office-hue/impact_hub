import type { NextFunction, Request, Response } from 'express';
import { logger } from '@libs/logger';
import type { AuthenticatedUser } from '@libs/types';

const DEFAULT_API_KEY = process.env.CORE_API_KEY ?? 'dev-api-key';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

function decodeMockJwt(token: string): AuthenticatedUser | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString());
    if (!payload?.sub) return null;
    return {
      id: String(payload.sub),
      email: payload.email ?? 'user@example.com',
      role: payload.role ?? 'viewer',
      tenantId: payload.tenantId
    };
  } catch (error) {
    logger.warn({ error }, 'JWT decode failed, falling back to API key auth');
    return null;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('Authorization');
  const apiKey = req.header('x-api-key');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const user = decodeMockJwt(token);
    if (user) {
      req.user = user;
      return next();
    }
  }

  if (apiKey && apiKey === DEFAULT_API_KEY) {
    const fallbackUser: AuthenticatedUser = {
      id: 'system',
      email: 'system@sharity.hu',
      role: 'admin'
    };
    req.user = fallbackUser;
    return next();
  }

  logger.warn('Unauthorized request blocked');
  return res.status(401).json({ error: 'Unauthorized' });
}

export function requireRole(roles: AuthenticatedUser['role'][]): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
