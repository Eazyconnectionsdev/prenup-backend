import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AgreementDocument = AgreementVersion & Document;

@Schema({
  timestamps: true,
  collection: 'agreement_versions',
})
export class AgreementVersion {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
    index: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  majorVersion!: number;

  @Prop({
    required: true,
  })
  minorVersion!: number;

  @Prop({
    required: true,
  })
  s3Bucket!: string;

  @Prop({
    required: true,
  })
  s3Key!: string;

  @Prop({
    type: String,
    default: null,
  })
  s3Url?: string | null;

  @Prop({
    type: Date,
    default: null,
  })
  s3UrlExpiresAt?: Date | null;

  @Prop({
    type: String,
    default: null,
  })
  pdfS3Key!: string | null;

  @Prop({
    type: String,
    default: null,
  })
  pdfUrl!: string | null;

  @Prop({
    required: true,
  })
  originalFileName!: string;

  @Prop({
    required: true,
  })
  mimeType!: string;

  @Prop({
    required: true,
  })
  fileSizeBytes!: number;

  @Prop({
    required: true,
  })
  checksum!: string;

  @Prop({
    default: false,
  })
  isCurrent!: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  checkedInBy!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
  })
  checkedInByRole!: string;

  @Prop({
    type: String,
    required: true,
  })
  roleTag!: string;

  @Prop({
    type: String,
    required: true,
  })
  versionLabel!: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'AgreementVersion',
    default: null,
  })
  previousVersionId?: Types.ObjectId | null;

  @Prop({
    type: [String],
    required: true,
    default: [],
  })
  amendmentSummary!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgreementVersionSchema =
  SchemaFactory.createForClass(AgreementVersion);

AgreementVersionSchema.index(
  { caseId: 1, majorVersion: 1, minorVersion: 1 },
  { unique: true },
);

AgreementVersionSchema.index({
  caseId: 1,
  majorVersion: -1,
  minorVersion: -1,
});

AgreementVersionSchema.index({ caseId: 1, isCurrent: 1 });