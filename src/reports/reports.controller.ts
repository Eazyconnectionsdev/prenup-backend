import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { SecurityEventKind } from '../tracking/schemas/tracking.schemas';
import { SecurityEventService } from '../tracking/security-event.service';
import { CaseReportsService } from './case-reports.service';
import { FinanceReportsService } from './finance-reports.service';
import { parseFilters } from './report-filters';
import { SecurityReportsService } from './security-reports.service';

// Admin Reports: /admin/reports/{cases|finance|security}/...
// Admins and super admins only. Large page sizes are allowed for CSV export.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin')
@Controller('admin/reports')
export class ReportsController {
  constructor(
    private readonly cases: CaseReportsService,
    private readonly finance: FinanceReportsService,
    private readonly security: SecurityReportsService,
    private readonly events: SecurityEventService,
  ) {}

  @Get('options')
  options() {
    return this.cases.options();
  }

  // ── Reports ──

  @Get('cases/status-summary')
  statusSummary(@Query() q: any) {
    return this.cases.statusSummary(parseFilters(q));
  }

  @Get('cases/case-manager-workload')
  cmWorkload(@Query() q: any) {
    return this.cases.caseManagerWorkload(parseFilters(q));
  }

  @Get('cases/firm-workload')
  firmWorkload(@Query() q: any) {
    return this.cases.firmWorkload(parseFilters(q));
  }

  @Get('cases/lawyer-workload')
  lawyerWorkload(@Query() q: any) {
    return this.cases.lawyerWorkload(parseFilters(q));
  }

  @Get('cases/funnel')
  funnel(@Query() q: any) {
    return this.cases.funnel(parseFilters(q));
  }

  @Get('cases/processing-time')
  processingTime(@Query() q: any) {
    return this.cases.processingTime(parseFilters(q));
  }

  @Get('cases/pending-overdue')
  pendingOverdue(@Query() q: any) {
    return this.cases.pendingOverdue(parseFilters(q));
  }

  // ── Finance ──

  @Get('finance/summary')
  financeSummary(@Query() q: any) {
    return this.finance.summary(parseFilters(q));
  }

  @Get('finance/transactions')
  transactions(@Query() q: any) {
    return this.finance.transactions(parseFilters(q));
  }

  // ── Security & Compliance ──
  // Reading the audit trail is itself recorded.

  private audit(req: any, report: string) {
    const u = req.user;
    void this.events.record(
      {
        kind: SecurityEventKind.ACCESS,
        accessType: 'Audit Report',
        userId: u?.id,
        userName: u?.name,
        email: u?.email,
        role: u?.role,
        target: `Security & Compliance: ${report}`,
      },
      `audit|${u?.id}|${report}`,
    );
  }

  @Get('security/logins')
  logins(@Req() req: any, @Query() q: any) {
    this.audit(req, 'Login History');
    return this.security.logins(parseFilters(q));
  }

  @Get('security/access')
  access(@Req() req: any, @Query() q: any) {
    this.audit(req, 'User Access History');
    return this.security.access(parseFilters(q));
  }

  @Get('security/activity')
  activity(@Req() req: any, @Query() q: any) {
    this.audit(req, 'Staff Activity');
    return this.security.activity(parseFilters(q));
  }

  @Get('security/assignments')
  assignments(@Req() req: any, @Query() q: any) {
    this.audit(req, 'Case Assignment History');
    return this.security.assignmentHistory(parseFilters(q));
  }

  @Get('security/status-changes')
  statusChanges(@Req() req: any, @Query() q: any) {
    this.audit(req, 'Case Status Change History');
    return this.security.statusChanges(parseFilters(q));
  }

  @Get('security/unauthorized')
  unauthorized(@Req() req: any, @Query() q: any) {
    this.audit(req, 'Unauthorized Access Attempts');
    return this.security.unauthorized(parseFilters(q));
  }

  @Get('security/gdpr')
  gdpr(@Req() req: any, @Query() q: any) {
    this.audit(req, 'GDPR Data Requests');
    return this.security.gdprRequests(parseFilters(q));
  }

  @Get('security/sensitive-access')
  sensitive(@Req() req: any, @Query() q: any) {
    this.audit(req, 'Sensitive Information Access');
    return this.security.sensitiveAccess(parseFilters(q));
  }
}
