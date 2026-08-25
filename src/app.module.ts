import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { MailModule } from './mail/mail.module';
import { CaseManagerModule } from './cases/case-manager/case-manager.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/ezconnection', {
      // mongoose options as needed
    }),
    UsersModule,
    AuthModule,
    CasesModule,
    MailModule,
    AdminModule,
    CaseManagerModule
  ],
})
export class AppModule {}
