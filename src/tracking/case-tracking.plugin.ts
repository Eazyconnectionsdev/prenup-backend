// Records every change to a case's workflow status, payment status, case
// manager and solicitors, wherever in the code it happens, through both
// document saves and update queries. Each record names the real actor from the
// request context, or "System" when nothing is acting on a user's behalf.
//
// Recording never blocks or fails the change itself: errors are logged and
// swallowed.

import { Logger } from '@nestjs/common';
import { Connection, Schema, Types } from 'mongoose';
import {
  currentActor,
  RequestContext,
  TrackedChange,
  userDisplayName,
} from '../common/request-context';
import { describeActivity } from './activity-routes';
import { paymentLabel, workflowLabel } from './labels';

const logger = new Logger('CaseTracking');

const TRACKED = [
  'workflowStatus',
  'paymentStatus',
  'assignedCaseManager',
  'assignedLawyerP1',
  'assignedLawyerP2',
] as const;
type Snapshot = Record<(typeof TRACKED)[number], string | null>;

// Extra fields read alongside, to explain a change.
const CONTEXT_FIELDS = 'caseNumber cmReturnReason abandonedReason paidAt paymentCompleted';

const idOf = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Types.ObjectId) return v.toString();
  if (typeof v === 'object' && v._id) return String(v._id);
  return String(v);
};

function snapshot(d: any): Snapshot {
  return {
    workflowStatus: d?.workflowStatus ?? null,
    paymentStatus: d?.paymentStatus ?? null,
    assignedCaseManager: idOf(d?.assignedCaseManager),
    assignedLawyerP1: idOf(d?.assignedLawyerP1),
    assignedLawyerP2: idOf(d?.assignedLawyerP2),
  };
}

const PAID = ['COMPLETED', 'PARTIALLY_REFUNDED'];

// Stored as real ObjectIds so reports can match and join on them.
const oid = (v: string | null | undefined) =>
  v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null;

function statusComment(field: string, to: string | null, caseDoc: any): string | null {
  const ctx = RequestContext.get();
  if (ctx?.statusReason) return ctx.statusReason;
  if (field === 'workflowStatus') {
    if (to === 'DRAFT' && caseDoc?.cmReturnReason) {
      return `Returned to draft: ${caseDoc.cmReturnReason}`;
    }
    if (to === 'CANCELLED' && caseDoc?.abandonedReason) return caseDoc.abandonedReason;
  }
  if (ctx?.method && ctx.path) {
    const a = describeActivity(ctx.method, ctx.path);
    if (a) return a.label;
  }
  return ctx?.user ? null : 'Automatic update';
}

async function nameFor(db: Connection, kind: string, id: string | null) {
  if (!id || !Types.ObjectId.isValid(id)) return null;
  try {
    if (kind === 'CASE_MANAGER') {
      const u = await db
        .model('User')
        .findById(id)
        .select('firstName middleName lastName email')
        .lean();
      return u ? userDisplayName(u) : null;
    }
    const l: any = await db.model('Lawyer').findById(id).select('name firstName lastName').lean();
    return l ? l.name || userDisplayName(l) : null;
  } catch {
    return null;
  }
}

function assignmentReason(kind: string, prev: string | null, next: string | null, actorId: string | null) {
  const ctx = RequestContext.get();
  if (ctx?.assignmentReason) return ctx.assignmentReason;
  if (!next) return 'Unassigned';
  if (kind === 'CASE_MANAGER' && actorId && actorId === next) return 'Self-allocation';
  if (!prev) return 'Initial allocation';
  return kind === 'CASE_MANAGER' ? 'Workload redistribution' : 'Reassignment';
}

