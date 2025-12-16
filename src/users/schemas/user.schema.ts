import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, type: String })
  email: string;

  @Prop({ required: true, type: String })
  passwordHash: string;

  // optional name
  @Prop({ type: String, required: false, default: null })
  name?: string | null;

  // role: explicitly tell Mongoose this is a String enum
  @Prop({ type: String, enum: ['superadmin', 'admin', 'case_manager', 'end_user'], default: 'end_user' })
  role: string;

  // endUserType: explicitly type as String (nullable)
  @Prop({ type: String, enum: ['user1', 'user2'], default: null, required: false })
  endUserType: string | null;

  // ObjectId refs (already explicit)
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
}

export const UserSchema = SchemaFactory.createForClass(User);
