import { Config } from './config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { MailModule } from './mail/mail.module';
import { LawyerModule } from './cases/lawyer-manager/lawyer.module';
import { CaseManagerModule } from './cases/case-manager/case-manager.module';
import { AdminModule } from './admin/admin.module';
import { AgreementModule } from './agreement/agreement.module';
import { AuditLogModule } from './common/audit-log/audit-log.module';
import { CompaniesModule } from './cases/companies/companies.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SeedModule } from './seed/seed.module';
import { TrackingModule } from './tracking/tracking.module';
import { PaymentsModule } from './payments/payments.module';
import { GdprModule } from './gdpr/gdpr.module';
import { ReportsModule } from './reports/reports.module';


import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(Config.mongoURI),
    EventEmitterModule.forRoot(),
    TrackingModule,
    PaymentsModule,
    UsersModule,
    AuthModule,
    CasesModule,
    AgreementModule,
    MailModule,
    AdminModule,
    CaseManagerModule,
    CompaniesModule,
    LawyerModule,
    AuditLogModule,
    SeedModule,
    GdprModule,
    ReportsModule,


  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

