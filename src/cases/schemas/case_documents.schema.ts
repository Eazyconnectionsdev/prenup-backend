// src/case-manager/schemas/case-document.schema.ts

import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Document,
  Types,
} from 'mongoose';

export type CaseDocumentEntityDocument =
  CaseDocumentEntity & Document;

export enum DocumentCategory {
  APPROVAL_EMAIL = 'APPROVAL_EMAIL',
  QUESTIONNAIRE = 'QUESTIONNAIRE',
  LEGAL_DOCUMENT = 'LEGAL_DOCUMENT',
  EXECUTION_PACK = 'EXECUTION_PACK',
  CM_ATTACHMENT = 'CM_ATTACHMENT',
  OTHER = 'OTHER',
}

@Schema({
  timestamps: true,
  collection: 'case_documents',
})
export class CaseDocumentEntity {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  fileName!: string;

  @Prop({
    required: true,
  })
  originalName!: string;

  @Prop()
  mimeType?: string;

  @Prop()
  fileSize?: number;

  @Prop({
    required: true,
  })
  fileUrl!: string;

  @Prop({
    enum: Object.values(
      DocumentCategory,
    ),
    default: DocumentCategory.OTHER,
  })
  category!: DocumentCategory;

  @Prop()
  notes?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  uploadedBy!: Types.ObjectId;
}

export const CaseDocumentSchema =
  SchemaFactory.createForClass(
    CaseDocumentEntity,
  );