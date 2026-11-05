// Reports section: case counts, workload, funnel, processing time and
// pending / overdue cases. The case Date Range filters on registration date.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { userDisplayName } from '../common/request-context';
import { CaseStatusHistory } from '../tracking/schemas/tracking.schemas';
import { SERVICE_GROUP_LABELS, serviceGroupOf, WORKFLOW_ORDER, workflowLabel } from '../tracking/labels';
import {
  dateMatch,
  daysBetween,
  escapeRegex,
  paged,
  ReportFilters,
  round1,
  serviceTypes,
} from './report-filters';

const DONE = ['COMPLETED', 'ARCHIVED'];
const TERMINAL = ['COMPLETED', 'ARCHIVED', 'CANCELLED'];
const PAID_PAYMENT = ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'];
const SUBMITTED_OR_LATER = WORKFLOW_ORDER.slice(WORKFLOW_ORDER.indexOf('COUPLE_SUBMITTED')).filter(
  (s) => s !== 'CANCELLED',
);
const LAWYER_DONE = ['LAWYER_CLIENT_CONFIRMATION', 'LAWYER_SIGNOFF_COMPLETE', 'COMPLETED', 'ARCHIVED'];

// Days a case may sit in each status before it counts as overdue.
// Override any of them with REPORT_SLA_<STATUS>=<days>.
const DEFAULT_SLA_DAYS: Record<string, number> = {
  NOT_PAID: 7,
  DRAFT: 30,
  COUPLE_SUBMITTED: 3,
  CM_APPROVED: 7,
  PRE_LAWYER_PENDING: 14,
  PRE_LAWYER_COMPLETED: 3,
  LAWYERS_ASSIGNED: 5,
  LAWYER_REVIEW: 14,
  LAWYER_REVIEW_COMPLETED: 7,
  LAWYER_ILA_PENDING: 14,
  LAWYER_SIGNOFF_COMPLETE: 5,
  LAWYER_CLIENT_CONFIRMATION: 7,
};
export const slaDays = (status: string) =>
  Number(process.env[`REPORT_SLA_${status}`]) || DEFAULT_SLA_DAYS[status] || 14;

const STAGE_OF: Record<string, string> = {
  NOT_PAID: 'Registration & Payment',
  DRAFT: 'Application',
  COUPLE_SUBMITTED: 'Case Manager Review',
  CM_APPROVED: 'Case Manager Review',
  PRE_LAWYER_PENDING: 'Pre-Lawyer Questionnaire',
  PRE_LAWYER_COMPLETED: 'Lawyer Assignment',
  LAWYERS_ASSIGNED: 'Lawyer Review',
  LAWYER_REVIEW: 'Lawyer Review',
  LAWYER_REVIEW_COMPLETED: 'Independent Legal Advice',
  LAWYER_ILA_PENDING: 'Independent Legal Advice',
  LAWYER_SIGNOFF_COMPLETE: 'Final Completion',
  LAWYER_CLIENT_CONFIRMATION: 'Final Completion',
};

const CASE_FIELDS = [
  'caseNumber',
  'workflowStatus',
  'paymentStatus',
  'paymentCompleted',
  'paidAt',
  'agreementType',
  'createdAt',
  'updatedAt',
  'owner',
  'invitedUser',
  'assignedCaseManager',
  'assignedLawyerP1',
  'assignedLawyerP2',
  'cmApprovedAt',
  'lawyersAssignedAt',
  'lawyerReviewCompletedAt',
  'p1ILACompletedAt',
  'p2ILACompletedAt',
  'p1LawyerSigned',
  'p2LawyerSigned',
  'completedAt',
  'archivedAt',
  'abandonedAt',
  'approval.mutualApprovalCompletedAt',
  'preQuestionnaireUser1.submittedAt',
  'preQuestionnaireUser2.submittedAt',
  'status.myInformation.submitted',
  'status.partnerInformation.submitted',
].join(' ');

const maxDate = (...ds: (Date | null | undefined)[]) => {
  const v = ds.filter(Boolean).map((d) => new Date(d as Date).getTime());
  return v.length ? new Date(Math.max(...v)) : null;
};
const bothDates = (a?: Date | null, b?: Date | null) => (a && b ? maxDate(a, b) : null);

