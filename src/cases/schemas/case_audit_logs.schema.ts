// src/case-manager/schemas/case-audit-log.schema.ts

import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Document,
  Types,
} from 'mongoose';

export type CaseAuditLogDocument =
  CaseAuditLog & Document;

@Schema({
  timestamps: true,
  collection: 'case_audit_logs',
})
export class CaseAuditLog {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  action!: string;

  @Prop({
    type: Object,
  })
  oldValue?: any;

  @Prop({
    type: Object,
  })
  newValue?: any;

  @Prop()
  notes?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId!: Types.ObjectId;
}

export const CaseAuditLogSchema =
  SchemaFactory.createForClass(
    CaseAuditLog,
  );