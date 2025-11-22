export type TaskStatus = 'pending' | 'pending_review' | 'in_progress' | 'completed' | 'failed';

export type TaskType =
  | 'financial_report'
  | 'email_processing'
  | 'document_ingestion'
  | 'form_followup'
  | 'custom';

export interface TaskPayload {
  subject?: string;
  content?: string;
  attachmentUrl?: string;
  reportingPeriod?: string;
  meta?: Record<string, unknown>;
  formId?: string;
  responseId?: string;
  respondentEmail?: string;
  submittedAt?: string;
  answers?: Record<string, unknown>;
  // Döntés-támogató kontextus (opcionális)
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  confidence?: number; // 0..1
  expectedTokens?: number;
  maxTokenBudget?: number;
}

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  payload: TaskPayload;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'finance' | 'viewer';
  tenantId?: string;
}
