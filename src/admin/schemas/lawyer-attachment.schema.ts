import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LawyerAttachmentDocument = LawyerAttachment & Document;

/** File attachments linked to a Lawyer profile. */
@Schema({ timestamps: true })
export class LawyerAttachment {
  @Prop({ type: Types.ObjectId, ref: 'Lawyer', required: true, index: true })
  lawyerId: Types.ObjectId;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  fileUrl: string;

  @Prop()
  mimeType?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;
}

export const LawyerAttachmentSchema =
  SchemaFactory.createForClass(LawyerAttachment);
