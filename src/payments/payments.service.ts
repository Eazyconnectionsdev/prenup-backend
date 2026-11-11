// Stripe Checkout payments and refunds, recorded as payment transactions.
//
// Flow:
//  1. The applicant starts checkout -> an INITIATED transaction + a Stripe
//     Checkout Session; the case moves to payment "Initiated".
//  2. Stripe confirms (webhook, or the return page verifying the session) ->
//     the transaction SUCCEEDED, the case is paid and moves NOT_PAID -> DRAFT.
//  3. Failed card attempts are kept as their own FAILED rows with the reason;
//     an abandoned checkout expires to CANCELLED.
//  4. Refunds (issued here or in the Stripe dashboard) arrive as refund
//     events and are mirrored as REFUND rows; the payment becomes
//     PARTIALLY_REFUNDED or REFUNDED.
//
// Required env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Optional:
// PAYMENT_FEE_GBP (default 499) and per-service PAYMENT_FEE_GBP_PRENUPTIAL /
// _POSTNUPTIAL / _COHABITATION.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { RequestContext, userDisplayName } from '../common/request-context';
import { Case, CaseDocument, CaseWorkflowStatus, PaymentStatus } from '../cases/schemas/case.schema';
import { User } from '../users/schemas/user.schema';
import { getNextSeq } from '../utils/case-number.util';
import { AGREEMENT_TYPE_LABELS, SERVICE_GROUP_LABELS, serviceGroupOf } from '../tracking/labels';
import {
  PAID_STATUSES,
  PaymentTransaction,
  PaymentTransactionDocument,
  ProcessedStripeEvent,
  ProcessedStripeEventDocument,
  TransactionStatus,
  TransactionType,
} from './schemas/payment-transaction.schema';

const CURRENCY = 'gbp';

