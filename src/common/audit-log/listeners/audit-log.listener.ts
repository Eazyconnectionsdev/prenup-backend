import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLogService } from '../audit-log.service';
import { AUDIT_EVENT, AuditEvent  } from '../events/audit.event';


@Injectable()
export class AuditLogListener {
  constructor(private readonly auditLogService: AuditLogService) {}

  @OnEvent(AUDIT_EVENT, { async: true })
  async handleAuditEvent(payload: AuditEvent) {
    await this.auditLogService.log(payload);
  }
}