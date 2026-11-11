import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const GDPR_REQUEST_TYPES = ['DATA_ACCESS', 'DATA_EXPORT', 'DELETION', 'ANONYMIZATION'] as const;
export const GDPR_REQUEST_STATUSES = ['RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] as const;

export const GDPR_TYPE_LABELS: Record<string, string> = {
  DATA_ACCESS: 'Data Access',
  DATA_EXPORT: 'Data Export',
  DELETION: 'Deletion',
  ANONYMIZATION: 'Anonymization',
};

export const GDPR_STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Received',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

// UK GDPR: respond within one calendar month.
export const GDPR_RESPONSE_DAYS = Number(process.env.GDPR_RESPONSE_DAYS) || 30;

@Schema({ _id: false })
export class GdprStatusEntry {
  @Prop({ type: String, required: true })
  status!: string;

  @Prop({ type: String, default: null })
  note?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  byId?: Types.ObjectId | null;

  @Prop({ type: String, default: 'System' })
  byName!: string;

  @Prop({ type: Date, default: () => new Date() })
  at!: Date;
}
const GdprStatusEntrySchema = SchemaFactory.createForClass(GdprStatusEntry);

export type GdprRequestDocument = GdprRequest & Document;

@Schema({ timestamps: true, collection: 'gdpr_requests' })
export class GdprRequest {
  // GDPR-YYYY-NNNNN
  @Prop({ type: String, required: true, unique: true })
  requestId!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId?: Types.ObjectId | null;

  @Prop({ type: String, required: true })
  userName!: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: Types.ObjectId, ref: 'Case', default: null })
  caseId?: Types.ObjectId | null;

  @Prop({ type: String, enum: GDPR_REQUEST_TYPES, required: true })
  type!: string;

  @Prop({ type: Date, required: true })
  requestDate!: Date;

  @Prop({ type: Date, required: true })
  responseDueDate!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  assignedToName?: string | null;

  @Prop({ type: String, enum: GDPR_REQUEST_STATUSES, default: 'RECEIVED' })
  status!: string;

  @Prop({ type: Date, default: null })
  completionDate?: Date | null;

  @Prop({ type: String, default: '' })
  notes!: string;

  // web (submitted by the user) | staff (logged by an admin)
  @Prop({ type: String, default: 'staff' })
  source!: string;

  // Every status change, kept for the audit trail.
  @Prop({ type: [GdprStatusEntrySchema], default: [] })
  history!: GdprStatusEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const GdprRequestSchema = SchemaFactory.createForClass(GdprRequest);
GdprRequestSchema.index({ status: 1, responseDueDate: 1 });
// Requests are deleted only by the database owner, never through the app.
GdprRequestSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'] as any, function () {
  throw new Error('GDPR request records cannot be deleted');
});
