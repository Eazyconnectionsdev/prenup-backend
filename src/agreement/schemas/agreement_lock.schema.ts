import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum AgreementLockStatus {
  CHECKED_IN = 'checked_in',
  CHECKED_OUT = 'checked_out',
}

export type AgreementLockDocument = AgreementLock & Document;

@Schema({
  timestamps: true,
  collection: 'agreement_locks',
})
export class AgreementLock {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
    unique: true,
    index: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: AgreementLockStatus,
    required: true,
    default: AgreementLockStatus.CHECKED_IN,
  })
  status!: AgreementLockStatus;

  // Which version was checked out for editing, so check-in knows
  // what it's replacing / diffing against.
  @Prop({
    type: Types.ObjectId,
    ref: 'DocumentVersion',
    required: false,
    default: null,
  })
  checkedOutVersionId!: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
  })
  lockedBy!: Types.ObjectId | null;

  @Prop({
    type: String,
    required: false,
    default: null,
  })
  lockedByRole!: string | null;

  @Prop({
    type: Date,
    required: false,
    default: null,
  })
  lockedAt!: Date | null;
}

export const AgreementLockSchema =
  SchemaFactory.createForClass(AgreementLock);