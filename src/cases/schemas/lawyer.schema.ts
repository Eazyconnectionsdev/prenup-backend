import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Company } from './company.schema';
import { StoredFile, StoredFileSchema } from '../../common/schemas/stored-file.schema';

export type LawyerDocument = Lawyer & Document;

export const LAWYER_STATUSES = ['active', 'inactive'] as const;

export const LAWYER_PRACTISING_STATUSES = [
  'Practising',
  'Non-practising',
  'Suspended',
  'Retired',
] as const;

export const LAWYER_FILE_CATEGORIES = [
  'Practising certificate',
  'Professional indemnity insurance',
  'Qualification / certificate',
  'Identification',
  'CV / résumé',
  'Contract / agreement',
  'Compliance / training',
  'Other',
] as const;

export const INVITATION_STATUSES = ['not_sent', 'sent'] as const;

@Schema({ timestamps: true })
export class Lawyer {
  /**
   * External/reference ID used by your lawyer directory.
   */
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  externalId!: string;

  /**
   * Lawyer display name (first + middle + last name).
   */
  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  // ── A. Personal details ────────────────────────────────────────────────────
  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  middleName?: string;

  @Prop({ trim: true })
  lastName?: string;

  /** S3 key of the profile photo. Served through an authenticated endpoint. */
  @Prop()
  photoKey?: string;

  @Prop()
  photoMimeType?: string;

  // ── B. Company association and role ────────────────────────────────────────
  /**
   * Company that owns/manages this lawyer.
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  })
  company!: Types.ObjectId | Company;

  @Prop({ trim: true })
  officeBranch?: string;

  @Prop({ trim: true })
  jobTitle?: string;

  /**
   * Lawyer availability. The admin form's Active / Inactive maps to
   * available / unavailable; "archived" is set by the archive action.
   */
  @Prop({
    type: String,
    enum: [
      'available',
      'unavailable',
      'archived',
    ],
    default: 'available',
  })
  status?:
    | 'available'
    | 'unavailable'
    | 'archived';

  // ── C. Professional details ────────────────────────────────────────────────
  @Prop({ trim: true })
  regulatoryBody?: string;

  /** Professional registration number (mirrored to barNumber, which older code reads). */
  @Prop({ trim: true })
  registrationNumber?: string;

  @Prop({ type: String, enum: LAWYER_PRACTISING_STATUSES })
  practisingStatus?: string;

  @Prop({ trim: true })
  jurisdiction?: string;

  @Prop()
  qualifications?: string;

  /**
   * Price displayed to clients (used in the "lawyer assigned" emails).
   */
  @Prop()
  priceText?: string;

  /**
   * Lawyer profile/avatar (legacy URL; new photos use photoKey).
   */
  @Prop()
  avatarUrl?: string;

  // ── D. Contact details ─────────────────────────────────────────────────────
  /** Work email, also the portal login. Mirrored to directEmail. */
  @Prop({ trim: true })
  workEmail?: string;

  /** Mirrored to directPhone. */
  @Prop({ trim: true })
  workPhone?: string;

  @Prop({ trim: true })
  mobilePhone?: string;

  /**
   * Public contact information.
   */
  @Prop({
    trim: true,
  })
  publicEmail?: string;

  @Prop({
    trim: true,
  })
  publicPhone?: string;

  /**
   * Direct/private contact information.
   */
  @Prop({
    trim: true,
  })
  directEmail?: string;

  @Prop({
    trim: true,
  })
  directPhone?: string;

  // ── E. Portal account ──────────────────────────────────────────────────────
  /**
   * =========================================================
   * LOGIN USER CONNECTION
   * =========================================================
   *
   * Links this Lawyer profile to the User account.
   *
   * User:
   *   _id = 123
   *   role = "lawyer"
   *
   * Lawyer:
   *   user = 123
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    unique: true,
    sparse: true,
    index: true,
  })
  user?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId?: Types.ObjectId | null;

  /** Whether a welcome email has gone out. "Accepted" is derived from the user's first login. */
  @Prop({ type: String, enum: INVITATION_STATUSES, default: 'not_sent' })
  invitationStatus?: string;

  @Prop({ type: Date })
  invitationSentAt?: Date;

  // ── F. Documents ───────────────────────────────────────────────────────────
  // Hidden from queries (and so from populate) unless asked for with +documents:
  // case payloads populate whole lawyers and are sent to clients.
  @Prop({ type: [StoredFileSchema], default: [], select: false })
  documents?: StoredFile[];

  // ── G. Internal administration ─────────────────────────────────────────────
  @Prop({ select: false })
  internalNotes?: string;

  /**
   * Lawyer website.
   */
  @Prop({
    trim: true,
  })
  website?: string;

  /**
   * Lawyer profile link.
   */
  @Prop({
    trim: true,
  })
  profileLink?: string;

  /**
   * Lawyer address.
   */
  @Prop({
    trim: true,
  })
  address?: string;

  /**
   * Bar/license number.
   */
  @Prop({
    trim: true,
  })
  barNumber?: string;

  /** Older free-text notes. The admin form now writes internalNotes instead. */
  @Prop()
  notes?: string;

  @Prop()
  createdBy?: string;

  /** The admin who created the profile. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdById?: Types.ObjectId;

  @Prop({ default: false })
  verified?: boolean;
}

export const LawyerSchema =
  SchemaFactory.createForClass(Lawyer);
