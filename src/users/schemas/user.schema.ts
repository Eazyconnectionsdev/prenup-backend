import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, type: String })
  email: string;

  @Prop({ required: true, type: String })
  passwordHash: string;

  // Split name fields
  @Prop({ type: String, default: null })
  firstName?: string | null;

  @Prop({ type: String, default: null })
  middleName?: string | null;

  @Prop({ type: String, default: null })
  lastName?: string | null;

  // Suffix (e.g., Jr., Sr., III)
  @Prop({ type: String, default: null })
  suffix?: string | null;

  // Date of birth
  @Prop({ type: Date, default: null })
  dateOfBirth?: Date | null;

  // role: explicitly tell Mongoose this is a String enum
  @Prop({ type: String, enum: ['superadmin', 'admin', 'case_manager', 'end_user'], default: 'end_user' })
  role: string;

  // endUserType: explicitly type as String (nullable)
  @Prop({ type: String, enum: ['user1', 'user2'], default: null, required: false })
  endUserType: string | null;

  // ObjectId refs
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedBy: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Case', default: null })
  inviteCaseId: Types.ObjectId | null;

  // nullable string token
  @Prop({ type: String, default: null })
  resetPasswordToken: string | null;

  // nullable date
  @Prop({ type: Date, default: null })
  resetPasswordExpires: Date | null;

  // Optional phone
  @Prop({ type: String, default: null })
  phone?: string | null;

  // Marketing consent
  @Prop({ type: Boolean, default: false })
  marketingConsent?: boolean;

  // Must accept terms
  @Prop({ type: Boolean, required: true })
  acceptedTerms: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
