import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Company, CompanyDocument } from './schemas/company.schema';
import { Lawyer, LawyerDocument } from './schemas/lawyer.schema';
import { Enquiry, EnquiryDocument } from './schemas/enquiry.schema';
import { AdminSettings, AdminSettingsDocument } from './schemas/admin-settings.schema';
import { CompanyAttachment, CompanyAttachmentDocument } from './schemas/company-attachment.schema';
import { CompanyNote, CompanyNoteDocument } from './schemas/company-note.schema';
import { LawyerAttachment, LawyerAttachmentDocument } from './schemas/lawyer-attachment.schema';
import { LawyerNote, LawyerNoteDocument } from './schemas/lawyer-note.schema';

import { CreateLawyerDto } from './dto/create-lawyer.dto';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>,
    @InjectModel(Enquiry.name) private enquiryModel: Model<EnquiryDocument>,
    @InjectModel(AdminSettings.name)
    private adminSettingsModel: Model<AdminSettingsDocument>,
    @InjectModel(CompanyAttachment.name)
    private companyAttachmentModel: Model<CompanyAttachmentDocument>,
    @InjectModel(CompanyNote.name)
    private companyNoteModel: Model<CompanyNoteDocument>,
    @InjectModel(LawyerAttachment.name)
    private lawyerAttachmentModel: Model<LawyerAttachmentDocument>,
    @InjectModel(LawyerNote.name)
    private lawyerNoteModel: Model<LawyerNoteDocument>,
    @InjectModel('Case') private caseModel: Model<any>,
  ) {}

  // =============================================
  // USERS
  // =============================================

  async listUsers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.userModel.find().skip(skip).limit(limit).lean().exec();
    const total = await this.userModel.countDocuments().exec();
    return { total, docs };
  }

  async getUserById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid user id');
    const u = await this.userModel.findById(id).exec();
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async updateUserRole(id: string, role: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid user id');
    const allowed = ['user', 'admin', 'superadmin', 'case_manager'];
    if (!allowed.includes(role)) throw new BadRequestException('Invalid role');
    const updated = await this.userModel
      .findByIdAndUpdate(id, { role }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  async deactivateUser(id: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid user id');
    const updated = await this.userModel
      .findByIdAndUpdate(id, { active: false }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  // =============================================
  // ENQUIRIES
  // =============================================

  async listEnquiries(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.enquiryModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    const total = await this.enquiryModel.countDocuments().exec();
    return { total, docs };
  }

  async createEnquiry(payload: any) {
    const doc = new this.enquiryModel(payload);
    return doc.save();
  }

  // =============================================
  // COMPANIES (Section 2 – with attachments & notes)
  // =============================================

  async listCompanies(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.companyModel.find().skip(skip).limit(limit).lean().exec();
    const total = await this.companyModel.countDocuments().exec();
    return { total, docs };
  }

  async getCompanyById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid company id');
    const company = await this.companyModel.findById(id).lean().exec();
    if (!company) throw new NotFoundException('Company not found');
    const [attachments, notes] = await Promise.all([
      this.companyAttachmentModel.find({ companyId: new Types.ObjectId(id) }).lean().exec(),
      this.companyNoteModel.find({ companyId: new Types.ObjectId(id) }).sort({ createdAt: -1 }).lean().exec(),
    ]);
    return { ...company, attachments, notes };
  }

  async createCompany(payload: Partial<Company>) {
    const doc = new this.companyModel(payload);
    return doc.save();
  }

  async setCompanyVerified(id: string, verified: boolean, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid company id');
    const updated = await this.companyModel
      .findByIdAndUpdate(id, { verified }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Company not found');
    return updated;
  }

  // --- Company Attachments ---

  async addCompanyAttachment(
    companyId: string,
    file: Express.Multer.File,
    fileUrl: string,
    actorId: string,
  ) {
    if (!Types.ObjectId.isValid(companyId))
      throw new BadRequestException('Invalid company id');
    const exists = await this.companyModel.exists({ _id: companyId });
    if (!exists) throw new NotFoundException('Company not found');

    const doc = new this.companyAttachmentModel({
      companyId: new Types.ObjectId(companyId),
      fileName: file.originalname,
      fileUrl,
      mimeType: file.mimetype,
      uploadedBy: actorId ? new Types.ObjectId(actorId) : undefined,
    });
    return doc.save();
  }

  async getCompanyAttachments(companyId: string) {
    if (!Types.ObjectId.isValid(companyId))
      throw new BadRequestException('Invalid company id');
    return this.companyAttachmentModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async deleteCompanyAttachment(companyId: string, attachmentId: string) {
    if (!Types.ObjectId.isValid(attachmentId))
      throw new BadRequestException('Invalid attachment id');
    const deleted = await this.companyAttachmentModel.findOneAndDelete({
      _id: new Types.ObjectId(attachmentId),
      companyId: new Types.ObjectId(companyId),
    });
    if (!deleted) throw new NotFoundException('Attachment not found');
    return { deleted: true };
  }

  // --- Company Notes ---

  async addCompanyNote(companyId: string, content: string, actorId: string) {
    if (!Types.ObjectId.isValid(companyId))
      throw new BadRequestException('Invalid company id');
    const exists = await this.companyModel.exists({ _id: companyId });
    if (!exists) throw new NotFoundException('Company not found');

    const doc = new this.companyNoteModel({
      companyId: new Types.ObjectId(companyId),
      content,
      createdBy: actorId ? new Types.ObjectId(actorId) : undefined,
    });
    return doc.save();
  }

  async getCompanyNotes(companyId: string) {
    if (!Types.ObjectId.isValid(companyId))
      throw new BadRequestException('Invalid company id');
    return this.companyNoteModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async deleteCompanyNote(companyId: string, noteId: string) {
    if (!Types.ObjectId.isValid(noteId))
      throw new BadRequestException('Invalid note id');
    const deleted = await this.companyNoteModel.findOneAndDelete({
      _id: new Types.ObjectId(noteId),
      companyId: new Types.ObjectId(companyId),
    });
    if (!deleted) throw new NotFoundException('Note not found');
    return { deleted: true };
  }

  // =============================================
  // LAWYERS (Section 2 – with attachments & notes)
  // =============================================

  async listLawyers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.lawyerModel
      .find()
      .populate('company')
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    const total = await this.lawyerModel.countDocuments().exec();
    return { total, docs };
  }

  async getLawyerById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const lawyer = await this.lawyerModel.findById(id).populate('company').lean().exec();
    if (!lawyer) throw new NotFoundException('Lawyer not found');
    const [attachments, notes] = await Promise.all([
      this.lawyerAttachmentModel.find({ lawyerId: new Types.ObjectId(id) }).lean().exec(),
      this.lawyerNoteModel.find({ lawyerId: new Types.ObjectId(id) }).sort({ createdAt: -1 }).lean().exec(),
    ]);
    return { ...lawyer, attachments, notes };
  }

  async createLawyer(payload: CreateLawyerDto) {
    if (!payload.company || !Types.ObjectId.isValid(String(payload.company))) {
      throw new BadRequestException('Valid company id required');
    }
    const companyId = new Types.ObjectId(payload.company);
    const companyExists = await this.companyModel.exists({ _id: companyId });
    if (!companyExists) throw new BadRequestException('Company not found');

    const docPayload: Partial<Lawyer> = {
      externalId: payload.externalId,
      name: payload.name,
      priceText: payload.priceText,
      avatarUrl: payload.avatarUrl,
      company: companyId,
      publicEmail: payload.publicEmail,
      publicPhone: payload.publicPhone,
      directEmail: payload.directEmail,
      directPhone: payload.directPhone,
      website: payload.website,
      profileLink: payload.profileLink,
      address: payload.address,
      barNumber: payload.barNumber,
      notes: payload.notes,
    };
    const doc = new this.lawyerModel(docPayload);
    return doc.save();
  }

  async setLawyerVerified(id: string, verified: boolean, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const updated = await this.lawyerModel
      .findByIdAndUpdate(id, { verified }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Lawyer not found');
    return updated;
  }

  async archiveLawyer(id: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const updated = await this.lawyerModel
      .findByIdAndUpdate(id, { status: 'archived' }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Lawyer not found');
    return updated;
  }

  // --- Lawyer Attachments ---

  async addLawyerAttachment(
    lawyerId: string,
    file: Express.Multer.File,
    fileUrl: string,
    actorId: string,
  ) {
    if (!Types.ObjectId.isValid(lawyerId))
      throw new BadRequestException('Invalid lawyer id');
    const exists = await this.lawyerModel.exists({ _id: lawyerId });
    if (!exists) throw new NotFoundException('Lawyer not found');

    const doc = new this.lawyerAttachmentModel({
      lawyerId: new Types.ObjectId(lawyerId),
      fileName: file.originalname,
      fileUrl,
      mimeType: file.mimetype,
      uploadedBy: actorId ? new Types.ObjectId(actorId) : undefined,
    });
    return doc.save();
  }

  async getLawyerAttachments(lawyerId: string) {
    if (!Types.ObjectId.isValid(lawyerId))
      throw new BadRequestException('Invalid lawyer id');
    return this.lawyerAttachmentModel
      .find({ lawyerId: new Types.ObjectId(lawyerId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async deleteLawyerAttachment(lawyerId: string, attachmentId: string) {
    if (!Types.ObjectId.isValid(attachmentId))
      throw new BadRequestException('Invalid attachment id');
    const deleted = await this.lawyerAttachmentModel.findOneAndDelete({
      _id: new Types.ObjectId(attachmentId),
      lawyerId: new Types.ObjectId(lawyerId),
    });
    if (!deleted) throw new NotFoundException('Attachment not found');
    return { deleted: true };
  }

  // --- Lawyer Notes ---

  async addLawyerNote(lawyerId: string, content: string, actorId: string) {
    if (!Types.ObjectId.isValid(lawyerId))
      throw new BadRequestException('Invalid lawyer id');
    const exists = await this.lawyerModel.exists({ _id: lawyerId });
    if (!exists) throw new NotFoundException('Lawyer not found');

    const doc = new this.lawyerNoteModel({
      lawyerId: new Types.ObjectId(lawyerId),
      content,
      createdBy: actorId ? new Types.ObjectId(actorId) : undefined,
    });
    return doc.save();
  }

  async getLawyerNotes(lawyerId: string) {
    if (!Types.ObjectId.isValid(lawyerId))
      throw new BadRequestException('Invalid lawyer id');
    return this.lawyerNoteModel
      .find({ lawyerId: new Types.ObjectId(lawyerId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async deleteLawyerNote(lawyerId: string, noteId: string) {
    if (!Types.ObjectId.isValid(noteId))
      throw new BadRequestException('Invalid note id');
    const deleted = await this.lawyerNoteModel.findOneAndDelete({
      _id: new Types.ObjectId(noteId),
      lawyerId: new Types.ObjectId(lawyerId),
    });
    if (!deleted) throw new NotFoundException('Note not found');
    return { deleted: true };
  }

  // =============================================
  // ADMIN SETTINGS (Section 1 – TopBar)
  // =============================================

  /** Returns the singleton settings document (creates with defaults if absent). */
  async getAdminSettings() {
    const existing = await this.adminSettingsModel.findOne({ key: 'singleton' }).lean().exec();
    if (existing) return existing;
    const created = new this.adminSettingsModel({ key: 'singleton' });
    await created.save();
    return this.adminSettingsModel.findOne({ key: 'singleton' }).lean().exec();
  }

  /** Partial-patch any combination of topBar fields. */
  async updateAdminSettings(dto: UpdateAdminSettingsDto) {
    const update: Record<string, boolean> = {};
    if (dto.topBar1Enabled !== undefined) update['topBar1Enabled'] = dto.topBar1Enabled;
    if (dto.topBar1Toggle !== undefined)  update['topBar1Toggle']  = dto.topBar1Toggle;
    if (dto.topBar2Enabled !== undefined) update['topBar2Enabled'] = dto.topBar2Enabled;
    if (dto.topBar2Toggle !== undefined)  update['topBar2Toggle']  = dto.topBar2Toggle;

    return this.adminSettingsModel.findOneAndUpdate(
      { key: 'singleton' },
      { $set: update },
      { new: true, upsert: true },
    ).lean().exec();
  }

  // =============================================
  // DASHBOARD  (mirrors Case-Manager)
  // =============================================

  async getDashboard() {
    const [
      totalCases,
      activeCases,
      completedCases,
      totalUsers,
      totalLawyers,
      totalCompanies,
    ] = await Promise.all([
      this.caseModel.countDocuments().exec(),
      this.caseModel.countDocuments({ workflowStatus: { $nin: ['COMPLETED', 'ARCHIVED', 'CANCELLED'] } }).exec(),
      this.caseModel.countDocuments({ workflowStatus: 'COMPLETED' }).exec(),
      this.userModel.countDocuments().exec(),
      this.lawyerModel.countDocuments().exec(),
      this.companyModel.countDocuments().exec(),
    ]);

    return {
      totalCases,
      activeCases,
      completedCases,
      totalUsers,
      totalLawyers,
      totalCompanies,
    };
  }

  async getStageSummary() {
    const pipeline = [
      { $group: { _id: '$workflowStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];
    return this.caseModel.aggregate(pipeline as any).exec();
  }

  async getCasesByStatus(status: string) {
    return this.caseModel
      .find({ workflowStatus: status })
      .populate('owner invitedUser assignedCaseManager')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  // =============================================
  // CASES  (mirrors Case-Manager – admin sees all)
  // =============================================

  async getAllCases(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.caseModel
      .find()
      .populate('owner invitedUser assignedCaseManager')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    const total = await this.caseModel.countDocuments().exec();
    return { total, docs };
  }

  async getCaseById(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    const c = await this.caseModel
      .findById(caseId)
      .populate('owner invitedUser assignedCaseManager')
      .lean()
      .exec();
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  // =============================================
  // REPORTS
  // =============================================

  async getReports(from?: string, to?: string) {
    const match: Record<string, any> = {};
    if (from || to) {
      match['createdAt'] = {};
      if (from) match['createdAt']['$gte'] = new Date(from);
      if (to)   match['createdAt']['$lte'] = new Date(to);
    }

    const [casesByStatus, newCasesOverTime, lawyerAssignments] = await Promise.all([
      // Cases grouped by workflow status
      this.caseModel.aggregate([
        { $match: match },
        { $group: { _id: '$workflowStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).exec(),

      // New cases per day
      this.caseModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).exec(),

      // Lawyer assignment counts
      this.caseModel.aggregate([
        { $match: match },
        { $unwind: { path: '$assignedLawyers', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$assignedLawyers', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from: 'lawyers',
            localField: '_id',
            foreignField: '_id',
            as: 'lawyer',
          },
        },
        { $unwind: { path: '$lawyer', preserveNullAndEmptyArrays: true } },
        { $project: { lawyerName: '$lawyer.name', count: 1 } },
      ]).exec(),
    ]);

    return {
      casesByStatus,
      newCasesOverTime,
      lawyerAssignments,
    };
  }
}