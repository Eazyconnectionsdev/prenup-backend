import { Model } from 'mongoose';

export const STAFF_ROLES = ['superadmin', 'admin', 'case_manager'];

export const isStaffRole = (role?: string): boolean => STAFF_ROLES.includes(role ?? '');

const idOf = (v: any): string => (v ? String(v._id ?? v) : '');

/**
 * The two places a case can name the solicitors acting on it.
 *
 * Each partner chooses their own solicitor during the pre-lawyer stage, and
 * that choice is kept on their questionnaire — `preQuestionnaireUser1`
 * .selectedLawyer for P1 and `preQuestionnaireUser2.selectedLawyer` for P2
 * (CasesService.selectLawyerForCase). `assignedLawyerP1`/`assignedLawyerP2`
 * come from the earlier flow where a case manager assigned both
 * (CaseManagerService.assignLawyers), which no screen calls any more, so they
 * are read only as a fallback for cases created under it.
 */
export interface CaseLawyerRefs {
  preQuestionnaireUser1?: { selectedLawyer?: any } | null;
  preQuestionnaireUser2?: { selectedLawyer?: any } | null;
  assignedLawyerP1?: any;
  assignedLawyerP2?: any;
}

/** The Lawyer profile acting for each partner: their own choice, then the fallback. */
export function caseLawyerIds(c: CaseLawyerRefs): { p1: string; p2: string } {
  return {
    p1: idOf(c?.preQuestionnaireUser1?.selectedLawyer) || idOf(c?.assignedLawyerP1),
    p2: idOf(c?.preQuestionnaireUser2?.selectedLawyer) || idOf(c?.assignedLawyerP2),
  };
}

/** The fields `caseLawyerIds` reads, for a query that selects its own. */
export const CASE_LAWYER_FIELDS =
  'preQuestionnaireUser1.selectedLawyer preQuestionnaireUser2.selectedLawyer assignedLawyerP1 assignedLawyerP2';

/** Mongo filter for "cases any of these lawyer ids acts on", for P1 or for P2. */
export function assignedLawyerFilter(ids: any[]): Record<string, any> {
  return {
    $or: [
      { 'preQuestionnaireUser1.selectedLawyer': { $in: ids } },
      { 'preQuestionnaireUser2.selectedLawyer': { $in: ids } },
    ],
  };
}

/**
 * Is this signed-in user a lawyer acting on the case? A case names the
 * lawyer's profile, but the caller only gives us their login, and the link
 * between the two may be recorded on either side, so accept all of them.
 */
export async function isAssignedLawyer(
  models: { user: Model<any>; lawyer: Model<any> },
  c: CaseLawyerRefs,
  actor: { id?: any; _id?: any; role?: string },
): Promise<boolean> {
  if (actor.role !== 'lawyer') return false;
  const uid = idOf(actor.id ?? actor._id);
  const { p1, p2 } = caseLawyerIds(c);
  const assigned = [p1, p2].filter(Boolean);
  if (!uid || !assigned.length) return false;

  const mine = new Set<string>([uid]);
  const user: any = await models.user.findById(uid).select('lawyerProfile').lean().exec();
  if (user?.lawyerProfile) mine.add(String(user.lawyerProfile));
  const profiles: any[] = await models.lawyer
    .find({ $or: [{ user: uid }, { userId: uid }] })
    .select('_id')
    .lean()
    .exec();
  profiles.forEach((p) => mine.add(String(p._id)));
  return assigned.some((a) => mine.has(a));
}

/**
 * Who may read a case: staff, its owner and partner, and the lawyers acting on
 * it. Works on a populated or an unpopulated case.
 */
export async function canViewCase(
  models: { user: Model<any>; lawyer: Model<any> },
  c: CaseLawyerRefs & { owner?: any; invitedUser?: any },
  actor: { id?: any; _id?: any; role?: string },
): Promise<boolean> {
  if (isStaffRole(actor.role)) return true;
  const uid = idOf(actor.id ?? actor._id);
  if (!uid) return false;
  if (idOf(c.owner) === uid || idOf(c.invitedUser) === uid) return true;
  return isAssignedLawyer(models, c, actor);
}