const isPaid = (c: any) => c.paymentCompleted || PAID_PAYMENT.includes(c.paymentStatus);

@Injectable()
export class CaseReportsService {
  constructor(
    @InjectModel('Case') private readonly caseModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('Lawyer') private readonly lawyerModel: Model<any>,
    @InjectModel('Company') private readonly companyModel: Model<any>,
    @InjectModel(CaseStatusHistory.name) private readonly historyModel: Model<any>,
  ) {}

  // ── Shared ──

  private async caseMatch(f: ReportFilters, opts: { ignoreStatus?: boolean } = {}) {
    const q: any = { ...dateMatch(f, 'createdAt') };
    const types = serviceTypes(f);
    if (types) q.agreementType = { $in: types };
    if (f.statuses.length && !opts.ignoreStatus) q.workflowStatus = { $in: f.statuses };
    if (f.caseManagerId === 'unassigned') q.assignedCaseManager = null;
    else if (f.caseManagerId) q.assignedCaseManager = new Types.ObjectId(f.caseManagerId);
    if (f.firmId) {
      const lawyers = await this.lawyerModel.find({ company: f.firmId }).select('_id').lean();
      const ids = lawyers.map((l) => l._id);
      q.$or = [{ assignedLawyerP1: { $in: ids } }, { assignedLawyerP2: { $in: ids } }];
    }
    if (f.caseQuery) q.caseNumber = { $regex: escapeRegex(f.caseQuery), $options: 'i' };
    return q;
  }

  private async loadCases(f: ReportFilters, opts: { ignoreStatus?: boolean } = {}) {
    return this.caseModel
      .find(await this.caseMatch(f, opts))
      .select(CASE_FIELDS)
      .lean();
  }

