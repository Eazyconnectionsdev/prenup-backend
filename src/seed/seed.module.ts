import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Company, CompanySchema } from '../cases/schemas/company.schema';
import { Lawyer, LawyerSchema } from '../cases/schemas/lawyer.schema';
import { SeedService } from './seed.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Lawyer.name, schema: LawyerSchema },
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
