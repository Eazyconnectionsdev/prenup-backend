import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// Existing schemas
import { Company, CompanySchema } from './schemas/company.schema';
import { Lawyer, LawyerSchema } from './schemas/lawyer.schema';
import { Enquiry, EnquirySchema } from './schemas/enquiry.schema';

// New schemas – Admin Settings (Section 1)
import { AdminSettings, AdminSettingsSchema } from './schemas/admin-settings.schema';

// New schemas – Company attachments & notes (Section 2)
import { CompanyAttachment, CompanyAttachmentSchema } from './schemas/company-attachment.schema';
import { CompanyNote, CompanyNoteSchema } from './schemas/company-note.schema';

// New schemas – Lawyer attachments & notes (Section 2)
import { LawyerAttachment, LawyerAttachmentSchema } from './schemas/lawyer-attachment.schema';
import { LawyerNote, LawyerNoteSchema } from './schemas/lawyer-note.schema';

// Case schema (needed for Dashboard / Cases / Reports)
import { Case, CaseSchema } from '../cases/schemas/case.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      // existing
      { name: Company.name,   schema: CompanySchema },
      { name: Lawyer.name,    schema: LawyerSchema },
      { name: Enquiry.name,   schema: EnquirySchema },
      { name: 'User',         schema: undefined as any },

      // admin settings (singleton)
      { name: AdminSettings.name, schema: AdminSettingsSchema },

      // company sub-resources
      { name: CompanyAttachment.name, schema: CompanyAttachmentSchema },
      { name: CompanyNote.name,       schema: CompanyNoteSchema },

      // lawyer sub-resources
      { name: LawyerAttachment.name, schema: LawyerAttachmentSchema },
      { name: LawyerNote.name,       schema: LawyerNoteSchema },

      // cases (for Dashboard / Cases / Reports)
      { name: Case.name, schema: CaseSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}