  // First time each case entered each workflow status.
  private async firstEntries(caseIds: any[]) {
    const map = new Map<string, Record<string, Date>>();
    if (!caseIds.length) return map;
    const rows = await this.historyModel
      .aggregate([
        { $match: { caseId: { $in: caseIds }, field: 'workflowStatus' } },
        { $group: { _id: { c: '$caseId', to: '$to' }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
      ])
      .allowDiskUse(true);
    for (const r of rows) {
      const key = String(r._id.c);
      const m = map.get(key) ?? {};
      m[r._id.to] = r.first;
      m[`last:${r._id.to}`] = r.last;
      map.set(key, m);
    }
    return map;
  }

  private milestones(c: any, h: Record<string, Date> = {}) {
    return {
      registered: c.createdAt ?? null,
      paid: c.paidAt || h.DRAFT || null,
      coupleSubmitted: h.COUPLE_SUBMITTED || c.approval?.mutualApprovalCompletedAt || null,
      cmApproved: c.cmApprovedAt || h.CM_APPROVED || null,
      preLawyerCompleted:
        h.PRE_LAWYER_COMPLETED ||
        bothDates(c.preQuestionnaireUser1?.submittedAt, c.preQuestionnaireUser2?.submittedAt),
      lawyersAssigned: c.lawyersAssignedAt || h.LAWYERS_ASSIGNED || null,
      lawyerReviewCompleted: c.lawyerReviewCompletedAt || h.LAWYER_REVIEW_COMPLETED || null,
      ilaCompleted: bothDates(c.p1ILACompletedAt, c.p2ILACompletedAt),
      completed: c.completedAt || h.COMPLETED || null,
    };
  }

  // When the case entered its current status.
  private enteredCurrent(c: any, h: Record<string, Date> = {}) {
    const s = c.workflowStatus;
    const fromHistory = h[`last:${s}`];
    if (fromHistory) return new Date(fromHistory);
    const m = this.milestones(c, h);
    const byStatus: Record<string, Date | null> = {
      NOT_PAID: m.registered,
      DRAFT: m.paid,
      COUPLE_SUBMITTED: m.coupleSubmitted,
      CM_APPROVED: m.cmApproved,
      PRE_LAWYER_PENDING: m.cmApproved,
      PRE_LAWYER_COMPLETED: m.preLawyerCompleted,
      LAWYERS_ASSIGNED: m.lawyersAssigned,
      LAWYER_REVIEW: m.lawyersAssigned,
      LAWYER_REVIEW_COMPLETED: m.lawyerReviewCompleted,
      LAWYER_ILA_PENDING: m.lawyerReviewCompleted,
      LAWYER_SIGNOFF_COMPLETE: m.ilaCompleted,
      LAWYER_CLIENT_CONFIRMATION: m.ilaCompleted,
    };
    return byStatus[s] ? new Date(byStatus[s] as Date) : new Date(c.updatedAt || c.createdAt);
  }

  // ── Filter options (dropdowns) ──

  async options() {
    const [cms, firms, staff] = await Promise.all([
      this.userModel
        .find({ role: 'case_manager' })
        .select('firstName middleName lastName email active')
        .sort({ firstName: 1 })
        .lean(),
      this.companyModel.find({}).select('name').sort({ name: 1 }).lean(),
      this.userModel
        .find({ role: { $in: ['superadmin', 'admin', 'case_manager', 'lawyer'] } })
        .select('firstName middleName lastName email role')
        .sort({ role: 1, firstName: 1 })
        .lean(),
    ]);
    return {
      caseManagers: cms.map((u: any) => ({ id: String(u._id), name: userDisplayName(u), email: u.email, active: u.active !== false })),
      firms: firms.map((c: any) => ({ id: String(c._id), name: c.name })),
      staff: staff.map((u: any) => ({ id: String(u._id), name: userDisplayName(u), email: u.email, role: u.role })),
      statuses: WORKFLOW_ORDER.map((s) => ({ value: s, label: workflowLabel(s) })),
      serviceTypes: Object.entries(SERVICE_GROUP_LABELS).map(([value, label]) => ({ value, label })),
    };
  }

  // ── 1 & 2. Total cases and status / progress ──

  async statusSummary(f: ReportFilters) {
    const rows = await this.caseModel.aggregate([
      { $match: await this.caseMatch(f) },
      { $group: { _id: '$workflowStatus', count: { $sum: 1 } } },
    ]);
    const counts = new Map(rows.map((r) => [r._id ?? 'NOT_PAID', r.count]));
    const total = rows.reduce((s, r) => s + r.count, 0);
    const statuses = f.statuses.length ? WORKFLOW_ORDER.filter((s) => f.statuses.includes(s)) : WORKFLOW_ORDER;
    return {
      total,
      rows: statuses.map((s) => {
        const count = counts.get(s) ?? 0;
        return { status: s, label: workflowLabel(s), count, percent: total ? round1((count / total) * 100) : 0 };
      }),
      active: statuses.filter((s) => !TERMINAL.includes(s)).reduce((n, s) => n + (counts.get(s) ?? 0), 0),
    };
  }

  // ── 3. Case manager workload ──

  async caseManagerWorkload(f: ReportFilters) {
    const [cases, cms] = await Promise.all([
      this.loadCases(f),
      this.userModel.find({ role: 'case_manager' }).select('firstName middleName lastName email active').lean(),
    ]);
    const rows = new Map<string, any>();
    for (const u of cms as any[]) {
      if (f.caseManagerId && f.caseManagerId !== String(u._id)) continue;
      rows.set(String(u._id), {
        id: String(u._id),
        name: userDisplayName(u),
        email: u.email,
        active: u.active !== false,
        assigned: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
      });
    }
    let unassigned = 0;
    for (const c of cases as any[]) {
      if (!c.assignedCaseManager) {
        if (SUBMITTED_OR_LATER.includes(c.workflowStatus) && !DONE.includes(c.workflowStatus)) unassigned++;
        continue;
      }
      const r = rows.get(String(c.assignedCaseManager));
      if (!r) continue;
      r.assigned++;
      if (DONE.includes(c.workflowStatus)) r.completed++;
      else if (c.workflowStatus === 'CANCELLED') r.cancelled++;
      else r.inProgress++;
    }
    return {
      rows: [...rows.values()].sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name)),
      unassignedInProgress: unassigned,
    };
  }

