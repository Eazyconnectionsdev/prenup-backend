import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  Document,
  Types,
} from 'mongoose';

@Schema({
  timestamps: true,
})
export class CaseBackup {
  @Prop({
    type: Types.ObjectId,
    ref: 'Case',
    required: true,
  })
  caseId!: Types.ObjectId;

  @Prop({
    type: Object,
    required: true,
  })
  snapshot!: any;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
  })
  createdBy!: Types.ObjectId;
}

export type CaseBackupDocument =
  CaseBackup &
  Document;

export const CaseBackupSchema =
  SchemaFactory.createForClass(
    CaseBackup,
  );