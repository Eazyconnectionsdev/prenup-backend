import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Case,
  CaseSchema,
} from './schemas/case.schema';

import {
  Lawyer,
  LawyerSchema,
} from './schemas/lawyer.schema';

import {
  Company,
  CompanySchema,
} from './schemas/company.schema';

import {
  CaseBackup,
  CaseBackupSchema,
} from './schemas/case_backup.schema';

import {
  User,
  UserSchema,
} from '../users/schemas/user.schema';

import { CompaniesService } from './companies/companies.service';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';

import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';

import { LawyerModule } from './lawyer-manager/lawyer.module';

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
        name: CaseBackup.name,
        schema: CaseBackupSchema,
      },

      {
        name: User.name,
        schema: UserSchema,
      },
    ]),

    MailModule,

    UsersModule,

    // IMPORTANT
    LawyerModule,
  ],

  providers: [
    CasesService,
    CompaniesService,

  ],

  controllers: [
    CasesController,
  ],

  exports: [
    CasesService,
    CompaniesService,
  ],
})
export class CasesModule {}