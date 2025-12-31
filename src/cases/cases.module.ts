import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Case, CaseSchema } from './schemas/case.schema';
import { CasesService } from './cases.service';
import { LawyersService } from './lawyer.service';
import { CasesController } from './cases.controller';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { Lawyer, LawyerSchema } from './schemas/lawyer.schema';

@Module({
  imports: [
     MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: Lawyer.name, schema: LawyerSchema },
    ]),
    MailModule,
    UsersModule,
  ],
  providers: [CasesService, LawyersService],
  controllers: [CasesController],
  exports: [CasesService, LawyersService],
})
export class CasesModule {}
