import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { Roles } from '../roles.decorator';
import { RolesGuard } from '../roles.guard';

// Case timelines and user activity are staff-only; these routes used to answer
// to anyone, signed in or not.
@Controller('audit-logs')
@Roles('superadmin', 'admin', 'case_manager')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('case/:caseId')
  async getCaseTimeline(
    @Param('caseId') caseId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.auditLogService.getCaseTimeline(caseId, {
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('user/:userId')
  async getUserActivity(
    @Param('userId') userId: string,
    @Query('module') module?: string,
  ) {
    return this.auditLogService.getUserActivity(userId, { module });
  }

  @Get('entity/:entityType/:entityId')
  async getEntityHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLogService.getEntityHistory(entityType, entityId);
  }
}