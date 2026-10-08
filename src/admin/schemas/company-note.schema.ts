import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CompanyNoteDocument = CompanyNote & Document;

/** Internal notes on a Lawyer Company record. */
@Schema({ timestamps: true })
export class CompanyNote {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const CompanyNoteSchema = SchemaFactory.createForClass(CompanyNote);
