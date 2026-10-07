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

  @Prop({ required: true })
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

  @Prop({ type: String, default: null })
  resetPasswordToken!: string | null;

  @Prop({ type: Date, default: null })
  resetPasswordExpires!: Date | null;

  @Prop({ type: String, default: null })
  phone?: string | null;

  @Prop({ type: Boolean, default: false })
  marketingConsent?: boolean;

  @Prop({ type: Boolean, required: true })
  acceptedTerms!: boolean;

  @Prop({ type: Boolean, default: false })
  emailVerified?: boolean;

  @Prop({ type: String, default: null })
  emailVerificationOtp?: string | null;

  @Prop({ type: Date, default: null })
  emailVerificationOtpExpires?: Date | null;

  @Prop({ type: Boolean, default: false })
  paymentDone?: boolean;

  // ── Location tracking ──────────────────────────────────────────────────────

  /** Raw IP captured at registration time */
  @Prop({ type: String, default: null })
  registrationIp?: string | null;

  /** Raw IP captured at the most-recent login / OTP-verify */
  @Prop({ type: String, default: null })
  lastLoginIp?: string | null;

  /** Resolved geo data captured at registration */
  @Prop({ type: GeoLocationMongoSchema, default: null })
  registrationLocation?: GeoLocationSchema | null;

  /** Resolved geo data captured at the most-recent login / OTP-verify */
  @Prop({ type: GeoLocationMongoSchema, default: null })
  lastLocation?: GeoLocationSchema | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
