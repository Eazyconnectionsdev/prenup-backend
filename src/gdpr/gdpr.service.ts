// GDPR request register. Requests are tracked and answered by staff; nothing
// here deletes or anonymises data automatically. In particular a deletion
// request never removes case records, which may have to be kept for legal
// reasons; staff decide and record the outcome.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { currentActor, userDisplayName } from '../common/request-context';
import { getNextSeq } from '../utils/case-number.util';
import {
  GDPR_REQUEST_STATUSES,
  GDPR_REQUEST_TYPES,
  GDPR_RESPONSE_DAYS,
  GdprRequest,
  GdprRequestDocument,
} from './gdpr-request.schema';

export type CreateGdprInput = {
  type: string;
  userId?: string;
  email?: string;
  userName?: string;
  caseId?: string;
  requestDate?: string;
  notes?: string;
  assignedTo?: string;
};

export type UpdateGdprInput = {
  status?: string;
  assignedTo?: string | null;
  notes?: string;
  note?: string;
};

const oid = (v?: string | null) => (v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null);

@Injectable()
export class GdprService {
  constructor(
    @InjectModel(GdprRequest.name) private readonly model: Model<GdprRequestDocument>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('Counter') private readonly counterModel: Model<any>,
  ) {}

  private async nextId() {
    const year = new Date().getFullYear();
    const seq = await getNextSeq(this.counterModel, `gdpr-${year}`);
    return `GDPR-${year}-${String(seq).padStart(5, '0')}`;
  }

  private async staffName(id?: string | null) {
    if (!id) return null;
    const u = await this.userModel.findById(id).select('firstName middleName lastName email role').lean();
    if (!u) throw new BadRequestException('Assigned staff member not found');
    if (!['superadmin', 'admin', 'case_manager'].includes((u as any).role)) {
      throw new BadRequestException('GDPR requests can only be assigned to staff');
    }
    return userDisplayName(u);
  }

  async create(input: CreateGdprInput, source: 'staff' | 'web') {
    if (!GDPR_REQUEST_TYPES.includes(input.type as any)) {
      throw new BadRequestException('Unknown request type');
    }
    let user: any = null;
    if (input.userId) user = await this.userModel.findById(input.userId).lean();
    else if (input.email) user = await this.userModel.findOne({ email: input.email.trim().toLowerCase() }).lean();

    const email = (user?.email || input.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('An email address is required');

    const requestDate = input.requestDate ? new Date(input.requestDate) : new Date();
    if (isNaN(requestDate.getTime())) throw new BadRequestException('Invalid request date');
    const due = new Date(requestDate.getTime() + GDPR_RESPONSE_DAYS * 86400000);
    const actor = currentActor();

    return this.model.create({
      requestId: await this.nextId(),
      userId: user?._id ?? null,
      userName: user ? userDisplayName(user) : input.userName?.trim() || email,
      email,
      caseId: oid(input.caseId) ?? user?.inviteCaseId ?? null,
      type: input.type,
      requestDate,
      responseDueDate: due,
      assignedTo: oid(input.assignedTo),
      assignedToName: await this.staffName(input.assignedTo),
      status: 'RECEIVED',
      notes: (input.notes || '').slice(0, 5000),
      source,
      history: [
        {
          status: 'RECEIVED',
          note: source === 'web' ? 'Submitted by the user' : 'Logged by staff',
          byId: oid(actor.actorId),
          byName: actor.actorName,
          at: new Date(),
        },
      ],
    });
  }

  async update(id: string, input: UpdateGdprInput) {
    const r = await this.model.findById(id);
    if (!r) throw new NotFoundException('GDPR request not found');
    const actor = currentActor();

    if (input.assignedTo !== undefined) {
      r.assignedTo = oid(input.assignedTo);
      r.assignedToName = await this.staffName(input.assignedTo);
    }
    if (input.notes !== undefined) r.notes = String(input.notes).slice(0, 5000);

    if (input.status && input.status !== r.status) {
      if (!GDPR_REQUEST_STATUSES.includes(input.status as any)) {
        throw new BadRequestException('Unknown status');
      }
      if (['COMPLETED', 'REJECTED'].includes(input.status) && !(input.note || r.notes)) {
        throw new BadRequestException('Add a note explaining the outcome');
      }
      r.status = input.status;
      r.completionDate = ['COMPLETED', 'REJECTED'].includes(input.status) ? new Date() : null;
      r.history.push({
        status: input.status,
        note: input.note?.slice(0, 2000) || null,
        byId: oid(actor.actorId),
        byName: actor.actorName,
        at: new Date(),
      } as any);
    } else if (input.note) {
      r.history.push({
        status: r.status,
        note: input.note.slice(0, 2000),
        byId: oid(actor.actorId),
        byName: actor.actorName,
        at: new Date(),
      } as any);
    }
    await r.save();
    return r;
  }

  async get(id: string) {
    const r = await this.model.findById(id).lean();
    if (!r) throw new NotFoundException('GDPR request not found');
    return r;
  }

  async listForUser(userId: string) {
    return this.model
      .find({ userId: oid(userId) })
      .select('requestId type status requestDate responseDueDate completionDate')
      .sort({ requestDate: -1 })
      .lean();
  }
}
