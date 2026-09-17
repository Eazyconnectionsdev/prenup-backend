import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Document,
  Types,
} from 'mongoose';
import { AuditAction } from '../enum/audit-action.enum';


export type AuditLogDocument = AuditLog & Document;

@Schema({
  timestamps: true,
  collection: 'audit_logs',
})
export class AuditLog {
  @Prop({
    required: true,
  })
  module!: string;

  @Prop({
    required: true,
  })
  entityType!: string;

  @Prop({
    type: Types.ObjectId,
    required: true,
  })
  entityId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    required: true,
    index: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: AuditAction,
    required: true,
  })
  action!: AuditAction;

  @Prop()
  stage?: string;

  @Prop({
    type: Object,
  })
  changedFields?: Record<string, { old: any; new: any }>;

  @Prop()
  notes?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId!: Types.ObjectId;

  @Prop()
  userRole?: string;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ caseId: 1, createdAt: -1 });
AuditLogSchema.index({ module: 1, entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });