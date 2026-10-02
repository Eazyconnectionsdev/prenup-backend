import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Company } from './company.schema';

export type LawyerDocument = Lawyer & Document;

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
   * Lawyer display name.
   */
  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  /**
   * Price displayed to clients.
   */
  @Prop()
  priceText?: string;

  /**
   * Lawyer profile/avatar.
   */
  @Prop()
  avatarUrl?: string;

  /**
   * Lawyer availability.
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

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId?: Types.ObjectId | null;

  @Prop()
  createdBy?: string;
}

export const LawyerSchema =
  SchemaFactory.createForClass(Lawyer);