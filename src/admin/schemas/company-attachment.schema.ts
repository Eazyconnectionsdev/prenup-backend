import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CompanyAttachmentDocument = CompanyAttachment & Document;

/**
 * Attachments (files) linked to a Lawyer Company.
 * Each document stores the S3/CDN URL + metadata.
 */
@Schema({ timestamps: true })
export class CompanyAttachment {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId: Types.ObjectId;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  fileUrl: string;

  @Prop()
  mimeType?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;
}

export const CompanyAttachmentSchema =
  SchemaFactory.createForClass(CompanyAttachment);
