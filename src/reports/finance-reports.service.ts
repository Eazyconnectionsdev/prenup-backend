// Finance section. Amounts are stored in pence and returned in both pence
// (for maths) and formatted GBP (for display). Date Range filters on the date
// each transaction's current status happened (paid / failed / refunded).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PAID_STATUSES,
  PaymentTransaction,
  TransactionStatus,
  TransactionType,
} from '../payments/schemas/payment-transaction.schema';
import { formatMoney } from '../payments/payments.service';
import { AGREEMENT_TYPE_LABELS, SERVICE_GROUP_LABELS, ServiceGroup } from '../tracking/labels';
import { dateMatch, escapeRegex, paged, ReportFilters, round1 } from './report-filters';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  INITIATED: 'Pending',
  SUCCEEDED: 'Successful',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  PARTIALLY_REFUNDED: 'Partially Refunded',
  REFUNDED: 'Refunded',
};

// Payment Status filter -> stored statuses
const STATUS_FILTER: Record<string, string[]> = {
  SUCCESSFUL: [TransactionStatus.SUCCEEDED],
  PENDING: [TransactionStatus.PENDING, TransactionStatus.INITIATED],
  FAILED: [TransactionStatus.FAILED],
  REFUNDED: [TransactionStatus.REFUNDED],
  PARTIALLY_REFUNDED: [TransactionStatus.PARTIALLY_REFUNDED],
  CANCELLED: [TransactionStatus.CANCELLED],
};

@Injectable()
export class FinanceReportsService {
  constructor(@InjectModel(PaymentTransaction.name) private readonly txModel: Model<any>) {}

  private baseMatch(f: ReportFilters, opts: { skipDate?: boolean } = {}) {
    const q: any = opts.skipDate ? {} : { ...dateMatch(f, 'occurredAt') };
    if (f.serviceGroups.length) q.serviceGroup = { $in: f.serviceGroups };
    if (f.caseQuery) {
      const rx = { $regex: escapeRegex(f.caseQuery), $options: 'i' };
      q.$or = [{ caseNumber: rx }, { transactionId: rx }, { providerReference: rx }];
    }
    return q;
  }

  private sum(rows: any[]) {
    return rows.reduce((s, r) => s + (r.amount || 0), 0);
  }

  // Reports 1, 2, 6 and 7: revenue, payments received, net revenue and
  // revenue by service, from one pass over the transactions.
  async summary(f: ReportFilters) {
    const base = this.baseMatch(f);
    const [payments, refunds, others] = await Promise.all([
      this.txModel.find({ ...base, type: TransactionType.PAYMENT, status: { $in: PAID_STATUSES } }).lean(),
      this.txModel.find({ ...base, type: TransactionType.REFUND, status: TransactionStatus.SUCCEEDED }).lean(),
      this.txModel
        .find({
          ...base,
          type: TransactionType.PAYMENT,
          status: { $in: [TransactionStatus.PENDING, TransactionStatus.INITIATED, TransactionStatus.FAILED, TransactionStatus.CANCELLED] },
        })
        .select('status amount')
        .lean(),
    ]);

    const gross = this.sum(payments);
    const refunded = this.sum(refunds);
    const net = gross - refunded;
    const currency = 'gbp';
    const money = (n: number) => ({ amount: n, display: formatMoney(n, currency) });

    // Revenue by service (group and exact agreement type)
    const groups = new Map<string, { cases: Set<string>; revenue: number; refunds: number }>();
    const types = new Map<string, { cases: Set<string>; revenue: number }>();
    for (const p of payments) {
      const g = p.serviceGroup || 'UNDECIDED';
      const e = groups.get(g) ?? { cases: new Set(), revenue: 0, refunds: 0 };
      e.cases.add(String(p.caseId));
      e.revenue += p.amount;
      groups.set(g, e);
      const t = p.service || 'unknown';
      const te = types.get(t) ?? { cases: new Set(), revenue: 0 };
      te.cases.add(String(p.caseId));
      te.revenue += p.amount;
      types.set(t, te);
    }
    for (const r of refunds) {
      const g = r.serviceGroup || 'UNDECIDED';
      const e = groups.get(g) ?? { cases: new Set(), revenue: 0, refunds: 0 };
      e.refunds += r.amount;
      groups.set(g, e);
    }
    const groupOrder: ServiceGroup[] = ['PRENUPTIAL', 'POSTNUPTIAL', 'COHABITATION', 'UNDECIDED'];
    const byService = groupOrder
      .filter((g) => !f.serviceGroups.length || f.serviceGroups.includes(g))
      .filter((g) => g !== 'UNDECIDED' || groups.has(g))
      .map((g) => {
        const e = groups.get(g) ?? { cases: new Set<string>(), revenue: 0, refunds: 0 };
        return {
          service: g,
          label: SERVICE_GROUP_LABELS[g],
          paidCases: e.cases.size,
          revenue: money(e.revenue),
          refunds: money(e.refunds),
          netRevenue: money(e.revenue - e.refunds),
          percent: gross ? round1((e.revenue / gross) * 100) : 0,
        };
      });

    // Payments received, by category
    const cat = (label: string, rows: any[]) => ({ category: label, count: rows.length, ...money(this.sum(rows)) });
    const byStatus = (s: string) => payments.filter((p) => p.status === s);
    const fullRefunds = refunds.filter((r) => r.refundType === 'FULL');
    const partialRefunds = refunds.filter((r) => r.refundType !== 'FULL');

    return {
      currency: 'GBP',
      totalRevenue: { ...money(gross), payments: payments.length, paidCases: new Set(payments.map((p) => String(p.caseId))).size },
      refunds: { ...money(refunded), count: refunds.length, full: fullRefunds.length, partial: partialRefunds.length },
      netRevenue: { ...money(net), note: 'Successful payments minus refunds. This is not profit.' },
      paymentsReceived: [
        cat('Successful (not refunded)', byStatus(TransactionStatus.SUCCEEDED)),
        cat('Partially refunded', byStatus(TransactionStatus.PARTIALLY_REFUNDED)),
        cat('Fully refunded', byStatus(TransactionStatus.REFUNDED)),
        cat('Pending', others.filter((o) => ['PENDING', 'INITIATED'].includes(o.status))),
        cat('Failed', others.filter((o) => o.status === TransactionStatus.FAILED)),
        cat('Cancelled / expired', others.filter((o) => o.status === TransactionStatus.CANCELLED)),
      ],
      byService,
      byAgreementType: [...types.entries()]
        .map(([t, e]) => ({
          service: t,
          label: AGREEMENT_TYPE_LABELS[t] || t,
          paidCases: e.cases.size,
          revenue: money(e.revenue),
          percent: gross ? round1((e.revenue / gross) * 100) : 0,
        }))
        .sort((a, b) => b.revenue.amount - a.revenue.amount),
    };
  }

