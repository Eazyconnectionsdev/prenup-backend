import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** A document uploaded against a company or lawyer (certificate, insurance, contract...). */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StoredFile {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  category!: string;

  @Prop({ required: true })
  fileName!: string;

  /** S3 object key. Files are served through an authenticated endpoint, never by public URL. */
  @Prop({ required: true })
  fileKey!: string;

  @Prop()
  mimeType?: string;

  @Prop()
  fileSize?: number;

  @Prop({ type: Date })
  issueDate?: Date;

  @Prop({ type: Date })
  expiryDate?: Date;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  createdAt?: Date;
}

export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);
