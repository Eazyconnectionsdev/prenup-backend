import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PartnerInviteDocument = PartnerInvite & Document;

export enum PartnerInviteStatus {
  PENDING = 'PENDING', // sent, link not opened yet
  OPENED = 'OPENED', // partner opened the link
  ACCEPTED = 'ACCEPTED', // partner registered
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED', // replaced by an invite to a different email
  REMOVED = 'REMOVED', // partner joined, then was unlinked by staff/owner
}

export enum PartnerLinkConflictOutcome {
  APPROVED = 'APPROVED', // staff allowed the link; the partner's own case is set aside
  REJECTED = 'REJECTED', // staff refused the link; the invite is revoked
}

// Raised when the invited person already has a case holding data/payment.
// The link is held until a Case Manager / Admin decides; nothing is merged
// or deleted automatically.
export interface PartnerLinkConflict {
  userId: Types.ObjectId;
  existingCaseId: Types.ObjectId;
  reasons: string[];
  flaggedAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: Types.ObjectId | null;
  outcome?: PartnerLinkConflictOutcome | null;
  note?: string | null;
}

// What the inviter typed. Never overwritten by the partner's own details.
@Schema({ _id: false })
export class InviteeDetails {
  @Prop({ type: String, default: null })
  firstName?: string | null;

  @Prop({ type: String, default: null })
  lastName?: string | null;

  @Prop({ type: String, required: true, lowercase: true })
  email!: string;

  @Prop({ type: String, default: null })
  mobileNumber?: string | null;

  @Prop({ type: String, default: null })
  relationshipStatus?: string | null;

  @Prop({ type: Date, default: null })
  targetWeddingDate?: Date | null;

  @Prop({ type: String, default: null })
  personalMessage?: string | null;
}
const InviteeDetailsSchema = SchemaFactory.createForClass(InviteeDetails);

@Schema({ timestamps: true })
export class PartnerInvite {
  @Prop({ type: Types.ObjectId, ref: 'Case', required: true, index: true })
  caseId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedBy!: Types.ObjectId;

  @Prop({ type: InviteeDetailsSchema, required: true })
  invitee!: InviteeDetails;

  @Prop({
    type: String,
    enum: Object.values(PartnerInviteStatus),
    default: PartnerInviteStatus.PENDING,
  })
  status!: PartnerInviteStatus;

  // sha256 of the token that is emailed; the raw token is never stored here.
  @Prop({ type: String, required: true, index: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: () => new Date() })
  sentAt!: Date;

  @Prop({ type: Number, default: 0 })
  resendCount!: number;

  @Prop({ type: Date, default: null })
  lastResentAt?: Date | null;

  @Prop({ type: Date, default: null })
  openedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastOpenedAt?: Date | null;

  @Prop({ type: Date, default: null })
  acceptedAt?: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;

  // The partner's real account. Name/email/phone are read live from it, so
  // anything the partner changes later is reflected for the inviter.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  acceptedUser?: Types.ObjectId | null;

  @Prop({ type: Boolean, default: null })
  emailMatchedInvite?: boolean | null;

  @Prop({ type: Boolean, default: null })
  nameMatchedInvite?: boolean | null;

  // Set when the partner is unlinked after joining (REMOVED).
  @Prop({ type: Date, default: null })
  removedAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  removedBy?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  removalReason?: string | null;

  // The invited person already has their own case with data or payment.
  @Prop({ type: Object, default: null })
  conflict?: PartnerLinkConflict | null;
}

export const PartnerInviteSchema = SchemaFactory.createForClass(PartnerInvite);
PartnerInviteSchema.index({ caseId: 1, createdAt: -1 });
