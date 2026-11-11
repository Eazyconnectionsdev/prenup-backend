// Maps API routes to the audit vocabulary: which requests are page/record
// access, which touch sensitive case information, and what a staff action is
// called in the activity log.

import { ActivityCategory } from './schemas/tracking.schemas';

const OID = '([0-9a-fA-F]{24})';

export const stripPrefix = (path: string) => {
  const prefix = '/' + (process.env.GLOBAL_PREFIX || 'api');
  return path.startsWith(prefix + '/') ? path.slice(prefix.length) : path;
};

// Case id in a route, if any.
export function caseIdFromPath(path: string): string | null {
  const p = stripPrefix(path);
  const m =
    p.match(new RegExp(`^/cases/${OID}`)) ||
    p.match(new RegExp(`^/case-manager/${OID}`)) ||
    p.match(new RegExp(`^/lawyer/${OID}`)) ||
    p.match(new RegExp(`^/admin/cases/${OID}`)) ||
    p.match(new RegExp(`^/agreement/${OID}`));
  return m ? m[1] : null;
}

// Routes never logged as activity or access (handled elsewhere or noise).
const IGNORED = [
  /^\/auth\//,
  /^\/payments\/stripe\/webhook/,
  /^\/admin\/reports\//,
  /^\/docs/,
];

export const isIgnored = (path: string) =>
  IGNORED.some((r) => r.test(stripPrefix(path)));

// ── Access (Dashboard / Case Record / User Profile) ──

export function describeAccess(
  method: string,
  path: string,
): { accessType: string; caseId: string | null } | null {
  if (method !== 'GET') return null;
  const p = stripPrefix(path);
  if (
    /^\/(case-manager|lawyer)\/dashboard(\/|$)/.test(p) ||
    /^\/admin\/(dashboard|stats|overview)(\/|$)/.test(p) ||
    p === '/cases'
  ) {
    return { accessType: 'Dashboard', caseId: null };
  }
  const caseId = caseIdFromPath(p);
  if (caseId) return { accessType: 'Case Record', caseId };
  if (
    new RegExp(`^/users/${OID}$`).test(p) ||
    new RegExp(`^/admin/(case-managers|lawyers|users|companies)/${OID}$`).test(p) ||
    new RegExp(`^/lawyer/manage/${OID}$`).test(p)
  ) {
    return { accessType: 'User Profile', caseId: null };
  }
  return null;
}

// ── Sensitive information access (staff only) ──

export function describeSensitive(
  method: string,
  path: string,
): { infoTypes: string[]; action: string } | null {
  const p = stripPrefix(path);
  const caseRoot = new RegExp(`^/(cases|case-manager|lawyer|admin/cases)/${OID}$`);

  if (method === 'GET') {
    if (caseRoot.test(p)) return { infoTypes: ['Personal', 'Financial'], action: 'Viewed' };
    const section = p.match(new RegExp(`^/cases/${OID}/section/([^/]+)$`));
    if (section) {
      return {
        infoTypes: /joint/i.test(section[2]) ? ['Financial'] : ['Personal', 'Financial'],
        action: 'Viewed',
      };
    }
    if (/\/documents\/[^/]+\/download$/.test(p)) {
      return { infoTypes: ['Supporting Docs'], action: 'Downloaded' };
    }
    if (/\/documents$/.test(p)) return { infoTypes: ['Supporting Docs'], action: 'Viewed' };
    if (
      /\/(agreements|versions)(\/|$)/.test(p) ||
      /^\/agreement\/[^/]+\/document\/(all-versions|compare|[^/]+\/detail)$/.test(p)
    ) {
      return { infoTypes: ['Legal Docs'], action: 'Viewed' };
    }
    if (/\/ila-status$/.test(p)) return { infoTypes: ['Legal Docs'], action: 'Viewed' };
    return null;
  }

  if (method === 'POST') {
    if (/\/documents$/.test(p)) return { infoTypes: ['Supporting Docs'], action: 'Uploaded' };
    if (/\/(agreements|versions)$/.test(p) || /\/lawyer\/checkin$/.test(p) || /\/p[12]-ila$/.test(p)) {
      return { infoTypes: ['Legal Docs'], action: 'Uploaded' };
    }
    if (/\/lawyer\/checkout$/.test(p)) return { infoTypes: ['Legal Docs'], action: 'Downloaded' };
  }
  return null;
}

// ── Staff activity labels ──

type Rule = { m: string; r: RegExp; label: string; cat: ActivityCategory; generic?: boolean };
const C = ActivityCategory;
const ID = '[0-9a-fA-F]{24}';

