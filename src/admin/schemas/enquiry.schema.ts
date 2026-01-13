
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EnquiryDocument = Enquiry & Document;

@Schema({ timestamps: true })
export class Enquiry {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: 'open' })
  status?: 'open' | 'closed' | 'in_progress';
}

export const EnquirySchema = SchemaFactory.createForClass(Enquiry);

