// Security & Compliance section. Every list is read-only; the underlying
// collections are append-only.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { toActorRole } from '../common/request-context';
import { GDPR_STATUS_LABELS, GDPR_TYPE_LABELS, GdprRequest } from '../gdpr/gdpr-request.schema';
import { paymentLabel, workflowLabel } from '../tracking/labels';
import {
  CaseAssignmentHistory,
  CaseStatusHistory,
  SecurityEvent,
  SecurityEventKind,
} from '../tracking/schemas/tracking.schemas';
import { ACTOR_ROLE_FOR, dateMatch, escapeRegex, paged, ReportFilters, rolesFor } from './report-filters';

const STAFF = ['superadmin', 'admin', 'case_manager', 'lawyer'];
const ADMIN_AND_CM = ['superadmin', 'admin', 'case_manager'];

const ROLE_LABEL = (role?: string | null) => (role ? toActorRole(role) : '—');

const CATEGORY_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  CASE_UPDATE: 'Case Update',
  ASSIGNMENT: 'Assignment',
  STATUS_CHANGE: 'Status Change',
  DOCUMENT_ACCESS: 'Document Access',
  ACCOUNT_CHANGE: 'Account Change',
};

const ASSIGNMENT_KIND_LABELS: Record<string, string> = {
  CASE_MANAGER: 'Case Manager',
  LAWYER_P1: 'Applicant 1 Solicitor',
  LAWYER_P2: 'Applicant 2 Solicitor',
};

@Injectable()
export class SecurityReportsService {
  constructor(
    @InjectModel(SecurityEvent.name) private readonly events: Model<any>,
    @InjectModel(CaseStatusHistory.name) private readonly statusHistory: Model<any>,
    @InjectModel(CaseAssignmentHistory.name) private readonly assignments: Model<any>,
    @InjectModel(GdprRequest.name) private readonly gdpr: Model<any>,
  ) {}

  // Filters shared by the security_events lists.
  private eventMatch(f: ReportFilters, defaultRoles?: string[]) {
    const q: any = { ...dateMatch(f, 'createdAt') };
    const roles = rolesFor(f.role) ?? defaultRoles;
    if (roles) q.role = { $in: roles };
    if (f.userId) q.userId = new Types.ObjectId(f.userId);
    const and: any[] = [];
    if (f.userQuery) {
      const rx = { $regex: escapeRegex(f.userQuery), $options: 'i' };
      and.push({ $or: [{ userName: rx }, { email: rx }] });
    }
    if (f.caseQuery) {
      const rx = { $regex: escapeRegex(f.caseQuery), $options: 'i' };
      const or: any[] = [{ caseNumber: rx }];
      if (Types.ObjectId.isValid(f.caseQuery)) or.push({ caseId: new Types.ObjectId(f.caseQuery) });
      and.push({ $or: or });
    }
    if (and.length) q.$and = and;
    return q;
  }

  private async page(model: Model<any>, q: any, f: ReportFilters, sort: any = { createdAt: -1, _id: -1 }) {
    const [total, rows] = await Promise.all([
      model.countDocuments(q),
      model.find(q).sort(sort).skip((f.page - 1) * f.pageSize).limit(f.pageSize).lean(),
    ]);
    return { total, rows: rows as any[] };
  }

  // ── 1. Admin & CM login history ──

  async logins(f: ReportFilters) {
    const q = this.eventMatch(f, f.raw.scope === 'all' ? undefined : ADMIN_AND_CM);
    q.kind = SecurityEventKind.LOGIN;
    // Failed attempts for unknown emails have no role; include them when no
    // role filter narrows the list.
    if (!f.role && q.role) {
      const roleCond = q.role;
      delete q.role;
      q.$and = [...(q.$and ?? []), { $or: [{ role: roleCond }, { role: null, result: 'FAILED' }] }];
    }
    if (f.raw.result === 'success') q.result = 'SUCCESS';
    if (f.raw.result === 'failed') q.result = 'FAILED';
    const { total, rows } = await this.page(this.events, q, f);
    return paged(
      rows.map((r) => ({
        id: String(r._id),
        userName: r.userName || '—',
        email: r.email || '—',
        role: ROLE_LABEL(r.role),
        at: r.createdAt,
        ipAddress: r.ipAddress || '—',
        result: r.result === 'SUCCESS' ? 'Successful' : 'Failed',
        failureReason: r.result === 'SUCCESS' ? null : r.reason || 'Unknown',
        userAgent: r.userAgent || null,
      })),
      total,
      f,
    );
  }

