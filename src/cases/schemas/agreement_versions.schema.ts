// src/case-manager/schemas/agreement-version.schema.ts

import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Types,
  Document,
} from 'mongoose';

export type AgreementVersionDocument =
  AgreementVersion & Document;

@Schema({
  timestamps: true,
  collection: 'agreement_versions',
})
export class AgreementVersion {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  version!: string;

  @Prop({
    required: true,
  })
  fileUrl!: string;

  @Prop()
  notes?: string;

  @Prop({
    default: false,
  })
  isMaster!: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  uploadedBy!: Types.ObjectId;
}

export const AgreementVersionSchema =
  SchemaFactory.createForClass(
    AgreementVersion,
  );