  // ── 4 & 5. Law firm and individual lawyer workload ──

  private async lawyerDirectory() {
    const [lawyers, firms] = await Promise.all([
      this.lawyerModel.find({}).select('name firstName lastName email company status').lean(),
      this.companyModel.find({}).select('name').lean(),
    ]);
    const firmName = new Map(firms.map((c: any) => [String(c._id), c.name]));
    return { lawyers: lawyers as any[], firms: firms as any[], firmName };
  }

  async firmWorkload(f: ReportFilters) {
    const [cases, dir] = await Promise.all([this.loadCases(f), this.lawyerDirectory()]);
    const firmOfLawyer = new Map(dir.lawyers.map((l) => [String(l._id), l.company ? String(l.company) : null]));
    const rows = new Map<string, any>();
    for (const c of dir.firms) {
      if (f.firmId && f.firmId !== String(c._id)) continue;
      rows.set(String(c._id), { id: String(c._id), name: c.name, assigned: 0, completed: 0, pending: 0, cancelled: 0 });
    }
    for (const c of cases as any[]) {
      // A case counts once per firm, even when both solicitors are from it.
      const firms = new Set(
        [c.assignedLawyerP1, c.assignedLawyerP2]
          .filter(Boolean)
          .map((id) => firmOfLawyer.get(String(id)))
          .filter(Boolean) as string[],
      );
      for (const fid of firms) {
        const r = rows.get(fid);
        if (!r) continue;
        r.assigned++;
        if (c.workflowStatus === 'CANCELLED') r.cancelled++;
        else if (LAWYER_DONE.includes(c.workflowStatus)) r.completed++;
        else r.pending++;
      }
    }
    return { rows: [...rows.values()].sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name)) };
  }

  async lawyerWorkload(f: ReportFilters) {
    const [cases, dir] = await Promise.all([this.loadCases(f), this.lawyerDirectory()]);
    const rows = new Map<string, any>();
    for (const l of dir.lawyers) {
      const firmId = l.company ? String(l.company) : null;
      if (f.firmId && f.firmId !== firmId) continue;
      rows.set(String(l._id), {
        id: String(l._id),
        name: l.name || userDisplayName(l),
        email: l.email ?? null,
        firm: firmId ? dir.firmName.get(firmId) ?? '—' : '—',
        firmId,
        assigned: 0,
        completed: 0,
        pending: 0,
        cancelled: 0,
      });
    }
    for (const c of cases as any[]) {
      for (const [lawyerId, signed] of [
        [c.assignedLawyerP1, c.p1LawyerSigned],
        [c.assignedLawyerP2, c.p2LawyerSigned],
      ] as const) {
        if (!lawyerId) continue;
        const r = rows.get(String(lawyerId));
        if (!r) continue;
        r.assigned++;
        if (c.workflowStatus === 'CANCELLED') r.cancelled++;
        else if (signed || LAWYER_DONE.includes(c.workflowStatus)) r.completed++;
        else r.pending++;
      }
    }
    return {
      rows: [...rows.values()]
        .filter((r) => r.assigned > 0 || !f.raw.activeOnly)
        .sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name)),
    };
  }

  // ── 6. Conversion funnel ──

  async funnel(f: ReportFilters) {
    // Set-aside cases (the owner joined their partner's case) would count the
    // couple twice, so they are left out.
    const cases = (await this.loadCases(f, { ignoreStatus: true })).filter((c: any) => !c.abandonedAt);
    const after = (c: any, s: string) =>
      c.workflowStatus !== 'CANCELLED' && WORKFLOW_ORDER.indexOf(c.workflowStatus) >= WORKFLOW_ORDER.indexOf(s);
    const steps = [
      { key: 'registered', label: 'Registered', test: () => true },
      {
        key: 'serviceSelected',
        label: 'Service selected',
        test: (c: any) => (c.agreementType && c.agreementType !== 'help-choose') || isPaid(c) || after(c, 'DRAFT'),
      },
      { key: 'paymentCompleted', label: 'Payment completed', test: (c: any) => isPaid(c) || after(c, 'DRAFT') },
      {
        key: 'questionnairesCompleted',
        label: 'Both questionnaires completed',
        test: (c: any) =>
          (c.status?.myInformation?.submitted && c.status?.partnerInformation?.submitted) ||
          after(c, 'COUPLE_SUBMITTED'),
      },
      {
        key: 'coupleSubmitted',
        label: 'Couple submitted',
        test: (c: any) => after(c, 'COUPLE_SUBMITTED') || !!c.approval?.mutualApprovalCompletedAt,
      },
      { key: 'completed', label: 'Completed', test: (c: any) => DONE.includes(c.workflowStatus) || !!c.completedAt },
    ];
    const total = cases.length;
    let prev = total;
    return {
      total,
      steps: steps.map((s) => {
        const count = cases.filter(s.test).length;
        const row = {
          key: s.key,
          label: s.label,
          count,
          percentOfRegistered: total ? round1((count / total) * 100) : 0,
          percentOfPrevious: prev ? round1((count / prev) * 100) : 0,
          dropOff: Math.max(prev - count, 0),
        };
        prev = count;
        return row;
      }),
    };
  }

  // ── 7. Processing time ──

  async processingTime(f: ReportFilters) {
    const cases = await this.loadCases(f);
    const history = await this.firstEntries(cases.map((c: any) => c._id));
    const segments = [
      ['registered', 'paid', 'Registration → Payment'],
      ['paid', 'coupleSubmitted', 'Payment → Couple submission'],
      ['coupleSubmitted', 'cmApproved', 'Couple submission → CM approval'],
      ['cmApproved', 'preLawyerCompleted', 'CM approval → Pre-lawyer questionnaire completed'],
      ['preLawyerCompleted', 'lawyersAssigned', 'Pre-lawyer completed → Lawyer assignment'],
      ['lawyersAssigned', 'lawyerReviewCompleted', 'Lawyer assignment → Lawyer review completed'],
      ['lawyerReviewCompleted', 'ilaCompleted', 'Lawyer review completed → ILA completed'],
      ['ilaCompleted', 'completed', 'ILA completed → Final completion'],
      ['registered', 'completed', 'Total: Registration → Completion'],
    ] as const;
    const samples = segments.map(() => [] as number[]);
    for (const c of cases as any[]) {
      const m = this.milestones(c, history.get(String(c._id)));
      segments.forEach(([a, b], i) => {
        const d = daysBetween(m[a], m[b]);
        if (d !== null && d >= 0) samples[i].push(d);
      });
    }
    return {
      rows: segments.map(([from, to, label], i) => {
        const xs = samples[i].sort((x, y) => x - y);
        const n = xs.length;
        return {
          from,
          to,
          label,
          cases: n,
          averageDays: n ? round1(xs.reduce((s, x) => s + x, 0) / n) : null,
          medianDays: n ? round1(n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2) : null,
          minDays: n ? round1(xs[0]) : null,
          maxDays: n ? round1(xs[n - 1]) : null,
          total: i === segments.length - 1,
        };
      }),
    };
  }

  // ── 8. Pending / overdue ──

  async pendingOverdue(f: ReportFilters) {
    const all = (await this.loadCases(f)).filter((c: any) => !TERMINAL.includes(c.workflowStatus));
    const history = await this.firstEntries(all.map((c: any) => c._id));
    const now = new Date();

    const userIds = new Set<string>();
    const lawyerIds = new Set<string>();
    for (const c of all as any[]) {
      [c.owner, c.invitedUser, c.assignedCaseManager].filter(Boolean).forEach((id) => userIds.add(String(id)));
      [c.assignedLawyerP1, c.assignedLawyerP2].filter(Boolean).forEach((id) => lawyerIds.add(String(id)));
    }
    const [users, lawyers, dir] = await Promise.all([
      this.userModel.find({ _id: { $in: [...userIds] } }).select('firstName middleName lastName email').lean(),
      this.lawyerModel.find({ _id: { $in: [...lawyerIds] } }).select('name firstName lastName company').lean(),
      this.companyModel.find({}).select('name').lean(),
    ]);
    const firmName = new Map(dir.map((c: any) => [String(c._id), c.name]));
    const userName = new Map(users.map((u: any) => [String(u._id), userDisplayName(u)]));
    const lawyerName = new Map(
      lawyers.map((l: any) => [
        String(l._id),
        `${l.name || userDisplayName(l)}${l.company && firmName.get(String(l.company)) ? ` (${firmName.get(String(l.company))})` : ''}`,
      ]),
    );
    const nameOf = (m: Map<string, string>, id: any) => (id ? m.get(String(id)) ?? 'Unknown' : null);

    let rows = (all as any[]).map((c) => {
      const entered = this.enteredCurrent(c, history.get(String(c._id)));
      const days = Math.max(0, Math.floor((now.getTime() - entered.getTime()) / 86400000));
      const sla = slaDays(c.workflowStatus);
      const cm = nameOf(userName, c.assignedCaseManager);
      const p1 = nameOf(lawyerName, c.assignedLawyerP1);
      const p2 = nameOf(lawyerName, c.assignedLawyerP2);
      const applicants = [nameOf(userName, c.owner), nameOf(userName, c.invitedUser)].filter(Boolean).join(' & ');
      const lawyersText = [p1, p2].filter(Boolean).join(' / ') || 'Lawyers (not assigned)';
      const responsible: Record<string, string> = {
        NOT_PAID: `Applicant: ${nameOf(userName, c.owner) ?? '—'}`,
        DRAFT: `Applicants: ${applicants || '—'}`,
        COUPLE_SUBMITTED: `Case Manager: ${cm ?? 'Unassigned'}`,
        CM_APPROVED: `Applicants: ${applicants || '—'} (pre-lawyer questionnaire)`,
        PRE_LAWYER_PENDING: `Applicants: ${applicants || '—'} (pre-lawyer questionnaire)`,
        PRE_LAWYER_COMPLETED: `Case Manager: ${cm ?? 'Unassigned'} (assign lawyers)`,
        LAWYERS_ASSIGNED: `Lawyers: ${lawyersText}`,
        LAWYER_REVIEW: `Lawyers: ${lawyersText}`,
        LAWYER_REVIEW_COMPLETED: `Lawyers: ${lawyersText} (ILA)`,
        LAWYER_ILA_PENDING: `Lawyers: ${lawyersText} (ILA)`,
        LAWYER_SIGNOFF_COMPLETE: `Case Manager: ${cm ?? 'Unassigned'}`,
        LAWYER_CLIENT_CONFIRMATION: `Applicants: ${applicants || '—'} (final confirmation)`,
      };
      return {
        caseId: String(c._id),
        caseNumber: c.caseNumber ?? String(c._id),
        currentStage: STAGE_OF[c.workflowStatus] ?? workflowLabel(c.workflowStatus),
        currentStatus: workflowLabel(c.workflowStatus),
        status: c.workflowStatus,
        service: SERVICE_GROUP_LABELS[serviceGroupOf(c.agreementType)],
        assignedCaseManager: cm ?? 'Unassigned',
        applicant1Solicitor: p1 ?? '—',
        applicant2Solicitor: p2 ?? '—',
        responsibleParty: responsible[c.workflowStatus] ?? '—',
        enteredStageAt: entered,
        daysInStage: days,
        slaDays: sla,
        overdue: days > sla,
        overdueStatus: days > sla ? 'Overdue' : 'On Track',
        daysOverdue: Math.max(days - sla, 0),
      };
    });

    const overdueCount = rows.filter((r) => r.overdue).length;
    const view = String(f.raw.overdue || 'all');
    if (view === 'overdue') rows = rows.filter((r) => r.overdue);
    if (view === 'on_track') rows = rows.filter((r) => !r.overdue);
    rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.daysOverdue - a.daysOverdue || b.daysInStage - a.daysInStage);
    const total = rows.length;
    const start = (f.page - 1) * f.pageSize;
    return {
      ...paged(rows.slice(start, start + f.pageSize), total, f),
      summary: { pending: all.length, overdue: overdueCount, onTrack: all.length - overdueCount },
      slaDays: Object.fromEntries(Object.keys(DEFAULT_SLA_DAYS).map((s) => [s, slaDays(s)])),
    };
  }
}
