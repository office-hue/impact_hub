import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser, TaskRecord } from '@libs/types';
import { logger } from '@libs/logger';

type PolicyEffect = 'allow' | 'deny';

type PolicyRule = {
  id: string;
  description: string;
  resource: 'tasks' | 'reports' | 'documents';
  actions: string[];
  condition?: (ctx: PolicyContext) => boolean;
  effect: PolicyEffect;
};

interface PolicyContext {
  user: AuthenticatedUser;
  resourceId?: string;
  payload?: TaskRecord | Record<string, unknown>;
}

const basePolicies: PolicyRule[] = [
  {
    id: 'tasks:create:finance',
    description: 'Finance or admin roles may create financial reports',
    resource: 'tasks',
    actions: ['create'],
    condition: ({ user, payload }) => {
      if (!payload || (payload as TaskRecord).type !== 'financial_report') return true;
      return ['admin', 'finance'].includes(user.role);
    },
    effect: 'allow'
  },
  {
    id: 'tasks:create:viewer-block',
    description: 'Viewer role cannot create tasks',
    resource: 'tasks',
    actions: ['create'],
    condition: ({ user }) => user.role === 'viewer',
    effect: 'deny'
  }
];

function evaluatePolicies(action: string, resource: PolicyRule['resource'], ctx: PolicyContext): boolean {
  for (const policy of basePolicies) {
    if (!policy.actions.includes(action) || policy.resource !== resource) continue;
    const conditionPass = policy.condition ? policy.condition(ctx) : true;
    if (!conditionPass) continue;
    if (policy.effect === 'deny') {
      logger.warn({ policy: policy.id }, 'Policy denied action');
      return false;
    }
    if (policy.effect === 'allow') {
      return true;
    }
  }
  return true;
}

export function policyCheck(action: string, resource: PolicyRule['resource']) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const allowed = evaluatePolicies(action, resource, {
      user: req.user,
      payload: req.body
    });
    if (!allowed) {
      return res.status(403).json({ error: 'Policy violation' });
    }
    next();
  };
}
