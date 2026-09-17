// src/agreement/agreement.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Case, CaseSchema } from '../cases/schemas/case.schema';
import { AgreementController } from './agreement.controller';
import { AgreementService } from './agreement.service';
import {
  AgreementVersion,
  AgreementVersionSchema,
} from './schemas/agreement_version.schema';
import { S3Module } from 'src/s3/s3.module';
import {
  AgreementLock,
  AgreementLockSchema,
} from './schemas/agreement_lock.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgreementVersion.name, schema: AgreementVersionSchema },
      { name: AgreementLock.name, schema: AgreementLockSchema },
      { name: Case.name, schema: CaseSchema },
    ]),
    S3Module,
  ],
  controllers: [AgreementController],
  providers: [AgreementService],
  exports: [AgreementService],
})
export class AgreementModule {}