  // Reports 3, 4, 5 and 8: transaction lists. `view` presets the filters for
  // Pending, Failed and Refunds; History shows everything.
  async transactions(f: ReportFilters) {
    const view = String(f.raw.view || 'history');
    const q: any = this.baseMatch(f);
    if (view === 'pending') {
      q.type = TransactionType.PAYMENT;
      q.status = { $in: [TransactionStatus.PENDING, TransactionStatus.INITIATED] };
    } else if (view === 'failed') {
      q.type = TransactionType.PAYMENT;
      q.status = TransactionStatus.FAILED;
    } else if (view === 'refunds') {
      q.type = TransactionType.REFUND;
    } else {
      if (f.transactionType && ['PAYMENT', 'REFUND'].includes(f.transactionType)) q.type = f.transactionType;
      if (f.paymentStatus && STATUS_FILTER[f.paymentStatus]) q.status = { $in: STATUS_FILTER[f.paymentStatus] };
    }
    if (view === 'refunds' && f.raw.refundType && f.raw.refundType !== 'all') {
      q.refundType = String(f.raw.refundType).toUpperCase();
    }

    const [total, rows, totals] = await Promise.all([
      this.txModel.countDocuments(q),
      this.txModel
        .find(q)
        .sort({ occurredAt: -1, _id: -1 })
        .skip((f.page - 1) * f.pageSize)
        .limit(f.pageSize)
        .lean(),
      this.txModel.aggregate([{ $match: q }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
    ]);

    // Original payment amounts for refund rows
    const originals = new Map<string, any>();
    const origIds = rows.filter((r) => r.type === 'REFUND' && r.originalPaymentId).map((r) => r.originalPaymentId);
    if (origIds.length) {
      const list = await this.txModel.find({ _id: { $in: origIds } }).select('transactionId amount currency paidAt').lean();
      list.forEach((o) => originals.set(String(o._id), o));
    }

    return {
      ...paged(
        rows.map((r) => {
          const orig = r.originalPaymentId ? originals.get(String(r.originalPaymentId)) : null;
          return {
            id: String(r._id),
            transactionId: r.transactionId,
            caseId: String(r.caseId),
            caseNumber: r.caseNumber ?? String(r.caseId),
            type: r.type === 'REFUND' ? 'Refund' : 'Payment',
            customerName: r.customerName ?? '—',
            customerEmail: r.customerEmail ?? null,
            service: SERVICE_GROUP_LABELS[(r.serviceGroup || 'UNDECIDED') as ServiceGroup],
            serviceDetail: (r.service && AGREEMENT_TYPE_LABELS[r.service]) || null,
            amount: r.amount,
            amountDisplay: formatMoney(r.amount, r.currency),
            refundedAmount: r.refundedAmount || 0,
            refundedDisplay: r.refundedAmount ? formatMoney(r.refundedAmount, r.currency) : null,
            status: r.status,
            statusLabel:
              r.type === 'REFUND' && r.status === 'SUCCEEDED' ? 'Refunded' : STATUS_LABELS[r.status] || r.status,
            provider: r.provider,
            providerReference: r.providerReference ?? null,
            originalTransactionId: r.originalTransactionId ?? null,
            originalAmountDisplay: orig ? formatMoney(orig.amount, orig.currency) : null,
            originalPaidAt: orig?.paidAt ?? null,
            refundType: r.refundType === 'FULL' ? 'Full' : r.refundType === 'PARTIAL' ? 'Partial' : null,
            refundReason: r.refundReason ?? null,
            failureReason: r.failureReason ?? null,
            failureCode: r.failureCode ?? null,
            initiatedAt: r.initiatedAt ?? r.createdAt,
            failedAt: r.failedAt ?? null,
            refundedAt: r.refundedAt ?? null,
            paidAt: r.paidAt ?? null,
            date: r.occurredAt ?? r.createdAt,
            lastUpdated: r.updatedAt ?? r.createdAt,
            refundable:
              r.type === 'PAYMENT' &&
              ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(r.status) &&
              (r.amount || 0) - (r.refundedAmount || 0) > 0,
            refundableAmount: Math.max((r.amount || 0) - (r.refundedAmount || 0), 0),
          };
        }),
        total,
        f,
      ),
      totalAmount: totals[0]?.amount ?? 0,
      totalAmountDisplay: formatMoney(totals[0]?.amount ?? 0),
    };
  }
}
