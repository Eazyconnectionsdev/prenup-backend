import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CaseAssignmentHistory,
  CaseAssignmentHistorySchema,
  CaseStatusHistory,
  CaseStatusHistorySchema,
  SecurityEvent,
  SecurityEventSchema,
} from './schemas/tracking.schemas';
import { SecurityEventService } from './security-event.service';
import { ActivityInterceptor } from './activity.interceptor';

// Global so the case hooks (which look models up on the connection) and any
// service can record audit events.
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CaseStatusHistory.name, schema: CaseStatusHistorySchema },
      { name: CaseAssignmentHistory.name, schema: CaseAssignmentHistorySchema },
      { name: SecurityEvent.name, schema: SecurityEventSchema },
    ]),
  ],
  providers: [
    SecurityEventService,
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
  ],
  exports: [SecurityEventService, MongooseModule],
})
export class TrackingModule {}
