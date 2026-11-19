import { Model, Types } from 'mongoose';

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
      // Cases from the older flow, where a case manager assigned the lawyers.
      // The guard (isAssignedLawyer) accepts them, so the lists must too.
      { assignedLawyerP1: { $in: ids } },
      { assignedLawyerP2: { $in: ids } },
    ],
  };
}

export type LawyerSide = 'P1' | 'P2';

/**
 * Every id a case may name this signed-in lawyer by. A case names the lawyer's
 * profile, but the caller only gives us their login, and the link between the
 * two may be recorded on either side (User.lawyerProfile, Lawyer.user, legacy
 * Lawyer.userId), so collect all of them.
 */
export async function lawyerIdsForUser(
  models: { user: Model<any>; lawyer: Model<any> },
  userId: any,
): Promise<Set<string>> {
  const uid = idOf(userId);
  const mine = new Set<string>(uid ? [uid] : []);
  if (!uid) return mine;
  const user: any = await models.user.findById(uid).select('lawyerProfile').lean().exec();
  if (user?.lawyerProfile) mine.add(String(user.lawyerProfile));
  // Match the stored ObjectId and a legacy string id alike.
  const uidRefs: any[] = Types.ObjectId.isValid(uid) ? [new Types.ObjectId(uid), uid] : [uid];
  const profiles: any[] = await models.lawyer
    .find({ $or: [{ user: { $in: uidRefs } }, { userId: { $in: uidRefs } }] })
    .select('_id')
    .lean()
    .exec();
  profiles.forEach((p) => mine.add(String(p._id)));
  return mine;
}

/**
 * Which partner(s) of the case this signed-in lawyer acts for. Empty for
 * anyone else. Every id the lawyer goes by is checked (see lawyerIdsForUser).
 */
export async function lawyerSidesFor(
  models: { user: Model<any>; lawyer: Model<any> },
  c: CaseLawyerRefs,
  actor: { id?: any; _id?: any; role?: string },
): Promise<Set<LawyerSide>> {
  const sides = new Set<LawyerSide>();
  if (actor.role !== 'lawyer') return sides;
  const { p1, p2 } = caseLawyerIds(c);
  if (!p1 && !p2) return sides;
  const mine = await lawyerIdsForUser(models, actor.id ?? actor._id);
  if (p1 && mine.has(p1)) sides.add('P1');
  if (p2 && mine.has(p2)) sides.add('P2');
  return sides;
}

/** Is this signed-in user a lawyer acting on the case (for either partner)? */
export async function isAssignedLawyer(
  models: { user: Model<any>; lawyer: Model<any> },
  c: CaseLawyerRefs,
  actor: { id?: any; _id?: any; role?: string },
): Promise<boolean> {
  return (await lawyerSidesFor(models, c, actor)).size > 0;
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