async function record(db: Connection, caseDoc: any, prev: Snapshot, next: Snapshot) {
  const actor = currentActor();
  const ctx = RequestContext.get();
  const caseId = idOf(caseDoc._id)!;
  const caseNumber = caseDoc.caseNumber ?? null;

  const statusRows: any[] = [];
  const assignmentRows: any[] = [];
  const changes: TrackedChange[] = [];

  for (const field of ['workflowStatus', 'paymentStatus'] as const) {
    if (prev[field] === next[field]) continue;
    statusRows.push({
      caseId: oid(caseId),
      caseNumber,
      field,
      from: prev[field],
      to: next[field],
      actorId: oid(actor.actorId),
      actorName: actor.actorName,
      actorRole: actor.actorRole,
      comments: statusComment(field, next[field], caseDoc),
      ipAddress: actor.ip ?? null,
    });
    const label = field === 'workflowStatus' ? workflowLabel : paymentLabel;
    changes.push({
      kind: field === 'workflowStatus' ? 'STATUS' : 'PAYMENT_STATUS',
      caseId,
      caseNumber,
      field,
      from: prev[field],
      to: next[field],
      fromLabel: label(prev[field]),
      toLabel: label(next[field]),
    });
  }

  const ASSIGN: [keyof Snapshot, string][] = [
    ['assignedCaseManager', 'CASE_MANAGER'],
    ['assignedLawyerP1', 'LAWYER_P1'],
    ['assignedLawyerP2', 'LAWYER_P2'],
  ];
  for (const [field, kind] of ASSIGN) {
    if (prev[field] === next[field]) continue;
    const [previousName, newName] = await Promise.all([
      nameFor(db, kind, prev[field]),
      nameFor(db, kind, next[field]),
    ]);
    assignmentRows.push({
      caseId: oid(caseId),
      caseNumber,
      kind,
      previousId: oid(prev[field]),
      previousName,
      newId: oid(next[field]),
      newName,
      performedById: oid(actor.actorId),
      performedByName: actor.actorName,
      performedByRole: actor.actorRole,
      reason: assignmentReason(kind, prev[field], next[field], actor.actorId),
      ipAddress: actor.ip ?? null,
    });
    changes.push({
      kind: 'ASSIGNMENT',
      caseId,
      caseNumber,
      field: kind,
      from: prev[field],
      to: next[field],
      fromLabel: previousName || (prev[field] ? 'Unknown' : 'Unassigned'),
      toLabel: newName || (next[field] ? 'Unknown' : 'Unassigned'),
    });
  }

  ctx?.changes.push(...changes);

  try {
    if (statusRows.length) await db.model('CaseStatusHistory').insertMany(statusRows);
    if (assignmentRows.length) await db.model('CaseAssignmentHistory').insertMany(assignmentRows);
  } catch (err) {
    logger.error(`Could not record case history for ${caseId}`, err instanceof Error ? err.stack : String(err));
  }
}

const touchesTracked = (update: any): boolean => {
  if (!update || Array.isArray(update)) return !!update;
  const keys = new Set<string>([
    ...Object.keys(update),
    ...Object.keys(update.$set || {}),
    ...Object.keys(update.$unset || {}),
  ]);
  return TRACKED.some((f) => keys.has(f));
};

export function caseTrackingPlugin(schema: Schema) {
  schema.post('init', function (doc: any) {
    doc.$locals.trackedPrev = snapshot(doc);
  });

  schema.pre('save', function (this: any) {
    // The date a case was first paid, for the processing-time report.
    // Only when the payment state changes now, so re-saving an older paid
    // case does not stamp today's date on it.
    if (
      !this.paidAt &&
      !this.isNew &&
      (this.isModified('paymentStatus') || this.isModified('paymentCompleted')) &&
      (PAID.includes(this.paymentStatus) || this.paymentCompleted === true)
    ) {
      this.paidAt = new Date();
    }
  });

  schema.post('save', async function (doc: any) {
    const prev: Snapshot | undefined = doc.$locals.trackedPrev;
    const next = snapshot(doc);
    doc.$locals.trackedPrev = next;
    if (!prev) return; // a new case: nothing has changed yet
    try {
      await record(doc.db, doc, prev, next);
    } catch (err) {
      logger.error('Case tracking failed', err instanceof Error ? err.stack : String(err));
    }
  });

  const QUERY_OPS = ['updateOne', 'updateMany', 'findOneAndUpdate'] as const;

  schema.pre(QUERY_OPS as any, async function (this: any) {
    try {
      if (!touchesTracked(this.getUpdate())) return;
      this._trackedPrev = await this.model
        .find(this.getFilter())
        .select(`${TRACKED.join(' ')} ${CONTEXT_FIELDS}`)
        .limit(500)
        .lean();
    } catch (err) {
      logger.error('Case tracking (pre-update) failed', err instanceof Error ? err.stack : String(err));
    }
  });

  schema.post(QUERY_OPS as any, async function (this: any) {
    const before: any[] | undefined = this._trackedPrev;
    if (!before?.length) return;
    try {
      const after: any[] = await this.model
        .find({ _id: { $in: before.map((d) => d._id) } })
        .select(`${TRACKED.join(' ')} ${CONTEXT_FIELDS}`)
        .lean();
      const byId = new Map(after.map((d) => [String(d._id), d]));
      for (const b of before) {
        const a = byId.get(String(b._id));
        if (!a) continue;
        await record(this.model.db, a, snapshot(b), snapshot(a));
        const wasPaid = PAID.includes(b.paymentStatus) || b.paymentCompleted === true;
        const isPaid = PAID.includes(a.paymentStatus) || a.paymentCompleted === true;
        if (!a.paidAt && !wasPaid && isPaid) {
          await this.model.collection.updateOne({ _id: a._id }, { $set: { paidAt: new Date() } });
        }
      }
    } catch (err) {
      logger.error('Case tracking (post-update) failed', err instanceof Error ? err.stack : String(err));
    }
  });
}
