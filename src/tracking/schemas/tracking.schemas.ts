// Append-only audit collections behind the Security & Compliance reports and
// the case processing-time report.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { appendOnlyPlugin, retentionSeconds } from '../append-only.plugin';

// Case audit history is part of the case file, so it is kept for as long as
// legal files are (7 years by default). Security logs (logins, page access)
// hold personal data with no long-term need, so they expire sooner.
const CASE_AUDIT_TTL = retentionSeconds('CASE_AUDIT_RETENTION_DAYS', 2555);
const SECURITY_LOG_TTL = retentionSeconds('SECURITY_LOG_RETENTION_DAYS', 730);

// ── Case status changes (workflow status and payment status) ──

export type CaseStatusHistoryDocument = CaseStatusHistory & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'case_status_history' })
export class CaseStatusHistory {
  @Prop({ type: Types.ObjectId, ref: 'Case', required: true, index: true })
  caseId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  caseNumber?: string | null;

  // 'workflowStatus' | 'paymentStatus'
  @Prop({ type: String, required: true })
  field!: string;

  @Prop({ type: String, default: null })
  from?: string | null;

  @Prop({ type: String, default: null })
  to?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  actorId?: Types.ObjectId | null;

  @Prop({ type: String, default: 'System' })
  actorName!: string;

  // Admin | Case Manager | Lawyer | Applicant | System
  @Prop({ type: String, default: 'System' })
  actorRole!: string;

  @Prop({ type: String, default: null })
  comments?: string | null;

  @Prop({ type: String, default: null })
  ipAddress?: string | null;

  createdAt?: Date;
}

export const CaseStatusHistorySchema = SchemaFactory.createForClass(CaseStatusHistory);
CaseStatusHistorySchema.plugin(appendOnlyPlugin);
CaseStatusHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: CASE_AUDIT_TTL });
CaseStatusHistorySchema.index({ caseId: 1, field: 1, createdAt: 1 });

// ── Case assignment changes (case manager, applicant solicitors) ──

export type CaseAssignmentHistoryDocument = CaseAssignmentHistory & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'case_assignment_history' })
export class CaseAssignmentHistory {
  @Prop({ type: Types.ObjectId, ref: 'Case', required: true, index: true })
  caseId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  caseNumber?: string | null;

  // CASE_MANAGER | LAWYER_P1 | LAWYER_P2
  @Prop({ type: String, required: true })
  kind!: string;

  @Prop({ type: Types.ObjectId, default: null })
  previousId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  previousName?: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  newId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  newName?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  performedById?: Types.ObjectId | null;

  @Prop({ type: String, default: 'System' })
  performedByName!: string;

  @Prop({ type: String, default: 'System' })
  performedByRole!: string;

  // Initial allocation | Workload redistribution | Self-allocation | Unassigned | free text
  @Prop({ type: String, default: null })
  reason?: string | null;

  @Prop({ type: String, default: null })
  ipAddress?: string | null;

  createdAt?: Date;
}

export const CaseAssignmentHistorySchema = SchemaFactory.createForClass(CaseAssignmentHistory);
CaseAssignmentHistorySchema.plugin(appendOnlyPlugin);
CaseAssignmentHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: CASE_AUDIT_TTL });

// ── Security events: logins, page access, denied access, sensitive data
//    access and staff activity ──

export enum SecurityEventKind {
  LOGIN = 'LOGIN',
  ACCESS = 'ACCESS',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SENSITIVE = 'SENSITIVE',
  ACTIVITY = 'ACTIVITY',
}

export enum ActivityCategory {
  LOGIN = 'LOGIN',
  CASE_UPDATE = 'CASE_UPDATE',
  ASSIGNMENT = 'ASSIGNMENT',
  STATUS_CHANGE = 'STATUS_CHANGE',
  DOCUMENT_ACCESS = 'DOCUMENT_ACCESS',
  ACCOUNT_CHANGE = 'ACCOUNT_CHANGE',
}

export type SecurityEventDocument = SecurityEvent & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'security_events' })
export class SecurityEvent {
  @Prop({ type: String, enum: Object.values(SecurityEventKind), required: true })
  kind!: SecurityEventKind;

  @Prop({ type: String, enum: Object.values(ActivityCategory), default: null })
  category?: ActivityCategory | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  userName?: string | null;

  @Prop({ type: String, default: null, lowercase: true })
  email?: string | null;

  // Raw account role (superadmin, admin, case_manager, lawyer, end_user)
  @Prop({ type: String, default: null })
  role?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Case', default: null })
  caseId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  caseNumber?: string | null;

  // SUCCESS | FAILED | DENIED
  @Prop({ type: String, default: 'SUCCESS' })
  result!: string;

  // Failure reason (logins) or why access was refused
  @Prop({ type: String, default: null })
  reason?: string | null;

  // Dashboard | Case Record | User Profile
  @Prop({ type: String, default: null })
  accessType?: string | null;

  // Failed Login | Restricted Page Access | Unauthorized Case Access
  @Prop({ type: String, default: null })
  attemptType?: string | null;

  // Financial | Personal | Legal Docs | Supporting Docs
  @Prop({ type: [String], default: undefined })
  infoTypes?: string[];

  // Viewed | Downloaded | Uploaded
  @Prop({ type: String, default: null })
  action?: string | null;

  // Applicant whose information was accessed
  @Prop({ type: String, default: null })
  applicant?: string | null;

  // Human-readable activity, e.g. "Approved case"
  @Prop({ type: String, default: null })
  activity?: string | null;

  @Prop({ type: String, default: null })
  previousValue?: string | null;

  @Prop({ type: String, default: null })
  newValue?: string | null;

  @Prop({ type: String, default: null })
  target?: string | null;

  @Prop({ type: String, default: null })
  method?: string | null;

  @Prop({ type: Number, default: null })
  statusCode?: number | null;

  @Prop({ type: String, default: null })
  details?: string | null;

  @Prop({ type: String, default: null })
  ipAddress?: string | null;

  @Prop({ type: String, default: null })
  userAgent?: string | null;

  createdAt?: Date;
}

export const SecurityEventSchema = SchemaFactory.createForClass(SecurityEvent);
SecurityEventSchema.plugin(appendOnlyPlugin);
SecurityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: SECURITY_LOG_TTL });
SecurityEventSchema.index({ kind: 1, createdAt: -1 });
SecurityEventSchema.index({ userId: 1, createdAt: -1 });
SecurityEventSchema.index({ caseId: 1, createdAt: -1 });