export const formatMoney = (minor: number, currency = CURRENCY) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(
    (minor || 0) / 100,
  );

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private client: any = null;

  constructor(
    @InjectModel(PaymentTransaction.name)
    private readonly txModel: Model<PaymentTransactionDocument>,
    @InjectModel(ProcessedStripeEvent.name)
    private readonly eventModel: Model<ProcessedStripeEventDocument>,
    @InjectModel(Case.name) private readonly caseModel: Model<CaseDocument>,
    @InjectModel(User.name) private readonly userModel: Model<any>,
    @InjectModel('Counter') private readonly counterModel: Model<any>,
  ) {}

  // ── Setup ──

  get configured() {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  private stripe(): any {
    if (!this.configured) {
      throw new ServiceUnavailableException('Online payments are not configured');
    }
    if (!this.client) this.client = new (Stripe as any)(process.env.STRIPE_SECRET_KEY);
    return this.client;
  }

  private async nextId(prefix: 'TXN' | 'RFD') {
    const year = new Date().getFullYear();
    const seq = await getNextSeq(this.counterModel, `${prefix.toLowerCase()}-${year}`);
    return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  }

  // Fixed fee per service, in pence.
  quote(agreementType?: string | null) {
    const group = serviceGroupOf(agreementType);
    const pounds =
      Number(process.env[`PAYMENT_FEE_GBP_${group}`]) || Number(process.env.PAYMENT_FEE_GBP) || 499;
    const amount = Math.round(pounds * 100);
    return {
      amount,
      currency: CURRENCY,
      display: formatMoney(amount),
      service: agreementType ?? null,
      serviceGroup: group,
      serviceLabel: (agreementType && AGREEMENT_TYPE_LABELS[agreementType]) || SERVICE_GROUP_LABELS[group],
    };
  }

  private isPaid(c: any) {
    return (
      c.paymentCompleted ||
      [PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED].includes(c.paymentStatus)
    );
  }

  private async loadCaseFor(caseId: string, user: any) {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    const uid = String(user?.id ?? user?._id);
    const isParty = String(c.owner) === uid || (c.invitedUser && String(c.invitedUser) === uid);
    const isStaff = ['superadmin', 'admin', 'case_manager'].includes(user?.role);
    if (!isParty && !isStaff) throw new ForbiddenException('You do not have access to this case');
    return c;
  }

  // Runs a case change as the system (Stripe confirmed it, not the viewer).
  // With keepActor, a signed-in staff member who caused it (e.g. issued the
  // refund) stays the recorded actor.
  private async asSystem<T>(reason: string, fn: () => Promise<T>, keepActor = false): Promise<T> {
    const ctx = RequestContext.get();
    const prev = { system: ctx?.system, statusReason: ctx?.statusReason };
    if (!keepActor || !ctx?.user) RequestContext.set('system', true);
    RequestContext.set('statusReason', reason);
    try {
      return await fn();
    } finally {
      RequestContext.set('system', prev.system);
      RequestContext.set('statusReason', prev.statusReason);
    }
  }

  // ── Applicant flow ──

  async getCasePayment(caseId: string, user: any) {
    const c = await this.loadCaseFor(caseId, user);
    const q = this.quote(c.agreementType);
    return {
      ...q,
      paid: this.isPaid(c),
      paymentStatus: c.paymentStatus,
      onlinePayments: this.configured,
    };
  }

  async createCheckout(caseId: string, user: any) {
    const c = await this.loadCaseFor(caseId, user);
    if (this.isPaid(c)) throw new BadRequestException('This case has already been paid for');
    if (!c.agreementType || c.agreementType === 'help-choose') {
      throw new BadRequestException('Please choose your agreement before paying');
    }
    const stripe = this.stripe();
    const q = this.quote(c.agreementType);
    const payer: any = await this.userModel.findById(user.id ?? user._id).lean();
    const transactionId = await this.nextId('TXN');
    const front = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

    const tx = await this.txModel.create({
      transactionId,
      type: TransactionType.PAYMENT,
      status: TransactionStatus.INITIATED,
      caseId: c._id,
      caseNumber: c.caseNumber ?? null,
      customerId: payer?._id ?? null,
      customerName: userDisplayName(payer),
      customerEmail: payer?.email ?? null,
      service: c.agreementType,
      serviceGroup: q.serviceGroup,
      amount: q.amount,
      currency: q.currency,
      provider: 'stripe',
      initiatedAt: new Date(),
      occurredAt: new Date(),
      createdBy: payer?._id ?? null,
    });

    const metadata = {
      caseId: String(c._id),
      caseNumber: c.caseNumber ?? '',
      transactionId,
      userId: String(payer?._id ?? ''),
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: q.currency,
              unit_amount: q.amount,
              product_data: {
                name: q.serviceLabel,
                description: 'Fixed fee for both partners, including two independent lawyers',
              },
            },
          },
        ],
        customer_email: payer?.email || undefined,
        client_reference_id: String(c._id),
        metadata,
        payment_intent_data: { metadata },
        success_url: `${front}/onboarding?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${front}/onboarding?payment=cancelled`,
      },
      { idempotencyKey: transactionId },
    );

    tx.providerSessionId = session.id;
    tx.providerReference = session.id;
    await tx.save();

    if (c.paymentStatus !== PaymentStatus.INITIATED) {
      c.paymentStatus = PaymentStatus.INITIATED;
      await c.save();
    }
    return { url: session.url, sessionId: session.id, transactionId };
  }

  // Called by the return page so the case is up to date even before (or
  // without) the webhook.
  async verifySession(sessionId: string, user: any) {
    const session = await this.stripe().checkout.sessions.retrieve(sessionId);
    const caseId = session?.metadata?.caseId || session?.client_reference_id;
    if (!caseId) throw new NotFoundException('Payment not found');
    await this.loadCaseFor(caseId, user);
    if (session.payment_status === 'paid') await this.finalizeSession(session);
    const tx = await this.txModel.findOne({ providerSessionId: session.id }).lean();
    return {
      caseId,
      paid: session.payment_status === 'paid',
      status: session.status,
      transactionId: tx?.transactionId ?? null,
    };
  }

  // ── Webhooks ──

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Stripe webhook secret not configured');
    if (!rawBody || !signature) throw new BadRequestException('Missing Stripe signature');

    let event: any;
    try {
      event = this.stripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed`);
    }

    try {
      await this.eventModel.create({ eventId: event.id, type: event.type });
    } catch (err: any) {
      if (err?.code === 11000) return { received: true, duplicate: true };
      throw err;
    }

    RequestContext.set('system', true);
    try {
      await this.dispatch(event);
    } catch (err) {
      // Let Stripe retry: forget that this event was handled.
      await this.eventModel.collection.deleteOne({ eventId: event.id }).catch(() => undefined);
      this.logger.error(`Stripe event ${event.type} failed`, err instanceof Error ? err.stack : String(err));
      throw err;
    }
    return { received: true };
  }

  private async dispatch(event: any) {
    const obj = event.data?.object;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (obj.payment_status === 'paid') await this.finalizeSession(obj);
        break;
      case 'checkout.session.async_payment_failed':
        await this.recordFailure(obj.payment_intent, obj, 'Delayed payment failed');
        break;
      case 'checkout.session.expired':
        await this.expireSession(obj);
        break;
      case 'payment_intent.payment_failed':
        // The event carries the whole payment intent.
        await this.recordFailure(obj, null);
        break;
      case 'charge.refunded':
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed':
      case 'charge.refund.updated': {
        const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        if (pi) await this.syncRefunds(pi);
        break;
      }
      default:
        break;
    }
  }

  // ── Transitions ──

  private async finalizeSession(session: any) {
    const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    let tx =
      (session.metadata?.transactionId &&
        (await this.txModel.findOne({ transactionId: session.metadata.transactionId }))) ||
      (await this.txModel.findOne({ providerSessionId: session.id }));

    if (tx && PAID_STATUSES.includes(tx.status)) return tx; // already done

    const caseId = session.metadata?.caseId || session.client_reference_id;
    const c = caseId && Types.ObjectId.isValid(caseId) ? await this.caseModel.findById(caseId) : null;
    if (!c) {
      this.logger.warn(`Paid checkout ${session.id} has no matching case`);
      return null;
    }

    let chargeId: string | null = null;
    if (piId) {
      try {
        const pi = await this.stripe().paymentIntents.retrieve(piId);
        chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null;
      } catch {
        // The charge id is only extra detail.
      }
    }

    const now = new Date();
    if (!tx) {
      const owner: any = await this.userModel.findById(c.owner).lean();
      tx = new this.txModel({
        transactionId: await this.nextId('TXN'),
        type: TransactionType.PAYMENT,
        caseId: c._id,
        caseNumber: c.caseNumber ?? null,
        customerId: owner?._id ?? null,
        customerName: userDisplayName(owner),
        customerEmail: session.customer_details?.email || owner?.email || null,
        service: c.agreementType ?? null,
        serviceGroup: serviceGroupOf(c.agreementType),
        provider: 'stripe',
        providerSessionId: session.id,
        initiatedAt: new Date((session.created || Date.now() / 1000) * 1000),
      });
    }
    tx.status = TransactionStatus.SUCCEEDED;
    tx.amount = session.amount_total ?? tx.amount;
    tx.currency = session.currency || tx.currency || CURRENCY;
    tx.providerPaymentIntentId = piId ?? null;
    tx.providerChargeId = chargeId;
    tx.providerReference = piId || session.id;
    tx.paidAt = now;
    tx.occurredAt = now;
    tx.failureReason = null;
    tx.failureCode = null;
    await tx.save();

    await this.markCasePaid(c, `Payment confirmed by Stripe (${tx.transactionId})`);
    return tx;
  }

  private async markCasePaid(c: CaseDocument, reason: string) {
    await this.asSystem(reason, async () => {
      c.paymentCompleted = true;
      c.paymentStatus = PaymentStatus.COMPLETED;
      if (!c.workflowStatus || c.workflowStatus === CaseWorkflowStatus.NOT_PAID) {
        c.workflowStatus = CaseWorkflowStatus.DRAFT;
      }
      await c.save();
    });
    await this.userModel.updateOne({ _id: c.owner }, { $set: { paymentDone: true } });
  }

  private async recordFailure(paymentIntent: any, session: any, fallbackReason?: string) {
    const stripe = this.stripe();
    const pi =
      typeof paymentIntent === 'string' ? await stripe.paymentIntents.retrieve(paymentIntent) : paymentIntent;
    if (!pi) return;
    const meta = pi.metadata || session?.metadata || {};
    const parent = meta.transactionId ? await this.txModel.findOne({ transactionId: meta.transactionId }) : null;
    const caseId = meta.caseId || parent?.caseId;
    if (!caseId || !Types.ObjectId.isValid(String(caseId))) return;
    const c = await this.caseModel.findById(caseId);
    if (!c) return;

    const err = pi.last_payment_error || {};
    const now = new Date();
    await this.txModel.create({
      transactionId: await this.nextId('TXN'),
      type: TransactionType.PAYMENT,
      status: TransactionStatus.FAILED,
      caseId: c._id,
      caseNumber: c.caseNumber ?? null,
      customerId: parent?.customerId ?? c.owner,
      customerName: parent?.customerName ?? null,
      customerEmail: parent?.customerEmail ?? null,
      service: parent?.service ?? c.agreementType ?? null,
      serviceGroup: parent?.serviceGroup ?? serviceGroupOf(c.agreementType),
      amount: pi.amount ?? parent?.amount ?? 0,
      currency: pi.currency || CURRENCY,
      provider: 'stripe',
      providerSessionId: parent?.providerSessionId ?? session?.id ?? null,
      providerPaymentIntentId: pi.id,
      providerChargeId: typeof err.charge === 'string' ? err.charge : null,
      providerReference: (typeof err.charge === 'string' && err.charge) || pi.id,
      originalTransactionId: parent?.transactionId ?? null,
      originalPaymentId: parent?._id ?? null,
      failureCode: err.decline_code || err.code || null,
      failureReason: err.message || fallbackReason || 'Payment failed',
      initiatedAt: parent?.initiatedAt ?? now,
      failedAt: now,
      occurredAt: now,
    });

    if (!this.isPaid(c)) {
      await this.asSystem('Card payment failed', async () => {
        c.paymentStatus = PaymentStatus.FAILED;
        await c.save();
      });
    }
  }

  private async expireSession(session: any) {
    const tx = await this.txModel.findOne({ providerSessionId: session.id });
    if (tx && tx.status === TransactionStatus.INITIATED) {
      tx.status = TransactionStatus.CANCELLED;
      tx.failureReason = 'Checkout expired before payment';
      tx.occurredAt = new Date();
      await tx.save();
    }
    const caseId = session.metadata?.caseId || session.client_reference_id;
    if (!caseId || !Types.ObjectId.isValid(caseId)) return;
    const c = await this.caseModel.findById(caseId);
    if (!c || this.isPaid(c) || c.paymentStatus !== PaymentStatus.INITIATED) return;
    const stillOpen = await this.txModel.exists({
      caseId: c._id,
      type: TransactionType.PAYMENT,
      status: TransactionStatus.INITIATED,
    });
    if (stillOpen) return;
    await this.asSystem('Checkout expired', async () => {
      c.paymentStatus = PaymentStatus.PENDING;
      await c.save();
    });
  }

  // Mirrors every refund Stripe holds for a payment, then updates the
  // payment and case status from the refunded total.
  async syncRefunds(paymentIntentId: string, extra?: { refundId?: string; reason?: string; by?: string }) {
    const payment = await this.txModel.findOne({
      type: TransactionType.PAYMENT,
      providerPaymentIntentId: paymentIntentId,
      status: { $in: PAID_STATUSES },
    });
    if (!payment) return null;
    const list = await this.stripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 });
    for (const r of list.data as any[]) {
      const status =
        r.status === 'succeeded'
          ? TransactionStatus.SUCCEEDED
          : r.status === 'failed'
            ? TransactionStatus.FAILED
            : r.status === 'canceled'
              ? TransactionStatus.CANCELLED
              : TransactionStatus.PENDING;
      const when = new Date((r.created || Date.now() / 1000) * 1000);
      const existing = await this.txModel.findOne({ providerRefundId: r.id });
      const row = existing ?? new this.txModel({
        transactionId: await this.nextId('RFD'),
        type: TransactionType.REFUND,
        caseId: payment.caseId,
        caseNumber: payment.caseNumber,
        customerId: payment.customerId,
        customerName: payment.customerName,
        customerEmail: payment.customerEmail,
        service: payment.service,
        serviceGroup: payment.serviceGroup,
        provider: 'stripe',
        providerPaymentIntentId: paymentIntentId,
        providerRefundId: r.id,
        providerReference: r.id,
        originalTransactionId: payment.transactionId,
        originalPaymentId: payment._id,
        initiatedAt: when,
        createdBy: extra && extra.refundId === r.id && extra.by && Types.ObjectId.isValid(extra.by) ? extra.by : null,
      });
      row.status = status;
      row.amount = r.amount;
      row.currency = r.currency || payment.currency;
      row.refundType = r.amount >= payment.amount ? 'FULL' : 'PARTIAL';
      row.refundReason =
        (extra && extra.refundId === r.id && extra.reason) || row.refundReason || r.metadata?.reason || r.reason || null;
      row.failureReason = r.failure_reason || null;
      if (status === TransactionStatus.SUCCEEDED) row.refundedAt = row.refundedAt || when;
      row.occurredAt = row.refundedAt || when;
      await row.save();
    }
    return this.applyRefundTotals(payment);
  }

  private async applyRefundTotals(payment: PaymentTransactionDocument) {
    const refunds = await this.txModel
      .find({ type: TransactionType.REFUND, originalPaymentId: payment._id, status: TransactionStatus.SUCCEEDED })
      .lean();
    const total = refunds.reduce((s, r) => s + (r.amount || 0), 0);
    payment.refundedAmount = total;
    payment.status =
      total >= payment.amount
        ? TransactionStatus.REFUNDED
        : total > 0
          ? TransactionStatus.PARTIALLY_REFUNDED
          : TransactionStatus.SUCCEEDED;
    await payment.save();

    const c = await this.caseModel.findById(payment.caseId);
    if (c) {
      const next =
        payment.status === TransactionStatus.REFUNDED
          ? PaymentStatus.REFUNDED
          : payment.status === TransactionStatus.PARTIALLY_REFUNDED
            ? PaymentStatus.PARTIALLY_REFUNDED
            : PaymentStatus.COMPLETED;
      if (c.paymentStatus !== next) {
        await this.asSystem(
          `Refund recorded (${payment.transactionId})`,
          async () => {
            c.paymentStatus = next;
            await c.save();
          },
          true,
        );
      }
    }
    return payment;
  }

  // ── Staff actions ──

  async createRefund(transactionId: string, amountPounds: number | undefined, reason: string, actor: any) {
    const payment = await this.txModel.findOne({ transactionId, type: TransactionType.PAYMENT });
    if (!payment) throw new NotFoundException('Payment not found');
    if (![TransactionStatus.SUCCEEDED, TransactionStatus.PARTIALLY_REFUNDED].includes(payment.status)) {
      throw new BadRequestException('Only a successful payment can be refunded');
    }
    const remaining = payment.amount - (payment.refundedAmount || 0);
    const amount = amountPounds == null ? remaining : Math.round(Number(amountPounds) * 100);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter a refund amount');
    if (amount > remaining) {
      throw new BadRequestException(`At most ${formatMoney(remaining, payment.currency)} can still be refunded`);
    }
    const by = String(actor?.id ?? actor?._id ?? '');
    const text = (reason || '').trim().slice(0, 500) || 'Requested by customer';

    if (payment.provider === 'manual' || !payment.providerPaymentIntentId) {
      // Payment taken outside Stripe: record the refund made outside too.
      const now = new Date();
      await this.txModel.create({
        transactionId: await this.nextId('RFD'),
        type: TransactionType.REFUND,
        status: TransactionStatus.SUCCEEDED,
        caseId: payment.caseId,
        caseNumber: payment.caseNumber,
        customerId: payment.customerId,
        customerName: payment.customerName,
        customerEmail: payment.customerEmail,
        service: payment.service,
        serviceGroup: payment.serviceGroup,
        amount,
        currency: payment.currency,
        provider: 'manual',
        originalTransactionId: payment.transactionId,
        originalPaymentId: payment._id,
        refundType: amount >= payment.amount ? 'FULL' : 'PARTIAL',
        refundReason: text,
        initiatedAt: now,
        refundedAt: now,
        occurredAt: now,
        createdBy: Types.ObjectId.isValid(by) ? by : null,
      });
      return this.applyRefundTotals(payment);
    }

    const refund = await this.stripe().refunds.create({
      payment_intent: payment.providerPaymentIntentId,
      amount,
      reason: 'requested_by_customer',
      metadata: { reason: text, transactionId: payment.transactionId, requestedBy: by },
    });
    return this.syncRefunds(payment.providerPaymentIntentId, { refundId: refund.id, reason: text, by });
  }

  // Staff correction: mark a case paid when the money was taken another way.
  async markPaidManually(caseId: string, actor: any) {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    if (!this.isPaid(c)) {
      const owner: any = await this.userModel.findById(c.owner).lean();
      const q = this.quote(c.agreementType);
      const now = new Date();
      const tx = await this.txModel.create({
        transactionId: await this.nextId('TXN'),
        type: TransactionType.PAYMENT,
        status: TransactionStatus.SUCCEEDED,
        caseId: c._id,
        caseNumber: c.caseNumber ?? null,
        customerId: owner?._id ?? null,
        customerName: userDisplayName(owner),
        customerEmail: owner?.email ?? null,
        service: c.agreementType ?? null,
        serviceGroup: q.serviceGroup,
        amount: q.amount,
        currency: q.currency,
        provider: 'manual',
        providerReference: 'Marked paid by staff',
        initiatedAt: now,
        paidAt: now,
        occurredAt: now,
        createdBy: actor?.id ?? actor?._id ?? null,
      });
      // Recorded as the staff member who did it.
      RequestContext.set('statusReason', `Marked as paid by staff (${tx.transactionId})`);
      c.paymentCompleted = true;
      c.paymentStatus = PaymentStatus.COMPLETED;
      if (!c.workflowStatus || c.workflowStatus === CaseWorkflowStatus.NOT_PAID) {
        c.workflowStatus = CaseWorkflowStatus.DRAFT;
      }
      await c.save();
      await this.userModel.updateOne({ _id: c.owner }, { $set: { paymentDone: true } });
    }
    return c;
  }
}
