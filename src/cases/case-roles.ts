import { ConflictException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

/**
 * Who is Partner 1 (P1, the case `owner`) and who is Partner 2 (P2, the
 * `invitedUser`), and how a case comes to be paid for exactly once.
 *
 *   - Registering only creates an account. Sending an invitation does not
 *     decide anything either; an invitation can exist before payment.
 *   - Until the first successful payment the case is a draft: whoever started
 *     it is only provisionally `owner` (and the "user1"/"user2" labels on the
 *     accounts are provisional too).
 *   - The first successful payment establishes the roles: the person who paid
 *     is P1, the other person is P2 (establishCaseRoles). If the invited
 *     partner pays, the two swap places, and each person's answers move with
 *     them. Staff marking a case paid keep the provisional owner as P1.
 *   - From then on the roles are permanent (`rolesEstablishedAt`); nothing,
 *     including the order in which questionnaires are completed, changes them.
 *   - Only one initial payment can go through for a couple. A payment first
 *     claims the case and both people (claimInitialPayment); a second attempt,
 *     on the same case or on another draft for the same couple, is refused
 *     before anything is charged. A Stripe checkout page closes before its
 *     claim lapses, and a new checkout first closes (or records) any earlier
 *     one for the couple, so two pages are never payable at once.
 */

type Models = { caseModel: Model<any>; userModel: Model<any> };

// How long a Stripe checkout page stays payable. Stripe's own default is 24
// hours, far longer than the claim below; a page still open after its claim
// lapsed would let both partners pay. 31 minutes: Stripe's minimum is 30,
// counted from when it creates the session, a moment after this is worked out.
export const CHECKOUT_SESSION_TTL_MS = 31 * 60 * 1000;

// A claim older than this is treated as abandoned. It outlives the checkout
// page it was taken for, so a page can never still be payable once another
// payment may start.
export const PAYMENT_CLAIM_TTL_MS = 35 * 60 * 1000;

const idOf = (v: any): string => (v ? String(v._id ?? v) : '');
const oid = (v: any) => new Types.ObjectId(idOf(v));

/** The other person of the couple, seen from `personId`'s side. */
export async function otherPersonOf(models: Models, c: any, personId: string): Promise<string | null> {
  const owner = idOf(c.owner);
  const invited = idOf(c.invitedUser);
  if (personId === owner) {
    if (invited) return invited;
    // Invited but not joined yet: the address may already belong to an account.
    if (c.invitedEmail) {
      const u = await models.userModel
        .findOne({ email: String(c.invitedEmail).toLowerCase(), active: { $ne: false } })
        .select('_id')
        .lean()
        .exec();
      return u ? idOf((u as any)._id) : null;
    }
    return null;
  }
  if (personId === invited) return owner || null;
  return null;
}

/** Refuses when either person already has a paid case (other than this one). */
export async function assertNoOtherPaidCase(models: Models, caseId: string, people: string[]) {
  const ids = people.filter(Boolean).map((p) => new Types.ObjectId(p));
  if (!ids.length) return;
  const existing = await models.caseModel
    .findOne({
      _id: { $ne: new Types.ObjectId(caseId) },
      paymentCompleted: true,
      workflowStatus: { $ne: 'CANCELLED' },
      abandonedAt: null,
      $or: [{ owner: { $in: ids } }, { invitedUser: { $in: ids } }],
    })
    .select('caseNumber')
    .lean()
    .exec();
  if (existing) {
    throw new ConflictException(
      `You or your partner already have a paid case (${(existing as any).caseNumber ?? 'another case'}). Only one case can be paid for.`,
    );
  }
}

/**
 * Claims the initial payment of a case for `payerId`, atomically, so two
 * attempts cannot both go through. Call before charging; call
 * releasePaymentClaim if the payment does not complete.
 *
 * By default the claim is exclusive: a second attempt is refused even from
 * the same payer (a double click or a second tab must not charge twice).
 * `reuseOwnClaim` lets the same payer pick their claim up again; only for a
 * checkout that then hands back the session already open, never a new one.
 */
export async function claimInitialPayment(
  models: Models,
  caseId: string,
  payerId: string,
  opts: { reuseOwnClaim?: boolean } = {},
): Promise<{ reused: boolean }> {
  const c: any = await models.caseModel.findById(caseId).lean().exec();
  if (!c) return { reused: false };
  if (c.paymentCompleted) throw new ConflictException('This case has already been paid for');

  const other = await otherPersonOf(models, c, payerId);
  const people = [payerId, other].filter(Boolean) as string[];
  await assertNoOtherPaidCase(models, caseId, people);

  const now = new Date();
  const stale = new Date(now.getTime() - PAYMENT_CLAIM_TTL_MS);
  const payer = new Types.ObjectId(payerId);

  const claimed = await models.caseModel
    .findOneAndUpdate(
      {
        _id: c._id,
        paymentCompleted: { $ne: true },
        $or: [
          { paymentClaim: null },
          ...(opts.reuseOwnClaim ? [{ 'paymentClaim.by': payer }] : []),
          { 'paymentClaim.at': { $lt: stale } },
        ],
      },
      { $set: { paymentClaim: { by: payer, at: now } } },
      { new: false },
    )
    .lean()
    .exec();
  if (!claimed) {
    const holder = idOf(c.paymentClaim?.by);
    throw new ConflictException(
      holder === payerId
        ? 'Your payment is already being processed. Please wait a moment and refresh.'
        : 'Your partner is completing the payment for this case right now. Please wait a moment and refresh.',
    );
  }
  // The claim was already this payer's (an open checkout being reopened).
  const reused =
    Boolean(opts.reuseOwnClaim) &&
    idOf((claimed as any).paymentClaim?.by) === payerId &&
    new Date((claimed as any).paymentClaim?.at) >= stale;

  // Lock both people, in a fixed order, so a payment on another draft for the
  // same couple cannot run at the same time.
  const taken: string[] = [];
  for (const person of [...people].sort()) {
    const r = await models.userModel
      .updateOne(
        {
          _id: new Types.ObjectId(person),
          $or: [
            { paymentLock: null },
            { 'paymentLock.caseId': c._id },
            { 'paymentLock.at': { $lt: stale } },
          ],
        },
        { $set: { paymentLock: { caseId: c._id, at: now } } },
      )
      .exec();
    if (!r.matchedCount) {
      await releasePaymentClaim(models, caseId, taken);
      throw new ConflictException(
        'A payment for you or your partner is already in progress. Please wait a moment and refresh.',
      );
    }
    taken.push(person);
  }
  return { reused };
}

/**
 * Releases a claim taken by claimInitialPayment (payment failed or done).
 *
 * `takenUpTo`: release only a claim taken at or before then. A Stripe event
 * about an older checkout arrives on its own schedule, and must not free the
 * claim a newer checkout has taken since.
 */
export async function releasePaymentClaim(
  models: Models,
  caseId: string,
  onlyUsers?: string[],
  takenUpTo?: Date | null,
) {
  const caseOid = new Types.ObjectId(caseId);
  const caseFilter: any = { _id: caseOid };
  const lockFilter: any = { 'paymentLock.caseId': caseOid };
  if (takenUpTo) {
    caseFilter['paymentClaim.at'] = { $lte: takenUpTo };
    lockFilter['paymentLock.at'] = { $lte: takenUpTo };
  }
  await models.caseModel.updateOne(caseFilter, { $set: { paymentClaim: null } }).exec();
  if (onlyUsers) lockFilter._id = { $in: onlyUsers.map((u) => new Types.ObjectId(u)) };
  await models.userModel.updateMany(lockFilter, { $set: { paymentLock: null } }).exec();
}

const plain = (doc: any, path: string) => {
  const v = typeof doc.get === 'function' ? doc.get(path) : doc[path];
  return v && typeof v.toObject === 'function' ? v.toObject() : v ?? undefined;
};

/**
 * Fixes P1 and P2 on the first successful payment. Call on the case document
 * just before it is saved as paid; `payerId` is who paid (null when staff
 * marked it paid, which keeps the provisional owner as P1). Does nothing once
 * the roles are established. Returns whether the two people swapped places.
 */
export async function establishCaseRoles(models: Models, c: any, payerId: string | null): Promise<{ swapped: boolean }> {
  if (c.rolesEstablishedAt) return { swapped: false };

  const owner = idOf(c.owner);
  const invited = idOf(c.invitedUser);
  const swapped = Boolean(payerId && invited && payerId === invited && owner);

  if (swapped) {
    const formerOwner: any = await models.userModel
      .findById(owner)
      .select('firstName lastName email')
      .lean()
      .exec();

    c.owner = oid(invited);
    c.invitedUser = oid(owner);

    // Each person's answers stay theirs: P1's live in myInformation, P2's in
    // partnerInformation, and the same for every per-partner field.
    const swap = (a: string, b: string) => {
      const va = plain(c, a);
      const vb = plain(c, b);
      c.set(a, vb === undefined ? null : vb);
      c.set(b, va === undefined ? null : va);
    };
    swap('myInformation', 'partnerInformation');
    swap('status.myInformation', 'status.partnerInformation');
    swap('preQuestionnaireUser1', 'preQuestionnaireUser2');
    for (const [a, b] of [
      ['approval.user1Approved', 'approval.user2Approved'],
      ['approval.user1ApprovedAt', 'approval.user2ApprovedAt'],
    ]) {
      if (c.get(a) !== undefined || c.get(b) !== undefined) swap(a, b);
    }
    c.markModified('status');

    // The invitation now points at the former owner, who is P2.
    c.invitedEmail = formerOwner?.email ?? c.invitedEmail;
    const details = plain(c, 'partnerInviteDetails') || {};
    c.set('partnerInviteDetails', {
      ...details,
      firstName: formerOwner?.firstName ?? details.firstName,
      lastName: formerOwner?.lastName ?? details.lastName,
      email: formerOwner?.email ?? details.email,
    });
    c.inviteToken = null;
    c.inviteTokenExpires = null;
    c.partnerInvited = true;
  }

  c.rolesEstablishedAt = new Date();
  c.rolesEstablishedBy = payerId ? 'payment' : 'staff';
  c.set('paymentClaim', null);

  const p1 = idOf(c.owner);
  const p2 = idOf(c.invitedUser);
  await models.userModel
    .updateOne(
      { _id: new Types.ObjectId(p1) },
      { $set: { endUserType: 'user1', inviteCaseId: oid(c._id), invitedBy: null, invitedUser: p2 ? oid(p2) : null } },
    )
    .exec();
  if (p2) {
    await models.userModel
      .updateOne(
        { _id: new Types.ObjectId(p2) },
        { $set: { endUserType: 'user2', inviteCaseId: oid(c._id), invitedBy: oid(p1), invitedUser: null } },
      )
      .exec();
  }
  return { swapped };
}

/**
 * After a couple's case is paid, any other unpaid draft between the same two
 * people is a duplicate: set it aside so only one case exists for them.
 */
export async function setAsideDuplicateDrafts(models: Models, c: any): Promise<number> {
  const p1 = idOf(c.owner);
  // P2 may not have joined yet: their invited address can still be an account.
  const p2 = idOf(c.invitedUser) || (p1 ? await otherPersonOf(models, c, p1) : null);
  if (!p1 || !p2) return 0;
  const emails = (
    (await models.userModel
      .find({ _id: { $in: [new Types.ObjectId(p1), new Types.ObjectId(p2)] } })
      .select('email')
      .lean()
      .exec()) as any[]
  ).map((u) => String(u.email).toLowerCase());
  const pair = [new Types.ObjectId(p1), new Types.ObjectId(p2)];
  const r = await models.caseModel
    .updateMany(
      {
        _id: { $ne: c._id },
        paymentCompleted: { $ne: true },
        abandonedAt: null,
        owner: { $in: pair },
        $or: [{ invitedUser: { $in: pair } }, { invitedEmail: { $in: emails } }],
      },
      {
        $set: {
          abandonedAt: new Date(),
          workflowStatus: 'CANCELLED',
          supersededByCaseId: c._id,
        },
      },
    )
    .exec();
  return r.modifiedCount ?? 0;
}
