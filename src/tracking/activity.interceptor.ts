// Records, for successful requests:
//  - User Access History: dashboards, case records and profiles opened
//  - Sensitive Information Access: staff reading or moving case data/documents
//  - Staff Activity: every change a staff member makes, with the previous
//    and new values the case hooks captured during the request

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { isStaffRole, RequestContext, TrackedChange } from '../common/request-context';
import {
  caseIdFromPath,
  describeAccess,
  describeActivity,
  describeSensitive,
  isIgnored,
} from './activity-routes';
import { ActivityCategory, SecurityEventKind } from './schemas/tracking.schemas';
import { SecurityEventService } from './security-event.service';

const summarise = (changes: TrackedChange[], side: 'from' | 'to') =>
  changes
    .map((c) => {
      const name =
        c.kind === 'STATUS'
          ? 'Status'
          : c.kind === 'PAYMENT_STATUS'
            ? 'Payment'
            : c.field === 'CASE_MANAGER'
              ? 'Case Manager'
              : c.field === 'LAWYER_P1'
                ? 'Applicant 1 Solicitor'
                : 'Applicant 2 Solicitor';
      return `${name}: ${(side === 'from' ? c.fromLabel : c.toLabel) ?? '—'}`;
    })
    .join('; ') || null;

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly events: SecurityEventService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    const path: string = (req.originalUrl || req.url || '').split('?')[0];

    return next.handle().pipe(
      tap(() => {
        const user = req.user;
        if (!user || isIgnored(path)) return;
        const res = context.switchToHttp().getResponse();
        void this.log(user, method, path, res?.statusCode).catch(() => undefined);
      }),
    );
  }

  private async log(user: any, method: string, path: string, statusCode?: number) {
    const userId = String(user.id ?? user._id);
    const base = {
      userId,
      userName: user.name || null,
      email: user.email,
      role: user.role,
      method,
      target: path,
      statusCode: statusCode ?? null,
    };
    const caseId = caseIdFromPath(path);
    const caseMeta = caseId ? await this.events.describeCase(caseId) : null;

    const access = describeAccess(method, path);
    if (access) {
      await this.events.record(
        {
          ...base,
          kind: SecurityEventKind.ACCESS,
          accessType: access.accessType,
          caseId: access.caseId,
          caseNumber: caseMeta?.caseNumber ?? null,
        },
        `access|${userId}|${access.accessType}|${access.caseId ?? path}`,
      );
    }

    if (!isStaffRole(user.role)) return;

    const sensitive = describeSensitive(method, path);
    if (sensitive) {
      await this.events.record(
        {
          ...base,
          kind: SecurityEventKind.SENSITIVE,
          category: ActivityCategory.DOCUMENT_ACCESS,
          infoTypes: sensitive.infoTypes,
          action: sensitive.action,
          caseId,
          caseNumber: caseMeta?.caseNumber ?? null,
          applicant: caseMeta?.applicant || null,
        },
        // Reads are de-duplicated; every upload or download is kept.
        sensitive.action === 'Viewed'
          ? `sensitive|${userId}|${caseId ?? path}|${sensitive.infoTypes.join(',')}`
          : undefined,
      );
    }

    const activity = describeActivity(method, path);
    if (activity) {
      const changes = (RequestContext.get()?.changes ?? []).filter(
        (c) => !caseId || c.caseId === caseId,
      );
      let category = activity.category;
      if (changes.some((c) => c.kind === 'ASSIGNMENT')) category = ActivityCategory.ASSIGNMENT;
      else if (changes.some((c) => c.kind === 'STATUS')) category = ActivityCategory.STATUS_CHANGE;
      await this.events.record({
        ...base,
        kind: SecurityEventKind.ACTIVITY,
        category,
        activity: activity.label,
        caseId: caseId ?? changes[0]?.caseId ?? null,
        caseNumber: caseMeta?.caseNumber ?? changes[0]?.caseNumber ?? null,
        previousValue: summarise(changes, 'from'),
        newValue: summarise(changes, 'to'),
      });
    }
  }
}
