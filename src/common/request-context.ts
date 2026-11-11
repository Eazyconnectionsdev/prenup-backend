// Per-request context (who is acting, from where) carried through async
// calls, so Mongoose hooks and loggers deep in the stack can record the real
// actor without every service passing it along. Anything that runs outside a
// request (startup, scheduled work, webhooks) has no user and is recorded as
// "System".

import { AsyncLocalStorage } from 'node:async_hooks';

export type ContextUser = {
  id: string;
  role?: string;
  email?: string;
  name?: string;
};

export type TrackedChange = {
  kind: 'STATUS' | 'PAYMENT_STATUS' | 'ASSIGNMENT';
  caseId: string;
  caseNumber?: string | null;
  field: string;
  from: string | null;
  to: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
};

export type RequestContextStore = {
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  user?: ContextUser;
  // Set when the request comes from a payment provider, so changes it causes
  // are recorded as System rather than as an anonymous user.
  system?: boolean;
  // Optional explanations a controller can attach before saving.
  statusReason?: string;
  assignmentReason?: string;
  // Changes recorded by the case hooks during this request, picked up by the
  // activity logger so a staff action shows its previous and new values.
  changes: TrackedChange[];
};

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  get(): RequestContextStore | undefined {
    return storage.getStore();
  },
  setUser(user: ContextUser | undefined) {
    const s = storage.getStore();
    if (s && user) s.user = user;
  },
  set<K extends keyof RequestContextStore>(key: K, value: RequestContextStore[K]) {
    const s = storage.getStore();
    if (s) s[key] = value;
  },
};

// Express middleware: opens a context for every request.
export function requestContextMiddleware(req: any, _res: any, next: () => void) {
  const forwarded = (req.headers?.['x-forwarded-for'] as string | undefined)
    ?.split(',')[0]
    ?.trim();
  RequestContext.run(
    {
      ip: req.ip || forwarded || req.socket?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
      method: req.method,
      path: (req.originalUrl || req.url || '').split('?')[0],
      changes: [],
    },
    next,
  );
}

// Display role used across the audit reports.
export type ActorRole = 'Admin' | 'Case Manager' | 'Lawyer' | 'Applicant' | 'System';

export function toActorRole(role?: string | null): ActorRole {
  switch (role) {
    case 'superadmin':
    case 'admin':
      return 'Admin';
    case 'case_manager':
      return 'Case Manager';
    case 'lawyer':
      return 'Lawyer';
    case 'end_user':
      return 'Applicant';
    default:
      return 'System';
  }
}

export const STAFF_ROLES = ['superadmin', 'admin', 'case_manager', 'lawyer'];

export function isStaffRole(role?: string | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function userDisplayName(u: any): string {
  if (!u) return '';
  if (u.name) return String(u.name);
  const parts = [u.firstName, u.middleName, u.lastName].filter(Boolean);
  return parts.length ? parts.join(' ') : u.email || '';
}

// The current actor for audit records.
export function currentActor(): {
  actorId: string | null;
  actorName: string;
  actorRole: ActorRole;
  ip?: string;
} {
  const s = RequestContext.get();
  if (!s || s.system || !s.user) {
    return { actorId: null, actorName: 'System', actorRole: 'System', ip: s?.ip };
  }
  return {
    actorId: s.user.id,
    actorName: s.user.name || s.user.email || 'Unknown user',
    actorRole: toActorRole(s.user.role),
    ip: s.ip,
  };
}
