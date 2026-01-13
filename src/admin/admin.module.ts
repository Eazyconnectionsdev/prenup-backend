import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service'; 
import { Company, CompanySchema } from './schemas/company.schema';
import { Lawyer, LawyerSchema } from './schemas/lawyer.schema';
import { Enquiry, EnquirySchema } from './schemas/enquiry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: Lawyer.name, schema: LawyerSchema },
      { name: Enquiry.name, schema: EnquirySchema },
      // NOTE: User model assumed to exist elsewhere in the app
      { name: 'User', schema: undefined as any },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}