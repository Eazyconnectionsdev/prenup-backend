import { Model } from 'mongoose';

export const STAFF_ROLES = ['superadmin', 'admin', 'case_manager'];

export const isStaffRole = (role?: string): boolean => STAFF_ROLES.includes(role ?? '');

const idOf = (v: any): string => (v ? String(v._id ?? v) : '');

/**
 * Is this signed-in user the lawyer assigned to the case? A case may point at
 * the lawyer's profile or at their login, and either may be recorded on the
 * other, so accept all of them.
 */
export async function isAssignedLawyer(
  models: { user: Model<any>; lawyer: Model<any> },
  c: { assignedLawyerP1?: any; assignedLawyerP2?: any },
  actor: { id?: any; _id?: any; role?: string },
): Promise<boolean> {
  if (actor.role !== 'lawyer') return false;
  const uid = idOf(actor.id ?? actor._id);
  const assigned = [c.assignedLawyerP1, c.assignedLawyerP2].map(idOf).filter(Boolean);
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
 * Who may read a case: staff, its owner and partner, and the lawyers assigned
 * to it. Works on a populated or an unpopulated case.
 */
export async function canViewCase(
  models: { user: Model<any>; lawyer: Model<any> },
  c: { owner?: any; invitedUser?: any; assignedLawyerP1?: any; assignedLawyerP2?: any },
  actor: { id?: any; _id?: any; role?: string },
): Promise<boolean> {
  if (isStaffRole(actor.role)) return true;
  const uid = idOf(actor.id ?? actor._id);
  if (!uid) return false;
  if (idOf(c.owner) === uid || idOf(c.invitedUser) === uid) return true;
  return isAssignedLawyer(models, c, actor);
}
