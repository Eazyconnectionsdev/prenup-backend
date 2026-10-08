import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LawyerNoteDocument = LawyerNote & Document;

/** Internal notes on a Lawyer profile. */
@Schema({ timestamps: true })
export class LawyerNote {
  @Prop({ type: Types.ObjectId, ref: 'Lawyer', required: true, index: true })
  lawyerId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const LawyerNoteSchema = SchemaFactory.createForClass(LawyerNote);
