import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  GeoLocationSchema,
  GeoLocationMongoSchema,
} from '../../common/schemas/geo-location.schema';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true })
  email!: string;

  // Credentials and tracking data are hidden from every query (and so from every
  // populate that returns a user inside a case) unless asked for with +field.
  // Only UsersService.findByEmail, which the sign-in and reset flows use, asks.
  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, default: null })
  firstName?: string | null;

  @Prop({ type: String, default: null })
  middleName?: string | null;

  @Prop({ type: String, default: null })
  lastName?: string | null;

  @Prop({ type: String, default: null })
  suffix?: string | null;

  @Prop({ type: Date, default: null })
  dateOfBirth?: Date | null;

  @Prop({
    type: String,
    enum: ['superadmin', 'admin', 'case_manager', 'end_user', 'lawyer'],
    default: 'end_user',
  })
  role!: string;

  @Prop({
    type: String,
    enum: ['user1', 'user2'],
    default: 'user1',
  })
  endUserType!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedUser!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Case', default: null })
  inviteCaseId!: Types.ObjectId | null;

  @Prop({ type: String, default: null, select: false })
  resetPasswordToken!: string | null;

  @Prop({ type: Date, default: null, select: false })
  resetPasswordExpires!: Date | null;

  @Prop({ type: String, default: null })
  phone?: string | null;

  @Prop({ type: Boolean, default: false })
  marketingConsent?: boolean;

  @Prop({ type: Boolean, required: true })
  acceptedTerms!: boolean;

  @Prop({ type: Boolean, default: false })
  emailVerified?: boolean;

  @Prop({ type: String, default: null, select: false })
  emailVerificationOtp?: string | null;

  @Prop({ type: Date, default: null, select: false })
  emailVerificationOtpExpires?: Date | null;

  /**
   * Account on/off switch. `false` blocks sign-in and every authenticated
   * request; accounts without the field count as active.
   */
  @Prop({ type: Boolean, default: true })
  active?: boolean;

  @Prop({ type: Date, default: null })
  lastLoginAt?: Date | null;

  /**
   * Set when staff delete an account (see CasesService.deleteInviteeAccount).
   * The record is kept for the audit trail; its email is aliased so the same
   * address can register again, and the original is kept here.
   */
  @Prop({ type: Date, default: null })
  deactivatedAt?: Date | null;

  @Prop({ type: String, default: null })
  originalEmail?: string | null;

  @Prop({ type: Boolean, default: false })
  paymentDone?: boolean;

  @Prop({
    type: String,
    default: 'England',
  })
  jurisdiction?: string;

  @Prop({
    type: String,
    default: 'England',
  })
  primaryJurisdiction?: string;

  // ── Location tracking ──────────────────────────────────────────────────────

  /** Raw IP captured at registration time */
  @Prop({ type: String, default: null, select: false })
  registrationIp?: string | null;

  /** Raw IP captured at the most-recent login / OTP-verify */
  @Prop({ type: String, default: null, select: false })
  lastLoginIp?: string | null;

  /** Resolved geo data captured at registration */
  @Prop({ type: GeoLocationMongoSchema, default: null, select: false })
  registrationLocation?: GeoLocationSchema | null;

  /** Resolved geo data captured at the most-recent login / OTP-verify */
  @Prop({ type: GeoLocationMongoSchema, default: null, select: false })
  lastLocation?: GeoLocationSchema | null;
  // For role "lawyer": the directory profile (Lawyer) this login belongs to.
  // Cases reference the profile in assignedLawyerP1/P2.
  @Prop({ type: Types.ObjectId, ref: 'Lawyer', default: null })
  lawyerProfile?: Types.ObjectId | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
