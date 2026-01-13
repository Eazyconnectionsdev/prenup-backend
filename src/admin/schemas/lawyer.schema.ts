
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Company } from './company.schema';

export type LawyerDocument = Lawyer & Document;

@Schema({ timestamps: true })
export class Lawyer {
  @Prop({ required: true })
  externalId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  priceText: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ type: String, default: 'available' })
  status?: 'available' | 'unavailable' | 'archived';

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  company: Types.ObjectId | Company;

  @Prop()
  publicEmail?: string;

  @Prop()
  publicPhone?: string;

  @Prop()
  directEmail?: string;

  @Prop()
  directPhone?: string;

  @Prop()
  website?: string;

  @Prop()
  profileLink?: string;

  @Prop()
  address?: string;

  @Prop()
  barNumber?: string;

  @Prop()
  notes?: string;

  @Prop({ default: false })
  verified?: boolean;
}

export const LawyerSchema = SchemaFactory.createForClass(Lawyer);
