
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CompanyDocument = Company & Document;

@Schema({ timestamps: true })
export class Company {
  @Prop({ required: true })
  name: string;

  @Prop()
  companyNumber?: string;

  @Prop()
  address?: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop()
  website?: string;

  @Prop()
  notes?: string;

  @Prop()
  photoUrl?: string;

  @Prop({ default: false })
  verified?: boolean;
}

export const CompanySchema = SchemaFactory.createForClass(Company);

