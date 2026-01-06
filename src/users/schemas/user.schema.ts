// src/users/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

/* ===============================
   Embedded Fiance Details Schema
================================ */

@Schema({ _id: false })
class FianceDetails {
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

  @Prop({ type: String, default: null }) 
  email?: string | null;

  @Prop({ type: String, default: null })
  phone?: string | null;
}

const FianceDetailsSchema = SchemaFactory.createForClass(FianceDetails);

/* ===============================
   User Schema
================================ */
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

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
    enum: ['superadmin', 'admin', 'case_manager', 'end_user'],
    default: 'end_user',
  })
  role: string;

  @Prop({
    type: String,
    enum: ['user1', 'user2'],
    default: null,
  })
  endUserType: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedBy: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Case', default: null })
  inviteCaseId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  resetPasswordToken: string | null;

  @Prop({ type: Date, default: null })
  resetPasswordExpires: Date | null;

  @Prop({ type: String, default: null })
  phone?: string | null;

  @Prop({ type: Boolean, default: false })
  marketingConsent?: boolean;

  @Prop({ type: Boolean, required: true })
  acceptedTerms: boolean;

  // Embedded Fiancé Details (same collection)
  @Prop({ type: FianceDetailsSchema, default: null })
  fianceDetails?: FianceDetails | null;

  // ---------- Email OTP verification ----------
  @Prop({ type: Boolean, default: false })
  emailVerified?: boolean;

  @Prop({ type: String, default: null })
  emailVerificationOtp?: string | null;

  @Prop({ type: Date, default: null })
  emailVerificationOtpExpires?: Date | null;

  // ---------- NEW: payment lock flag ----------
  // Set to true when the (single) required payment has been completed.
  @Prop({ type: Boolean, default: false })
  paymentDone?: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
