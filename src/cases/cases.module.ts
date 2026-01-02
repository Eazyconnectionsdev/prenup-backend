import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Case, CaseSchema } from './schemas/case.schema';
import { CompaniesService } from './companies.service';
import { CasesService } from './cases.service';
import { LawyersService } from './lawyer.service';
import { CasesController } from './cases.controller';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { Lawyer, LawyerSchema } from './schemas/lawyer.schema';
import { Company, CompanySchema } from './schemas/company.schema';

@Module({
  imports: [
     MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: Lawyer.name, schema: LawyerSchema },
      { name: Lawyer.name, schema: LawyerSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
    MailModule,
    UsersModule,
  ],
  providers: [CasesService, LawyersService, CompaniesService],
  controllers: [CasesController],
  exports: [CasesService, LawyersService, CompaniesService],
})
export class CasesModule {}
