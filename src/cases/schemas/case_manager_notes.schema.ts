// src/case-manager/schemas/case-manager-note.schema.ts

import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Document,
  Types,
} from 'mongoose';

export type CaseManagerNoteDocument =
  CaseManagerNote & Document;

export enum NoteCategory {
  OPERATIONAL = 'OPERATIONAL',
  CLARIFICATION = 'CLARIFICATION',
  ESCALATION = 'ESCALATION',
  RISK = 'RISK',
  COMPLAINT = 'COMPLAINT',
}

@Schema({
  timestamps: true,
  collection: 'case_manager_notes',
})
export class CaseManagerNote {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    enum: Object.values(NoteCategory),
    required: true,
  })
  category!: NoteCategory;

  @Prop({
    required: true,
    trim: true,
  })
  note!: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy!: Types.ObjectId;

  @Prop({
    default: true,
  })
  isActive!: boolean;
}

export const CaseManagerNoteSchema =
  SchemaFactory.createForClass(
    CaseManagerNote,
  );