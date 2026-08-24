// src/case-manager/schemas/case-timeline.schema.ts

import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Document,
  Types,
} from 'mongoose';

export type CaseTimelineDocument =
  CaseTimeline & Document;

@Schema({
  timestamps: true,
  collection: 'case_timeline',
})
export class CaseTimeline {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  action!: string;

  @Prop()
  description?: string;

  @Prop()
  notes?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  performedBy!: Types.ObjectId;
}

export const CaseTimelineSchema =
  SchemaFactory.createForClass(
    CaseTimeline,
  );