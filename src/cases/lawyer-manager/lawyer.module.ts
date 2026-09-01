// src/case-manager/case-manager.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Case,
  CaseSchema,
} from '../../cases/schemas/case.schema';

import {
  Lawyer,
  LawyerSchema,
} from '../../cases/schemas/lawyer.schema';

import {
  CaseManagerNote,
  CaseManagerNoteSchema,
} from '../../cases/schemas/case_manager_notes.schema';

import {
  CaseDocumentEntity,
  CaseDocumentSchema,
} from '../../cases/schemas/case_documents.schema';

import {
  CaseVersion,
  CaseVersionSchema,
} from '../../cases/schemas/case_versions.schema';

import {
  CaseTimeline,
  CaseTimelineSchema,
} from '../../cases/schemas/case_timeline.schema';

import {
  CaseAuditLog,
  CaseAuditLogSchema,
} from '../../cases/schemas/case_audit_logs.schema';

import {
  AgreementVersion,
  AgreementVersionSchema,
} from '../../cases/schemas/agreement_versions.schema';

import {
  CaseChangeSet,
  CaseChangeSetSchema,
} from '../../cases/schemas/case_changesets.schema';

import { LawyerController } from './lawyer.controller';
import { LawyerService } from './lawyer.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Case.name,
        schema: CaseSchema,
      },
      {
        name: Lawyer.name,
        schema: LawyerSchema,
      },

      {
        name: CaseManagerNote.name,
        schema: CaseManagerNoteSchema,
      },

      {
        name: CaseDocumentEntity.name,
        schema: CaseDocumentSchema,
      },

      {
        name: CaseVersion.name,
        schema: CaseVersionSchema,
      },

      {
        name: CaseTimeline.name,
        schema: CaseTimelineSchema,
      },

      {
        name: CaseAuditLog.name,
        schema: CaseAuditLogSchema,
      },

      {
        name: AgreementVersion.name,
        schema: AgreementVersionSchema,
      },

      {
        name: CaseChangeSet.name,
        schema: CaseChangeSetSchema,
      },
    ]),
  ],

  controllers: [
    LawyerController,
  ],

  providers: [
    LawyerService,
  ],

  exports: [
    LawyerService,
  ],
})
export class LawyerModule {}