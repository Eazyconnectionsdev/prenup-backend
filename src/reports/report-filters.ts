// Shared report filters, parsed from the query string. Date presets are
// resolved on the server in UK time so "Today" and "This Month" mean the same
// thing for everyone.

import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SERVICE_GROUP_TYPES, ServiceGroup, WORKFLOW_ORDER } from '../tracking/labels';

const TZ = 'Europe/London';

export type ReportFilters = {
  range: string;
  from: Date | null;
  to: Date | null; // exclusive
  serviceGroups: ServiceGroup[];
  statuses: string[];
  caseManagerId: string | null; // 'unassigned' or an id
  firmId: string | null;
  caseQuery: string | null;
  role: string | null;
  userId: string | null;
  userQuery: string | null;
  activityType: string | null;
  paymentStatus: string | null;
  transactionType: string | null;
  page: number;
  pageSize: number;
  raw: Record<string, any>;
};

// Milliseconds London is ahead of UTC at a given instant.
function londonOffset(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// Midnight in London on a calendar date (month 1-12; day/month may overflow).
export function londonMidnight(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  const first = new Date(guess - londonOffset(new Date(guess)));
  // Re-check across a clock change.
  return new Date(guess - londonOffset(first));
}

function londonToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

const parseDay = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) throw new BadRequestException('Dates must be YYYY-MM-DD');
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
};

export function resolveRange(range: string, from?: string, to?: string): { from: Date | null; to: Date | null } {
  const { y, m, d } = londonToday();
  const tomorrow = londonMidnight(y, m, d + 1);
  switch (range) {
    case 'today':
      return { from: londonMidnight(y, m, d), to: tomorrow };
    case 'last_7_days':
      return { from: londonMidnight(y, m, d - 6), to: tomorrow };
    case 'last_30_days':
      return { from: londonMidnight(y, m, d - 29), to: tomorrow };
    case 'last_90_days':
      return { from: londonMidnight(y, m, d - 89), to: tomorrow };
    case 'this_month':
      return { from: londonMidnight(y, m, 1), to: londonMidnight(y, m + 1, 1) };
    case 'last_month':
      return { from: londonMidnight(y, m - 1, 1), to: londonMidnight(y, m, 1) };
    case 'this_year':
      return { from: londonMidnight(y, 1, 1), to: londonMidnight(y + 1, 1, 1) };
    case 'custom': {
      const a = from ? parseDay(from) : null;
      const b = to ? parseDay(to) : null;
      const f = a ? londonMidnight(a.y, a.m, a.d) : null;
      const t = b ? londonMidnight(b.y, b.m, b.d + 1) : null;
      if (f && t && f >= t) throw new BadRequestException('The start date must be before the end date');
      return { from: f, to: t };
    }
    default:
      return { from: null, to: null };
  }
}

const list = (v: any): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((s) => String(s).trim())
    .filter((s) => s && s.toUpperCase() !== 'ALL');

const idOrNull = (v: any) => (typeof v === 'string' && Types.ObjectId.isValid(v) ? v : null);

export function parseFilters(q: Record<string, any>, opts: { maxPageSize?: number } = {}): ReportFilters {
  const range = String(q.range || 'all');
  const { from, to } = resolveRange(range, q.from, q.to);
  const serviceGroups = list(q.service)
    .map((s) => s.toUpperCase())
    .filter((s): s is ServiceGroup => s in SERVICE_GROUP_TYPES);
  const statuses = list(q.status)
    .map((s) => s.toUpperCase())
    .filter((s) => WORKFLOW_ORDER.includes(s));
  const max = opts.maxPageSize ?? 10000;
  const pageSize = Math.min(Math.max(Number(q.pageSize) || 25, 1), max);
  return {
    range,
    from,
    to,
    serviceGroups,
    statuses,
    caseManagerId: q.caseManager === 'unassigned' ? 'unassigned' : idOrNull(q.caseManager),
    firmId: idOrNull(q.firm),
    caseQuery: typeof q.caseId === 'string' && q.caseId.trim() ? q.caseId.trim().slice(0, 64) : null,
    role: typeof q.role === 'string' && q.role !== 'all' ? q.role : null,
    userId: idOrNull(q.user),
    userQuery: typeof q.userQuery === 'string' && q.userQuery.trim() ? q.userQuery.trim().slice(0, 100) : null,
    activityType: typeof q.activityType === 'string' && q.activityType !== 'all' ? q.activityType.toUpperCase() : null,
    paymentStatus: typeof q.paymentStatus === 'string' && q.paymentStatus !== 'all' ? q.paymentStatus.toUpperCase() : null,
    transactionType:
      typeof q.transactionType === 'string' && q.transactionType !== 'all' ? q.transactionType.toUpperCase() : null,
    page: Math.max(Number(q.page) || 1, 1),
    pageSize,
    raw: q,
  };
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function dateMatch(f: ReportFilters, field: string) {
  if (!f.from && !f.to) return {};
  const cond: any = {};
  if (f.from) cond.$gte = f.from;
  if (f.to) cond.$lt = f.to;
  return { [field]: cond };
}

export function serviceTypes(f: ReportFilters): (string | null)[] | null {
  if (!f.serviceGroups.length) return null;
  return f.serviceGroups.flatMap((g) => SERVICE_GROUP_TYPES[g]);
}

// Raw account roles a report role filter stands for.
export function rolesFor(role: string | null): string[] | null {
  switch (role) {
    case 'admin':
      return ['admin', 'superadmin'];
    case 'case_manager':
      return ['case_manager'];
    case 'lawyer':
      return ['lawyer'];
    case 'end_user':
    case 'applicant':
      return ['end_user'];
    default:
      return null;
  }
}

export const ACTOR_ROLE_FOR: Record<string, string> = {
  admin: 'Admin',
  case_manager: 'Case Manager',
  lawyer: 'Lawyer',
  end_user: 'Applicant',
  applicant: 'Applicant',
  system: 'System',
};

export const paged = <T>(rows: T[], total: number, f: ReportFilters) => ({
  rows,
  total,
  page: f.page,
  pageSize: f.pageSize,
});

export const daysBetween = (a: Date | null | undefined, b: Date | null | undefined) =>
  a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 86400000 : null;

export const round1 = (n: number) => Math.round(n * 10) / 10;