  // ── 2. User access history ──

  async access(f: ReportFilters) {
    const q = this.eventMatch(f);
    q.kind = SecurityEventKind.ACCESS;
    if (f.raw.accessType && f.raw.accessType !== 'all') q.accessType = String(f.raw.accessType);
    const { total, rows } = await this.page(this.events, q, f);
    return paged(
      rows.map((r) => ({
        id: String(r._id),
        userName: r.userName || '—',
        email: r.email || '—',
        role: ROLE_LABEL(r.role),
        caseId: r.caseId ? String(r.caseId) : null,
        caseNumber: r.caseNumber || (r.caseId ? String(r.caseId) : null),
        at: r.createdAt,
        accessType: r.accessType,
        target: r.target,
        ipAddress: r.ipAddress || '—',
      })),
      total,
      f,
    );
  }

  // ── 3. Staff activity / audit log ──
  // Staff actions, staff logins and automatic (System) status changes.

  async activity(f: ReportFilters) {
    const cat = f.activityType && CATEGORY_LABELS[f.activityType] ? f.activityType : null;
    const q = this.eventMatch(f, STAFF);
    q.kind = { $in: [SecurityEventKind.ACTIVITY, SecurityEventKind.LOGIN] };
    if (cat) q.category = cat;
    else q.$and = [...(q.$and ?? []), { $or: [{ kind: SecurityEventKind.ACTIVITY }, { result: 'SUCCESS' }] }];

    const includeSystem =
      !f.userId && !f.userQuery && (!f.role || f.role === 'system') && (!cat || cat === 'STATUS_CHANGE');
    const sysQ: any = { ...dateMatch(f, 'createdAt'), actorRole: 'System' };
    if (f.caseQuery) sysQ.caseNumber = { $regex: escapeRegex(f.caseQuery), $options: 'i' };

    if (f.role === 'system') {
      const { total, rows } = await this.page(this.statusHistory, sysQ, f);
      return paged(rows.map((r) => this.systemActivityRow(r)), total, f);
    }

    // Merge the two sources newest first.
    const need = f.page * f.pageSize;
    const [evTotal, evRows, sysTotal, sysRows] = await Promise.all([
      this.events.countDocuments(q),
      this.events.find(q).sort({ createdAt: -1 }).limit(need).lean(),
      includeSystem ? this.statusHistory.countDocuments(sysQ) : Promise.resolve(0),
      includeSystem ? this.statusHistory.find(sysQ).sort({ createdAt: -1 }).limit(need).lean() : Promise.resolve([]),
    ]);
    const merged = [
      ...(evRows as any[]).map((r) => ({
        id: String(r._id),
        staffName: r.userName || r.email || '—',
        role: ROLE_LABEL(r.role),
        activity: r.activity || (r.kind === 'LOGIN' ? 'Logged in' : '—'),
        activityType: CATEGORY_LABELS[r.category] || (r.kind === 'LOGIN' ? 'Login' : '—'),
        caseId: r.caseId ? String(r.caseId) : null,
        caseNumber: r.caseNumber || (r.caseId ? String(r.caseId) : null),
        previousValue: r.previousValue || null,
        newValue: r.newValue || null,
        at: r.createdAt,
        ipAddress: r.ipAddress || null,
      })),
      ...(sysRows as any[]).map((r) => this.systemActivityRow(r)),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const start = (f.page - 1) * f.pageSize;
    return paged(merged.slice(start, start + f.pageSize), evTotal + sysTotal, f);
  }

  private systemActivityRow(r: any) {
    const label = r.field === 'paymentStatus' ? paymentLabel : workflowLabel;
    return {
      id: String(r._id),
      staffName: 'System',
      role: 'System',
      activity: r.comments || (r.field === 'paymentStatus' ? 'Payment status changed' : 'Status changed'),
      activityType: 'Status Change',
      caseId: String(r.caseId),
      caseNumber: r.caseNumber || String(r.caseId),
      previousValue: `${r.field === 'paymentStatus' ? 'Payment' : 'Status'}: ${label(r.from)}`,
      newValue: `${r.field === 'paymentStatus' ? 'Payment' : 'Status'}: ${label(r.to)}`,
      at: r.createdAt,
      ipAddress: null,
    };
  }

  // Filters for the case history collections (actor fields differ).
  private historyMatch(f: ReportFilters, actor: { id: string; name: string; role: string }) {
    const q: any = { ...dateMatch(f, 'createdAt') };
    if (f.role && ACTOR_ROLE_FOR[f.role]) q[actor.role] = ACTOR_ROLE_FOR[f.role];
    if (f.userId) q[actor.id] = new Types.ObjectId(f.userId);
    if (f.userQuery) q[actor.name] = { $regex: escapeRegex(f.userQuery), $options: 'i' };
    if (f.caseQuery) {
      const or: any[] = [{ caseNumber: { $regex: escapeRegex(f.caseQuery), $options: 'i' } }];
      if (Types.ObjectId.isValid(f.caseQuery)) or.push({ caseId: new Types.ObjectId(f.caseQuery) });
      q.$or = or;
    }
    return q;
  }

  // ── 4. Case assignment history ──

  async assignmentHistory(f: ReportFilters) {
    const q = this.historyMatch(f, { id: 'performedById', name: 'performedByName', role: 'performedByRole' });
    const kind = String(f.raw.kind || 'CASE_MANAGER').toUpperCase();
    if (kind !== 'ALL' && ASSIGNMENT_KIND_LABELS[kind]) q.kind = kind;
    const { total, rows } = await this.page(this.assignments, q, f);
    return paged(
      rows.map((r) => ({
        id: String(r._id),
        caseId: String(r.caseId),
        caseNumber: r.caseNumber || String(r.caseId),
        assignment: ASSIGNMENT_KIND_LABELS[r.kind] || r.kind,
        previous: r.previousName || (r.previousId ? 'Unknown' : 'Unassigned'),
        new: r.newName || (r.newId ? 'Unknown' : 'Unassigned'),
        performedBy: r.performedByName,
        performedByRole: r.performedByRole,
        reason: r.reason || '—',
        at: r.createdAt,
      })),
      total,
      f,
    );
  }

  // ── 5. Case status change history ──

  async statusChanges(f: ReportFilters) {
    const q = this.historyMatch(f, { id: 'actorId', name: 'actorName', role: 'actorRole' });
    q.field = f.raw.field === 'paymentStatus' ? 'paymentStatus' : f.raw.field === 'all' ? { $in: ['workflowStatus', 'paymentStatus'] } : 'workflowStatus';
    if (f.statuses.length) q.to = { $in: f.statuses };
    const { total, rows } = await this.page(this.statusHistory, q, f);
    return paged(
      rows.map((r) => {
        const label = r.field === 'paymentStatus' ? paymentLabel : workflowLabel;
        return {
          id: String(r._id),
          caseId: String(r.caseId),
          caseNumber: r.caseNumber || String(r.caseId),
          field: r.field === 'paymentStatus' ? 'Payment Status' : 'Case Status',
          previousStatus: label(r.from),
          newStatus: label(r.to),
          changedBy: r.actorName,
          role: r.actorRole,
          at: r.createdAt,
          comments: r.comments || '—',
        };
      }),
      total,
      f,
    );
  }

  // ── 6. Unauthorized access attempts ──

  async unauthorized(f: ReportFilters) {
    const q = this.eventMatch(f);
    const type = String(f.raw.attemptType || 'all');
    const or: any[] = [];
    if (type === 'all' || type === 'Failed Login') or.push({ kind: SecurityEventKind.LOGIN, result: 'FAILED' });
    if (type === 'all' || type !== 'Failed Login') {
      const u: any = { kind: SecurityEventKind.UNAUTHORIZED };
      if (type !== 'all') u.attemptType = type;
      or.push(u);
    }
    q.$and = [...(q.$and ?? []), { $or: or }];
    const { total, rows } = await this.page(this.events, q, f);
    return paged(
      rows.map((r) => ({
        id: String(r._id),
        userName: r.userName || 'Anonymous',
        email: r.email || '—',
        ipAddress: r.ipAddress || '—',
        at: r.createdAt,
        attemptType: r.attemptType || (r.kind === 'LOGIN' ? 'Failed Login' : 'Restricted Page Access'),
        target: r.caseNumber ? `${r.caseNumber} (${r.target})` : r.target || '—',
        result: r.kind === 'LOGIN' ? 'Failed' : 'Denied',
        details: r.details || r.reason || '—',
      })),
      total,
      f,
    );
  }

  // ── 7. GDPR data requests ──

  async gdprRequests(f: ReportFilters) {
    const q: any = { ...dateMatch(f, 'requestDate') };
    if (f.raw.gdprStatus && f.raw.gdprStatus !== 'all') q.status = String(f.raw.gdprStatus).toUpperCase();
    if (f.raw.gdprType && f.raw.gdprType !== 'all') q.type = String(f.raw.gdprType).toUpperCase();
    if (f.userQuery) {
      const rx = { $regex: escapeRegex(f.userQuery), $options: 'i' };
      q.$or = [{ userName: rx }, { email: rx }, { requestId: rx }];
    }
    if (f.userId) q.$and = [{ $or: [{ userId: new Types.ObjectId(f.userId) }, { assignedTo: new Types.ObjectId(f.userId) }] }];
    if (f.raw.overdue === 'overdue') {
      q.status = { $in: ['RECEIVED', 'IN_PROGRESS'] };
      q.responseDueDate = { $lt: new Date() };
    }
    const now = Date.now();
    const [{ total, rows }, open, overdue] = await Promise.all([
      this.page(this.gdpr, q, f, { requestDate: -1, _id: -1 }),
      this.gdpr.countDocuments({ status: { $in: ['RECEIVED', 'IN_PROGRESS'] } }),
      this.gdpr.countDocuments({ status: { $in: ['RECEIVED', 'IN_PROGRESS'] }, responseDueDate: { $lt: new Date() } }),
    ]);
    return {
      ...paged(
        rows.map((r) => {
          const closed = ['COMPLETED', 'REJECTED'].includes(r.status);
          return {
            id: String(r._id),
            requestId: r.requestId,
            userName: r.userName,
            email: r.email,
            type: r.type,
            typeLabel: GDPR_TYPE_LABELS[r.type] || r.type,
            requestDate: r.requestDate,
            assignedTo: r.assignedToName || 'Unassigned',
            assignedToId: r.assignedTo ? String(r.assignedTo) : null,
            status: r.status,
            statusLabel: GDPR_STATUS_LABELS[r.status] || r.status,
            completionDate: r.completionDate ?? null,
            notes: r.notes || '',
            responseDueDate: r.responseDueDate,
            overdue: !closed && new Date(r.responseDueDate).getTime() < now,
            daysRemaining: closed ? null : Math.ceil((new Date(r.responseDueDate).getTime() - now) / 86400000),
            source: r.source,
            history: r.history ?? [],
          };
        }),
        total,
        f,
      ),
      summary: { open, overdue },
    };
  }

  // ── 8. Sensitive information access ──

  async sensitiveAccess(f: ReportFilters) {
    const q = this.eventMatch(f, STAFF);
    q.kind = SecurityEventKind.SENSITIVE;
    if (f.raw.infoType && f.raw.infoType !== 'all') q.infoTypes = String(f.raw.infoType);
    if (f.raw.action && f.raw.action !== 'all') q.action = String(f.raw.action);
    const { total, rows } = await this.page(this.events, q, f);
    return paged(
      rows.map((r) => ({
        id: String(r._id),
        staffName: r.userName || r.email || '—',
        role: ROLE_LABEL(r.role),
        caseId: r.caseId ? String(r.caseId) : null,
        caseNumber: r.caseNumber || (r.caseId ? String(r.caseId) : '—'),
        applicant: r.applicant || '—',
        informationType: (r.infoTypes || []).join(', ') || '—',
        action: r.action || '—',
        at: r.createdAt,
        ipAddress: r.ipAddress || '—',
        target: r.target,
      })),
      total,
      f,
    );
  }
}
