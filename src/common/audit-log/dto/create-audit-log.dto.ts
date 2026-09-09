import { Types } from 'mongoose';
import { AuditAction } from '../enum/audit-action.enum';

export class CreateAuditLogDto {
  module!: string;
  entityType!: string;
  entityId!: Types.ObjectId | string;
  caseId!: Types.ObjectId | string;
  action!: AuditAction;
  userId!: Types.ObjectId | string;

  userRole?: string;
  stage?: string;
  changedFields?: Record<string, { old: any; new: any }>;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}