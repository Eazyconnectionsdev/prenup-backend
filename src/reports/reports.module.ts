import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Case, CaseSchema } from '../cases/schemas/case.schema';
import { Company, CompanySchema } from '../cases/schemas/company.schema';
import { Lawyer, LawyerSchema } from '../cases/schemas/lawyer.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { GdprModule } from '../gdpr/gdpr.module';
import { CaseReportsService } from './case-reports.service';
import { FinanceReportsService } from './finance-reports.service';
import { SecurityReportsService } from './security-reports.service';
import { ReportsController } from './reports.controller';

// Tracking and payment models come from their global modules.
@Module({
  imports: [
    GdprModule,
    MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: User.name, schema: UserSchema },
      { name: Lawyer.name, schema: LawyerSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [CaseReportsService, FinanceReportsService, SecurityReportsService],
})
export class ReportsModule {}
