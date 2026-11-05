import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RequestContext, userDisplayName } from '../common/request-context';
import {
  ActivityCategory,
  SecurityEvent,
  SecurityEventDocument,
  SecurityEventKind,
} from './schemas/tracking.schemas';

type EventInput = Partial<Omit<SecurityEvent, 'userId' | 'caseId'>> & {
  kind: SecurityEventKind;
  userId?: string | Types.ObjectId | null;
  caseId?: string | Types.ObjectId | null;
};

const TEN_MINUTES = 10 * 60 * 1000;

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);
  // Short-lived de-duplication of repeated reads (one page load calls several
  // endpoints for the same record).
  private readonly recent = new Map<string, number>();
  private readonly caseInfo = new Map<string, { at: number; caseNumber: string | null; applicant: string }>();

  constructor(
    @InjectModel(SecurityEvent.name)
    private readonly model: Model<SecurityEventDocument>,
  ) {}

  private seenRecently(key: string, windowMs: number): boolean {
    const now = Date.now();
    const last = this.recent.get(key);
    if (last && now - last < windowMs) return true;
    this.recent.set(key, now);
    if (this.recent.size > 20000) {
      for (const [k, t] of this.recent) if (now - t > windowMs) this.recent.delete(k);
    }
    return false;
  }

  async record(input: EventInput, dedupeKey?: string, windowMs = TEN_MINUTES) {
    if (dedupeKey && this.seenRecently(dedupeKey, windowMs)) return;
    const ctx = RequestContext.get();
    const toId = (v: any) =>
      v && Types.ObjectId.isValid(String(v)) ? new Types.ObjectId(String(v)) : null;
    try {
      await this.model.create({
        ipAddress: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        ...input,
        userId: toId(input.userId),
        caseId: toId(input.caseId),
      });
    } catch (err) {
      this.logger.error(`Security event not recorded (${input.kind})`, err instanceof Error ? err.stack : String(err));
    }
  }

  // Case number and applicant names for sensitive-access rows, cached briefly.
  async describeCase(caseId: string): Promise<{ caseNumber: string | null; applicant: string }> {
    const hit = this.caseInfo.get(caseId);
    if (hit && Date.now() - hit.at < TEN_MINUTES) return hit;
    try {
      const c: any = await this.model.db
        .model('Case')
        .findById(caseId)
        .select('caseNumber owner invitedUser')
        .populate('owner invitedUser', 'firstName middleName lastName email')
        .lean();
      const applicant = [c?.owner, c?.invitedUser].filter(Boolean).map(userDisplayName).join(' & ');
      const info = { at: Date.now(), caseNumber: c?.caseNumber ?? null, applicant };
      this.caseInfo.set(caseId, info);
      return info;
    } catch {
      return { caseNumber: null, applicant: '' };
    }
  }

  // ── Logins ──

  async loginSucceeded(user: any) {
    await this.record({
      kind: SecurityEventKind.LOGIN,
      category: ActivityCategory.LOGIN,
      result: 'SUCCESS',
      userId: user?._id ?? user?.id,
      userName: userDisplayName(user),
      email: user?.email,
      role: user?.role,
      activity: 'Logged in',
    });
  }

  async loginFailed(email: string, reason: string, user?: any) {
    await this.record({
      kind: SecurityEventKind.LOGIN,
      category: ActivityCategory.LOGIN,
      result: 'FAILED',
      reason,
      userId: user?._id ?? null,
      userName: user ? userDisplayName(user) : null,
      email: (email || '').trim().toLowerCase() || null,
      role: user?.role ?? null,
      activity: 'Login failed',
      attemptType: 'Failed Login',
      target: '/auth/login',
    });
  }
}
