// src/case-manager/schemas/case-version.schema.ts

import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Document,
  Types,
} from 'mongoose';

export type CaseVersionDocument =
  CaseVersion & Document;

@Schema({
  timestamps: true,
  collection: 'case_versions',
})
export class CaseVersion {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  versionNumber!: string;

  @Prop({
    required: true,
  })
  versionType!: string;

  @Prop({
    type: Object,
    required: true,
  })
  snapshot!: Record<string, any>;

  @Prop()
  changeReason?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy!: Types.ObjectId;
}

export const CaseVersionSchema =
  SchemaFactory.createForClass(
    CaseVersion,
  );