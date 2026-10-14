import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Company, CompanySchema } from './schemas/company.schema';
import { Lawyer, LawyerSchema } from './schemas/lawyer.schema';
import { Enquiry, EnquirySchema } from './schemas/enquiry.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Case, CaseSchema } from '../cases/schemas/case.schema';
import { Settings, SettingsSchema } from './schemas/settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: Lawyer.name, schema: LawyerSchema },
      { name: Enquiry.name, schema: EnquirySchema },
      { name: User.name, schema: UserSchema },
      { name: Case.name, schema: CaseSchema },
      { name: Settings.name, schema: SettingsSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}