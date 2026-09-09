import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { MailModule } from './mail/mail.module';
import { CaseManagerModule } from './cases/case-manager/case-manager.module';
import { AdminModule } from './admin/admin.module';
import { Config } from './config';
import { AgreementModule } from './agreement/agreement.module';
import { AuditLogModule } from './common/audit-log/audit-log.module';
import { EventEmitterModule } from '@nestjs/event-emitter';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(Config.mongoURI),
    EventEmitterModule.forRoot(),
    UsersModule,
    AuthModule,
    CasesModule,
    AgreementModule,
    MailModule,
    AdminModule,
    CaseManagerModule,

    // AuditLogModule for All Global Files
    AuditLogModule

  ],
})
export class AppModule {}
