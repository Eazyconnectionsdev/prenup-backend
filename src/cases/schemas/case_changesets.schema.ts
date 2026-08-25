// src/case-manager/schemas/case-change-set.schema.ts

import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Types,
  Document,
} from 'mongoose';

export type CaseChangeSetDocument =
  CaseChangeSet & Document;

@Schema({
  timestamps: true,
  collection: 'case_changesets',
})
export class CaseChangeSet {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  fromVersion!: string;

  @Prop({
    required: true,
  })
  toVersion!: string;

  @Prop({
    required: true,
  })
  field!: string;

  @Prop({
    type: Object,
  })
  previousValue?: any;

  @Prop({
    type: Object,
  })
  newValue?: any;

  @Prop({
    required: true,
  })
  action!: string;

  @Prop()
  comment?: string;
}

export const CaseChangeSetSchema =
  SchemaFactory.createForClass(
    CaseChangeSet,
  );