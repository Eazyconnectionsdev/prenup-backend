// src/cases/schemas/lawyer.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LawyerDocument = Lawyer & Document;

@Schema({ timestamps: true })
export class Lawyer {
  @Prop({ required: true })
  externalId: string; // small numeric/string id from UI (e.g. "1","2") or provider id

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  priceText: string; // e.g. "£300 including VAT/VAT exempt" or "£300 + VAT"

  @Prop({ required: true })
  avatarUrl: string;

  @Prop({ type: String, default: 'available' })
  status?: 'available' | 'unavailable' | 'archived';
}
export const LawyerSchema = SchemaFactory.createForClass(Lawyer);