const RULES: Rule[] = [
  { m: 'POST', r: new RegExp(`^/cases/${ID}/assign-case-manager$`), label: 'Assigned case manager', cat: C.ASSIGNMENT },
  { m: 'POST', r: new RegExp(`^/case-manager/${ID}/assign-lawyers$`), label: 'Assigned lawyers', cat: C.ASSIGNMENT },
  { m: 'POST', r: new RegExp(`^/case-manager/${ID}/approve$`), label: 'Approved case', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/case-manager/${ID}/return-draft$`), label: 'Returned case to draft', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/case-manager/${ID}/request-couple-approval$`), label: 'Requested couple approval', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/(case-manager|lawyer)/${ID}/p[12]-confirmation$`), label: 'Recorded client confirmation', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/case-manager/${ID}/archive$`), label: 'Archived case', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/cases/${ID}/approve$`), label: 'Approved case', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/cases/${ID}/reject$`), label: 'Rejected case', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/cases/${ID}/unlock$`), label: 'Unlocked questionnaire section', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/cases/${ID}/payment-completed$`), label: 'Marked case as paid', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/cases/${ID}/questionnaire/`), label: 'Updated questionnaire', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/cases/${ID}/create-case-backup$`), label: 'Created case backup', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/cases/${ID}/revert-case-backup$`), label: 'Restored case backup', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/cases/${ID}/invite`), label: 'Updated partner invitation', cat: C.CASE_UPDATE },
  { m: 'DELETE', r: new RegExp(`^/cases/${ID}/(partner|invitee-account)$`), label: 'Removed partner from case', cat: C.CASE_UPDATE },
  { m: 'PUT', r: new RegExp(`^/cases/${ID}$`), label: 'Updated case', cat: C.CASE_UPDATE },
  { m: 'PATCH', r: new RegExp(`^/cases/${ID}$`), label: 'Updated case', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/(case-manager|lawyer)/${ID}/documents$`), label: 'Uploaded document', cat: C.DOCUMENT_ACCESS },
  { m: 'DELETE', r: new RegExp(`^/(case-manager|lawyer)/${ID}/documents/`), label: 'Deleted document', cat: C.DOCUMENT_ACCESS },
  { m: 'POST', r: new RegExp(`^/(case-manager|lawyer)/${ID}/notes$`), label: 'Added note', cat: C.CASE_UPDATE },
  { m: 'DELETE', r: new RegExp(`^/(case-manager|lawyer)/${ID}/notes/`), label: 'Deleted note', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/(case-manager|lawyer)/${ID}/versions$`), label: 'Created case version', cat: C.CASE_UPDATE },
  { m: 'POST', r: new RegExp(`^/(case-manager|lawyer)/${ID}/agreements$`), label: 'Uploaded agreement', cat: C.DOCUMENT_ACCESS },
  { m: 'POST', r: new RegExp(`^/lawyer/${ID}/review-complete$`), label: 'Completed lawyer review', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/lawyer/${ID}/request-ila$`), label: 'Requested ILA', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/lawyer/${ID}/p[12]-ila$`), label: 'Recorded ILA', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/lawyer/${ID}/p[12]-signoff$`), label: 'Signed off agreement', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/lawyer/${ID}/complete$`), label: 'Completed case', cat: C.STATUS_CHANGE },
  { m: 'POST', r: new RegExp(`^/agreement/${ID}/document/(cm/)?generate$`), label: 'Generated agreement document', cat: C.DOCUMENT_ACCESS },
  { m: 'POST', r: new RegExp(`^/agreement/${ID}/document/lawyer/initialize$`), label: 'Initialised agreement for review', cat: C.DOCUMENT_ACCESS },
  { m: 'POST', r: new RegExp(`^/agreement/${ID}/document/lawyer/checkout$`), label: 'Checked out agreement', cat: C.DOCUMENT_ACCESS },
  { m: 'POST', r: new RegExp(`^/agreement/${ID}/document/lawyer/checkin$`), label: 'Checked in agreement', cat: C.DOCUMENT_ACCESS },
  { m: 'POST', r: new RegExp(`^/agreement/${ID}/document/lawyer/release$`), label: 'Released agreement lock', cat: C.DOCUMENT_ACCESS },
  { m: 'POST', r: /^\/admin\/payments\/refunds$/, label: 'Issued refund', cat: C.CASE_UPDATE },
  { m: 'POST', r: /^\/admin\/gdpr-requests$/, label: 'Logged GDPR request', cat: C.ACCOUNT_CHANGE },
  { m: 'PATCH', r: /^\/admin\/gdpr-requests\//, label: 'Updated GDPR request', cat: C.ACCOUNT_CHANGE },
  { m: '*', r: /^\/admin\/(case-managers|lawyers|companies|users|settings)/, label: 'Changed staff / directory record', cat: C.ACCOUNT_CHANGE, generic: true },
  { m: '*', r: /^\/lawyer\/manage/, label: 'Changed lawyer record', cat: C.ACCOUNT_CHANGE, generic: true },
  { m: '*', r: /^\/users\/profile/, label: 'Updated own profile', cat: C.ACCOUNT_CHANGE },
];

const VERB: Record<string, string> = { POST: 'Created', PUT: 'Updated', PATCH: 'Updated', DELETE: 'Deleted' };

export function describeActivity(
  method: string,
  path: string,
): { label: string; category: ActivityCategory } | null {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  const p = stripPrefix(path);
  const rule = RULES.find((x) => (x.m === '*' || x.m === method) && x.r.test(p));
  if (rule) {
    // Directory changes: say what happened rather than a generic label.
    if (rule.generic) {
      const what = p.split('/').filter(Boolean).slice(0, 2).join(' ');
      return { label: `${VERB[method] || method} ${what}`.trim(), category: rule.cat };
    }
    return { label: rule.label, category: rule.cat };
  }
  return {
    label: `${VERB[method] || method} ${p}`,
    category: caseIdFromPath(p) ? C.CASE_UPDATE : C.ACCOUNT_CHANGE,
  };
}
