import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Case,
  CaseSchema,
} from '../schemas/case.schema';

import {
  Lawyer,
  LawyerSchema,
} from '../schemas/lawyer.schema';

import {
  Company,
  CompanySchema,
} from '../schemas/company.schema';

import {
  User,
  UserSchema,
} from '../../users/schemas/user.schema';

import {
  CaseManagerNote,
  CaseManagerNoteSchema,
} from '../schemas/case_manager_notes.schema';

import {
  CaseDocumentEntity,
  CaseDocumentSchema,
} from '../schemas/case_documents.schema';

import {
  CaseVersion,
  CaseVersionSchema,
} from '../schemas/case_versions.schema';

import {
  CaseTimeline,
  CaseTimelineSchema,
} from '../schemas/case_timeline.schema';

import {
  CaseAuditLog,
  CaseAuditLogSchema,
} from '../schemas/case_audit_logs.schema';

import {
  AgreementVersion,
  AgreementVersionSchema,
} from '../schemas/agreement_versions.schema';

import {
  CaseChangeSet,
  CaseChangeSetSchema,
} from '../schemas/case_changesets.schema';

import { LawyerService } from './lawyer.service';

import { LawyerController } from './lawyer.controller';
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
        name: Company.name,
        schema: CompanySchema,
      },
      {
        name: User.name,
        schema: UserSchema,
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