// One row per payment attempt or refund. Amounts are in minor units (pence).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum TransactionType {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  INITIATED = 'INITIATED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
}

// Payments that took money (even if later refunded).
export const PAID_STATUSES = [
  TransactionStatus.SUCCEEDED,
  TransactionStatus.PARTIALLY_REFUNDED,
  TransactionStatus.REFUNDED,
];

export type PaymentTransactionDocument = PaymentTransaction & Document;

@Schema({ timestamps: true, collection: 'payment_transactions' })
export class PaymentTransaction {
  // TXN-YYYY-NNNNNN for payments, RFD-YYYY-NNNNNN for refunds
  @Prop({ type: String, required: true, unique: true })
  transactionId!: string;

  @Prop({ type: String, enum: Object.values(TransactionType), required: true })
  type!: TransactionType;

  @Prop({ type: String, enum: Object.values(TransactionStatus), required: true })
  status!: TransactionStatus;

  @Prop({ type: Types.ObjectId, ref: 'Case', required: true, index: true })
  caseId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  caseNumber?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  customerId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  customerName?: string | null;

  @Prop({ type: String, default: null })
  customerEmail?: string | null;

  // agreementType at the time of payment, and its report group
  @Prop({ type: String, default: null })
  service?: string | null;

  @Prop({ type: String, default: null })
  serviceGroup?: string | null;

  @Prop({ type: Number, required: true })
  amount!: number;

  @Prop({ type: String, default: 'gbp' })
  currency!: string;

  // Payments: total refunded so far
  @Prop({ type: Number, default: 0 })
  refundedAmount!: number;

  // stripe | manual
  @Prop({ type: String, default: 'stripe' })
  provider!: string;

  @Prop({ type: String, default: null, index: true })
  providerSessionId?: string | null;

  @Prop({ type: String, default: null, index: true })
  providerPaymentIntentId?: string | null;

  @Prop({ type: String, default: null })
  providerChargeId?: string | null;

  @Prop({ type: String, default: null })
  providerRefundId?: string | null;

  // Reference shown in the reports (payment intent / refund id)
  @Prop({ type: String, default: null })
  providerReference?: string | null;

  // Refunds: the payment refunded. Failed attempts: the checkout they belong to.
  @Prop({ type: String, default: null })
  originalTransactionId?: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  originalPaymentId?: Types.ObjectId | null;

  // FULL | PARTIAL
  @Prop({ type: String, default: null })
  refundType?: string | null;

  @Prop({ type: String, default: null })
  refundReason?: string | null;

  @Prop({ type: String, default: null })
  failureCode?: string | null;

  @Prop({ type: String, default: null })
  failureReason?: string | null;

  @Prop({ type: Date, default: null })
  initiatedAt?: Date | null;

  @Prop({ type: Date, default: null })
  paidAt?: Date | null;

  @Prop({ type: Date, default: null })
  failedAt?: Date | null;

  @Prop({ type: Date, default: null })
  refundedAt?: Date | null;

  // Date the row's current status happened; used for date filters
  @Prop({ type: Date, default: () => new Date(), index: true })
  occurredAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PaymentTransactionSchema = SchemaFactory.createForClass(PaymentTransaction);
PaymentTransactionSchema.index({ type: 1, status: 1, occurredAt: -1 });
// One row per Stripe refund. Partial, because rows without a refund id store
// null, which a sparse index would still treat as a duplicate.
PaymentTransactionSchema.index(
  { providerRefundId: 1 },
  { unique: true, partialFilterExpression: { providerRefundId: { $type: 'string' } } },
);

// Stripe webhook events already handled (Stripe can deliver an event twice).
export type ProcessedStripeEventDocument = ProcessedStripeEvent & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'stripe_events' })
export class ProcessedStripeEvent {
  @Prop({ type: String, required: true, unique: true })
  eventId!: string;

  @Prop({ type: String, required: true })
  type!: string;
}

export const ProcessedStripeEventSchema = SchemaFactory.createForClass(ProcessedStripeEvent);
// Stripe stops retrying after 3 days, so markers are only needed briefly.
ProcessedStripeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });
