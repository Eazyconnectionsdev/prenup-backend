
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { Company, CompanyDocument, COMPANY_FILE_CATEGORIES } from './schemas/company.schema';
import { Lawyer, LawyerDocument, LAWYER_FILE_CATEGORIES } from './schemas/lawyer.schema';
import { Enquiry, EnquiryDocument } from './schemas/enquiry.schema';
import { CreateLawyerDto } from './dto/create-lawyer.dto';
import { CreateLawyerDocumentDto } from './dto/create-lawyer-document.dto';
import { CreateCaseManagerDto } from './dto/create-case-manager.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateCompanyDocumentDto } from './dto/create-company-document.dto';
import { S3Service } from '../common/s3.service';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Case, CaseDocument, CaseWorkflowStatus } from '../cases/schemas/case.schema';
import { Settings, SettingsDocument } from './schemas/settings.schema';

export const MAX_COMPANY_FILE_BYTES = 10 * 1024 * 1024;

// Allowed company document types, keyed by extension. The stored content type
// comes from here, not from what the client claims.
const COMPANY_FILE_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export const MAX_LAWYER_PHOTO_BYTES = 5 * 1024 * 1024;

const LAWYER_PHOTO_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const COMPANY_REQUIRED_FIELDS = [
  'name', 'companyType', 'status', 'email', 'phone',
  'addressLine1', 'city', 'postcode', 'country',
] as const;

// Optional fields a blank form value clears.
const COMPANY_OPTIONAL_FIELDS = [
  'companyNumber', 'regulatoryBody', 'regulatoryNumber', 'vatNumber', 'website',
  'description', 'contactFirstName', 'contactLastName', 'addressLine2', 'county',
  'notes', 'photoUrl',
] as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>,
    @InjectModel(Enquiry.name) private enquiryModel: Model<EnquiryDocument>,
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    private s3Service: S3Service,
    private config: ConfigService,
    private authService: AuthService,
    private mailService: MailService,
  ) {}


  // ---------------- Dashboard -----------------
  async getDashboard() {
    const [
      totalUsers,
      totalCases,
      totalLawyers,
      totalCompanies,
      totalEnquiries,

      notPaid,
      draft,
      coupleSubmitted,
      cmApproved,
      lawyersAssigned,
      preLawyerPending,
      preLawyerCompleted,
      lawyerClientConfirmation,
      lawyerReview,
      lawyerReviewCompleted,
      lawyerIlaPending,
      lawyerSignoffComplete,
      completed,
      cancelled,
      archived,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.caseModel.countDocuments(),
      this.lawyerModel.countDocuments(),
      this.companyModel.countDocuments(),
      this.enquiryModel.countDocuments(),

      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.NOT_PAID }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.DRAFT }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.COUPLE_SUBMITTED }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.CM_APPROVED }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.LAWYERS_ASSIGNED }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.PRE_LAWYER_PENDING }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.PRE_LAWYER_COMPLETED }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.LAWYER_CLIENT_CONFIRMATION }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.LAWYER_REVIEW }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.LAWYER_REVIEW_COMPLETED }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.LAWYER_ILA_PENDING }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.LAWYER_SIGNOFF_COMPLETE }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.COMPLETED }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.CANCELLED }),
      this.caseModel.countDocuments({ workflowStatus: CaseWorkflowStatus.ARCHIVED }),
    ]);

    return {
      totals: {
        users: totalUsers,
        cases: totalCases,
        lawyers: totalLawyers,
        companies: totalCompanies,
        enquiries: totalEnquiries,
      },
      cases: {
        byStatus: {
          notPaid,
          draft,
          coupleSubmitted,
          cmApproved,
          lawyersAssigned,
          preLawyerPending,
          preLawyerCompleted,
          lawyerClientConfirmation,
          lawyerReview,
          lawyerReviewCompleted,
          lawyerIlaPending,
          lawyerSignoffComplete,
          completed,
          cancelled,
          archived,
        },
        activeCases:
          totalCases - completed - cancelled - archived,
      },
    };
  }

  async getDashboardStages() {
    const statuses = Object.values(CaseWorkflowStatus);

    const counts = await Promise.all(
      statuses.map((status) =>
        this.caseModel.countDocuments({ workflowStatus: status }),
      ),
    );

    const stages = statuses.map((status, i) => ({
      status,
      count: counts[i],
    }));

    return { stages };
  }

  async getCasesByStage(status: string, page = 1, limit = 20) {
    const normalized = (status || '').toUpperCase();
    const validStatuses = Object.values(CaseWorkflowStatus) as string[];

    // Filter options that are not a workflowStatus of their own.
    const derivedFilters: Record<string, any> = {
      RETURNED_TO_DRAFT: {
        workflowStatus: CaseWorkflowStatus.DRAFT,
        cmReturnReason: { $nin: [null, ''] },
      },
      EXECUTION_PACK_GENERATED: { executionPackGenerated: true },
    };

    let query: any;
    if (derivedFilters[normalized]) {
      query = derivedFilters[normalized];
    } else if (validStatuses.includes(normalized)) {
      query = { workflowStatus: normalized };
    } else {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this.caseModel
        .find(query)
        .populate('owner', 'firstName lastName email')
        .populate('invitedUser', 'firstName lastName email')
        .populate('assignedCaseManager', 'firstName lastName email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.caseModel.countDocuments(query),
    ]);

    return { total, page, limit, status: normalized, docs };
  }

  // ---------------- Cases -----------------
  async listCases(page = 1, limit = 50, status?: string, search?: string) {
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (status) {
      const normalized = status.toUpperCase();
      const validStatuses = Object.values(CaseWorkflowStatus) as string[];
      if (!validStatuses.includes(normalized)) {
        throw new BadRequestException(`Invalid status: ${status}`);
      }
      filter.workflowStatus = normalized;
    }

    if (search?.trim()) {
      filter.$or = [
        { caseNumber: { $regex: search.trim(), $options: 'i' } },
        { title:      { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const [docs, total] = await Promise.all([
      this.caseModel
        .find(filter)
        .populate('owner', 'firstName lastName email')
        .populate('invitedUser', 'firstName lastName email')
        .populate('assignedCaseManager', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.caseModel.countDocuments(filter),
    ]);

    return { total, page, limit, docs };
  }

  // ---------------- Users -----------------
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
  // COMPANIES
  // =============================================

  async listCompanies(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.companyModel
      .find()
      .populate('createdBy', 'firstName lastName email')
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    const total = await this.companyModel.countDocuments().exec();
    return { total, docs };
  }

  async getCompanyById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid company id');
    const doc = await this.companyModel
      .findById(id)
      .populate('createdBy', 'firstName lastName email')
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Company not found');
    return doc;
  }

  /** Trims the form values and splits them into fields to set and fields to clear. */
  private buildCompanyFields(dto: CreateCompanyDto) {
    const set: Record<string, string> = {};
    const unset: Record<string, ''> = {};

    for (const key of COMPANY_REQUIRED_FIELDS) set[key] = String(dto[key]).trim();
    for (const key of COMPANY_OPTIONAL_FIELDS) {
      const value = dto[key]?.trim();
      if (value) set[key] = value;
      else unset[key] = '';
    }

    set.address = [set.addressLine1, set.addressLine2, set.city, set.county, set.postcode, set.country]
      .filter(Boolean)
      .join(', ');
    return { set, unset };
  }

  async createCompany(payload: CreateCompanyDto, actorId: string) {
    const { set } = this.buildCompanyFields(payload);
    const doc = new this.companyModel({
      ...set,
      createdBy: Types.ObjectId.isValid(String(actorId)) ? new Types.ObjectId(String(actorId)) : undefined,
    });
    return doc.save();
  }

  async updateCompany(id: string, payload: CreateCompanyDto) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid company id');
    const { set, unset } = this.buildCompanyFields(payload);
    const updated = await this.companyModel
      .findByIdAndUpdate(
        id,
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { new: true, runValidators: true },
      )
      .populate('createdBy', 'firstName lastName email')
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Company not found');
    return updated;
  }

  // ---------------- Stored documents (companies and lawyers) -----------------
  private async addStoredDocument(
    model: Model<any>,
    folder: string,
    categories: readonly string[],
    ownerId: string,
    file: Express.Multer.File | undefined,
    dto: { title: string; category: string; issueDate?: string; expiryDate?: string; notes?: string },
    actorId: string,
  ) {
    if (!Types.ObjectId.isValid(ownerId)) throw new BadRequestException('Invalid id');
    if (!file) throw new BadRequestException('A file is required');
    if (file.size > MAX_COMPANY_FILE_BYTES) throw new BadRequestException('File is larger than 10 MB');
    if (!categories.includes(dto.category)) throw new BadRequestException('Invalid document category');

    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = COMPANY_FILE_TYPES[ext];
    if (!mimeType) {
      throw new BadRequestException('Unsupported file type. Upload a PDF, Word document, PNG or JPG');
    }

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : undefined;
    const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : undefined;
    if (issueDate && expiryDate && expiryDate < issueDate) {
      throw new BadRequestException('Expiry date cannot be before the issue date');
    }

    if (!(await model.exists({ _id: ownerId }))) throw new NotFoundException('Record not found');

    const fileName = path.basename(file.originalname).slice(0, 200);
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `${folder}/${ownerId}/${randomUUID()}-${safeName}`;
    await this.s3Service.putToBucket(file.buffer, fileKey, mimeType);

    const entry = {
      _id: new Types.ObjectId(),
      title: dto.title.trim(),
      category: dto.category,
      fileName,
      fileKey,
      mimeType,
      fileSize: file.size,
      issueDate,
      expiryDate,
      notes: dto.notes?.trim() || undefined,
      uploadedBy: Types.ObjectId.isValid(String(actorId)) ? new Types.ObjectId(String(actorId)) : undefined,
      createdAt: new Date(),
    };
    const result = await model.updateOne({ _id: ownerId }, { $push: { documents: entry } }).exec();
    if (!result.matchedCount) {
      // The record was deleted between the check and the write; don't leave the file behind.
      await this.s3Service.deleteFromBucket(fileKey).catch(() => undefined);
      throw new NotFoundException('Record not found');
    }
    return entry;
  }

  private async findStoredDocument(model: Model<any>, ownerId: string, docId: string) {
    if (!Types.ObjectId.isValid(ownerId) || !Types.ObjectId.isValid(docId)) {
      throw new BadRequestException('Invalid id');
    }
    const owner: any = await model
      .findOne({ _id: ownerId, 'documents._id': docId }, { 'documents.$': 1 })
      .lean()
      .exec();
    const entry = owner?.documents?.[0];
    if (!entry) throw new NotFoundException('Document not found');
    return entry;
  }

  private async removeStoredDocument(model: Model<any>, ownerId: string, docId: string) {
    const entry = await this.findStoredDocument(model, ownerId, docId);
    await model.updateOne({ _id: ownerId }, { $pull: { documents: { _id: docId } } }).exec();
    try {
      await this.s3Service.deleteFromBucket(entry.fileKey);
    } catch (err) {
      // The record is already gone; an orphaned object is harmless, a failed request is not.
      this.logger.warn(`Could not delete ${entry.fileKey} from S3: ${(err as Error).message}`);
    }
    return { success: true };
  }

  private async readStoredDocument(model: Model<any>, ownerId: string, docId: string) {
    const entry = await this.findStoredDocument(model, ownerId, docId);
    const buffer = await this.s3Service.getFromBucket(entry.fileKey);
    return { buffer, fileName: entry.fileName as string, mimeType: (entry.mimeType as string) || 'application/octet-stream' };
  }

  addCompanyDocument(companyId: string, file: Express.Multer.File | undefined, dto: CreateCompanyDocumentDto, actorId: string) {
    return this.addStoredDocument(this.companyModel, 'company-documents', COMPANY_FILE_CATEGORIES, companyId, file, dto, actorId);
  }
  deleteCompanyDocument(companyId: string, docId: string) {
    return this.removeStoredDocument(this.companyModel, companyId, docId);
  }
  getCompanyDocumentFile(companyId: string, docId: string) {
    return this.readStoredDocument(this.companyModel, companyId, docId);
  }

  async setCompanyVerified(id: string, verified: boolean, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid company id');
    const updated = await this.companyModel
      .findByIdAndUpdate(id, { verified }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Company not found');
    return updated;
  }

  addLawyerDocument(lawyerId: string, file: Express.Multer.File | undefined, dto: CreateLawyerDocumentDto, actorId: string) {
    return this.addStoredDocument(this.lawyerModel, 'lawyer-documents', LAWYER_FILE_CATEGORIES, lawyerId, file, dto, actorId);
  }
  deleteLawyerDocument(lawyerId: string, docId: string) {
    return this.removeStoredDocument(this.lawyerModel, lawyerId, docId);
  }
  getLawyerDocumentFile(lawyerId: string, docId: string) {
    return this.readStoredDocument(this.lawyerModel, lawyerId, docId);
  }

  // ---------------- Lawyers -----------------

  /** Admin views of a lawyer also carry the documents and internal notes that queries hide by default. */
  private lawyerAdminQuery<T>(query: T): T {
    return (query as any)
      .select('+documents +internalNotes')
      .populate({ path: 'company', select: '-documents' })
      .populate('createdById', 'firstName lastName email');
  }

  /** Adds each lawyer's portal account (status, last login) so the UI can show account and invitation state. */
  private async withAccounts<T extends { user?: any; userId?: any }>(lawyers: T[]) {
    const ids = lawyers.map((l) => l.user ?? l.userId).filter(Boolean);
    const users = ids.length
      ? await this.userModel.find({ _id: { $in: ids } }, 'email active emailVerified lastLoginAt').lean().exec()
      : [];
    const byId = new Map(users.map((u: any) => [String(u._id), u]));
    return lawyers.map((l) => {
      const u: any = byId.get(String(l.user ?? l.userId ?? ''));
      return {
        ...l,
        account: u
          ? { _id: u._id, email: u.email, active: u.active !== false, emailVerified: !!u.emailVerified, lastLoginAt: u.lastLoginAt ?? null }
          : null,
      };
    });
  }

  async listLawyers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.lawyerAdminQuery(this.lawyerModel.find()).skip(skip).limit(limit).lean().exec();
    const total = await this.lawyerModel.countDocuments().exec();
    return { total, docs: await this.withAccounts(docs as any[]) };
  }

  async getLawyerById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const doc = await this.lawyerAdminQuery(this.lawyerModel.findById(id)).lean().exec();
    if (!doc) throw new NotFoundException('Lawyer not found');
    return (await this.withAccounts([doc as any]))[0];
  }

  private async assertCompanyExists(company: string) {
    if (!Types.ObjectId.isValid(String(company))) throw new BadRequestException('Valid company id required');
    const companyId = new Types.ObjectId(company);
    const found: any = await this.companyModel.findById(companyId, 'name').lean().exec();
    if (!found) throw new BadRequestException('Company not found');
    return { companyId, companyName: found.name as string };
  }

  /** Trims the form values and splits them into fields to set and fields to clear. */
  private buildLawyerFields(dto: CreateLawyerDto, current?: any) {
    const set: Record<string, any> = {};
    const unset: Record<string, ''> = {};
    const put = (key: string, value: string | undefined, mirror?: string) => {
      const v = value?.trim();
      for (const k of mirror ? [key, mirror] : [key]) {
        if (v) set[k] = v;
        else unset[k] = '';
      }
    };

    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const middleName = dto.middleName?.trim();
    set.firstName = firstName;
    set.lastName = lastName;
    set.name = [firstName, middleName, lastName].filter(Boolean).join(' ');
    set.jobTitle = dto.jobTitle.trim();
    set.workEmail = dto.workEmail.trim().toLowerCase();
    set.directEmail = set.workEmail; // read by older code (e.g. the login-account helper)

    put('middleName', dto.middleName);
    put('officeBranch', dto.officeBranch);
    put('regulatoryBody', dto.regulatoryBody);
    put('registrationNumber', dto.registrationNumber, 'barNumber');
    put('practisingStatus', dto.practisingStatus);
    put('jurisdiction', dto.jurisdiction);
    put('qualifications', dto.qualifications);
    put('priceText', dto.priceText);
    put('workPhone', dto.workPhone, 'directPhone');
    put('mobilePhone', dto.mobilePhone);
    put('internalNotes', dto.internalNotes);

    // Active / Inactive maps onto the existing availability status. An archived
    // lawyer stays archived unless the admin sets them Active again.
    if (dto.lawyerStatus === 'active') set.status = 'available';
    else if (current?.status !== 'archived') set.status = 'unavailable';

    // The public email follows the work email unless an admin set a different one.
    const previousWork = current?.workEmail ?? current?.directEmail;
    if (!current?.publicEmail || current.publicEmail === previousWork) set.publicEmail = set.workEmail;

    return { set, unset };
  }

  private async findLawyerUser(lawyer: any) {
    const linked = lawyer.user ?? lawyer.userId;
    if (linked) {
      const user = await this.userModel.findById(linked).exec();
      if (user) return user;
    }
    return this.userModel.findOne({ lawyerProfile: lawyer._id }).exec();
  }

  private duplicateEmailError(email: string) {
    return new BadRequestException(`A user account with email "${email}" already exists`);
  }

  private async insertLawyerUser(dto: CreateLawyerDto, lawyerId: Types.ObjectId) {
    const email = dto.workEmail.trim().toLowerCase();
    if (!dto.password) {
      throw new BadRequestException("A password is required to create the lawyer's portal account");
    }
    if (await this.userModel.exists({ email })) throw this.duplicateEmailError(email);
    try {
      return await this.userModel.create({
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        firstName: dto.firstName.trim(),
        middleName: dto.middleName?.trim() || null,
        lastName: dto.lastName.trim(),
        phone: dto.mobilePhone?.trim() || dto.workPhone?.trim() || null,
        role: 'lawyer',
        emailVerified: true, // admin-created accounts are pre-verified
        acceptedTerms: true,
        active: dto.accountStatus === 'active',
        lawyerProfile: lawyerId,
      });
    } catch (err: any) {
      if (err?.code === 11000) throw this.duplicateEmailError(email);
      throw err;
    }
  }

  /** Sends the welcome email (sign-in link + one-time password link) and records the invitation. */
  private async sendLawyerWelcomeEmail(lawyerId: Types.ObjectId, user: any, name: string, companyName: string) {
    try {
      const hours = Number(this.config.get('INVITE_TOKEN_EXPIRY_HOURS') || 72);
      const setPasswordUrl = await this.authService.createPasswordSetupLink(user, hours);
      const baseUrl = String(this.config.get('APP_BASE_URL') || this.config.get('FRONTEND_URL') || '').replace(/\/+$/, '');
      await this.mailService.sendLawyerWelcome(user.email, {
        name,
        companyName,
        loginUrl: `${baseUrl}/login`,
        setPasswordUrl,
        expiryHours: hours,
      });
      await this.lawyerModel
        .updateOne({ _id: lawyerId }, { $set: { invitationStatus: 'sent', invitationSentAt: new Date() } })
        .exec();
      return { requested: true, sent: true };
    } catch (err) {
      this.logger.error(`Welcome email to ${user.email} failed: ${(err as Error).message}`);
      return { requested: true, sent: false, error: 'The welcome email could not be sent.' };
    }
  }

  /**
   * Create a lawyer profile AND its login account (User with role=lawyer).
   * The account is pre-verified; the email and password are required.
   * Both documents are cross-linked (Lawyer.user / userId, User.lawyerProfile).
   */
  async createLawyer(payload: CreateLawyerDto, actorId: string) {
    const { companyId, companyName } = await this.assertCompanyExists(payload.company);
    const lawyerId = new Types.ObjectId();
    const user = await this.insertLawyerUser(payload, lawyerId);

    const { set } = this.buildLawyerFields(payload);
    try {
      await this.lawyerModel.create({
        ...set,
        _id: lawyerId,
        externalId: `LAW-${randomUUID().slice(0, 8).toUpperCase()}`,
        company: companyId,
        user: user._id,
        userId: user._id,
        createdBy: 'admin',
        createdById: Types.ObjectId.isValid(String(actorId)) ? new Types.ObjectId(String(actorId)) : undefined,
      });
    } catch (err) {
      await this.userModel.deleteOne({ _id: user._id }).exec(); // no login without a profile
      throw err;
    }

    const welcomeEmail = payload.sendWelcomeEmail
      ? await this.sendLawyerWelcomeEmail(lawyerId, user, set.name, companyName)
      : { requested: false, sent: false };
    return { lawyer: await this.getLawyerById(String(lawyerId)), welcomeEmail };
  }

  async updateLawyer(id: string, payload: CreateLawyerDto) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const current: any = await this.lawyerModel.findById(id).lean().exec();
    if (!current) throw new NotFoundException('Lawyer not found');

    const { companyId, companyName } = await this.assertCompanyExists(payload.company);
    const email = payload.workEmail.trim().toLowerCase();
    let user: any = await this.findLawyerUser(current);

    const link: Record<string, any> = {};
    if (!user) {
      // A profile that has no login yet gets one now, so the password is required here.
      user = await this.insertLawyerUser(payload, current._id);
      link.user = user._id;
      link.userId = user._id;
    } else {
      if (email !== user.email && (await this.userModel.exists({ email, _id: { $ne: user._id } }))) {
        throw this.duplicateEmailError(email);
      }
      const userSet: Record<string, any> = {
        email,
        firstName: payload.firstName.trim(),
        middleName: payload.middleName?.trim() || null,
        lastName: payload.lastName.trim(),
        phone: payload.mobilePhone?.trim() || payload.workPhone?.trim() || null,
        active: payload.accountStatus === 'active',
      };
      if (payload.password) {
        userSet.passwordHash = await bcrypt.hash(payload.password, 10);
        // A new password retires any pending "choose a password" link.
        userSet.resetPasswordToken = null;
        userSet.resetPasswordExpires = null;
      }
      try {
        await this.userModel.updateOne({ _id: user._id }, { $set: userSet }).exec();
      } catch (err: any) {
        if (err?.code === 11000) throw this.duplicateEmailError(email);
        throw err;
      }
      user.email = email;
    }

    const { set, unset } = this.buildLawyerFields(payload, current);
    // The form's internal notes replace the older free-text notes.
    unset.notes = '';
    await this.lawyerModel
      .updateOne(
        { _id: id },
        { $set: { ...set, ...link, company: companyId }, $unset: unset },
        { runValidators: true },
      )
      .exec();

    const welcomeEmail = payload.sendWelcomeEmail
      ? await this.sendLawyerWelcomeEmail(current._id, user, set.name, companyName)
      : { requested: false, sent: false };
    return { lawyer: await this.getLawyerById(id), welcomeEmail };
  }

  // ---------------- Lawyer photo -----------------
  async setLawyerPhoto(id: string, file: Express.Multer.File | undefined) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    if (!file) throw new BadRequestException('A photo is required');
    if (file.size > MAX_LAWYER_PHOTO_BYTES) throw new BadRequestException('Photo is larger than 5 MB');
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = LAWYER_PHOTO_TYPES[ext];
    if (!mimeType) throw new BadRequestException('Unsupported image type. Upload a PNG, JPG or WebP');

    const current: any = await this.lawyerModel.findById(id, 'photoKey').lean().exec();
    if (!current) throw new NotFoundException('Lawyer not found');

    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const photoKey = `lawyer-photos/${id}/${randomUUID()}-${safeName}`;
    await this.s3Service.putToBucket(file.buffer, photoKey, mimeType);
    await this.lawyerModel.updateOne({ _id: id }, { $set: { photoKey, photoMimeType: mimeType } }).exec();
    if (current.photoKey) await this.s3Service.deleteFromBucket(current.photoKey).catch(() => undefined);
    return { photoKey };
  }

  async removeLawyerPhoto(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const current: any = await this.lawyerModel.findById(id, 'photoKey').lean().exec();
    if (!current) throw new NotFoundException('Lawyer not found');
    await this.lawyerModel.updateOne({ _id: id }, { $unset: { photoKey: '', photoMimeType: '' } }).exec();
    if (current.photoKey) await this.s3Service.deleteFromBucket(current.photoKey).catch(() => undefined);
    return { success: true };
  }

  async getLawyerPhoto(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const current: any = await this.lawyerModel.findById(id, 'photoKey photoMimeType').lean().exec();
    if (!current?.photoKey) throw new NotFoundException('No photo');
    const buffer = await this.s3Service.getFromBucket(current.photoKey);
    return { buffer, mimeType: (current.photoMimeType as string) || 'application/octet-stream' };
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

  // ---------------- Case Managers -----------------

  async listCaseManagers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.userModel.find({ role: 'case_manager' }).skip(skip).limit(limit).lean().exec();
    const total = await this.userModel.countDocuments({ role: 'case_manager' }).exec();
    return { total, docs };
  }

  /**
   * Create a Case Manager user account.
   * Account is created with role=case_manager, emailVerified=true so they can log in immediately.
   */
  async createCaseManager(payload: CreateCaseManagerDto) {
    const normalizedEmail = payload.email?.toLowerCase?.()?.trim();
    if (!normalizedEmail) throw new BadRequestException('Email is required');

    const existing = await this.userModel.findOne({ email: normalizedEmail }).lean().exec();
    if (existing) {
      throw new BadRequestException(`A user account with email "${normalizedEmail}" already exists`);
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    const rawJur = payload.primaryJurisdiction ?? payload.jurisdiction ?? 'England';
    const jurisdictionValue = Array.isArray(rawJur) ? rawJur.join(', ') : String(rawJur || 'England');

    const userDoc = await new this.userModel({
      email: normalizedEmail,
      passwordHash,
      firstName: payload.firstName,
      lastName: payload.lastName || null,
      phone: payload.phone || null,
      jurisdiction: jurisdictionValue,
      primaryJurisdiction: jurisdictionValue,
      role: 'case_manager',
      emailVerified: true,    // admin-created — pre-verified
      acceptedTerms: true,
    }).save();

    return {
      _id: userDoc._id,
      email: userDoc.email,
      firstName: userDoc.firstName,
      lastName: userDoc.lastName,
      role: userDoc.role,
      jurisdiction: userDoc.jurisdiction,
      primaryJurisdiction: userDoc.primaryJurisdiction,
    };
  }

  /**
   * Update a Case Manager's assigned jurisdiction.
   */
  async updateCaseManagerJurisdiction(
    userId: string,
    jurisdiction: string,
    primaryJurisdiction?: string,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const value = (jurisdiction || primaryJurisdiction || 'England').trim();

    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            jurisdiction: value,
            primaryJurisdiction: value,
          },
        },
        { new: true },
      )
      .select('-passwordHash')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('Case manager not found');
    }

    return user;
  }



  /** Returns the singleton site settings document, creating default values if needed. */
  async getSettings(): Promise<SettingsDocument> {
    let doc = await this.settingsModel.findOne({ singleton: 1 }).exec();
    if (!doc) {
      doc = await this.settingsModel.create({
        singleton: 1,
        topBar1Enabled: true,
        topBar1Text: '',
        topBar2Enabled: true,
        topBar2Text: '',
        topBar: [
          { key: 'topBar1', element: 'TopBar-1 Navigation', enabled: true, text: '' },
          { key: 'topBar2', element: 'TopBar-2 Navigation', enabled: true, text: '' },
        ],
      });
    } else if (!doc.topBar || doc.topBar.length === 0) {
      doc.topBar = [
        { key: 'topBar1', element: 'TopBar-1 Navigation', enabled: doc.topBar1Enabled ?? true, text: doc.topBar1Text ?? '' },
        { key: 'topBar2', element: 'TopBar-2 Navigation', enabled: doc.topBar2Enabled ?? true, text: doc.topBar2Text ?? '' },
      ];
      await doc.save();
    }
    return doc;
  }

  /**
   * Updates site settings, supporting both topBar list and flat topBar fields.
   */
  async updateSettings(body: any): Promise<SettingsDocument> {
    const update: any = {};

    if (body.topBar1Enabled !== undefined) update.topBar1Enabled = Boolean(body.topBar1Enabled);
    if (body.topBar1Text !== undefined) update.topBar1Text = String(body.topBar1Text);
    if (body.topBar2Enabled !== undefined) update.topBar2Enabled = Boolean(body.topBar2Enabled);
    if (body.topBar2Text !== undefined) update.topBar2Text = String(body.topBar2Text);

    if (body.topBar !== undefined) {
      if (!Array.isArray(body.topBar)) {
        throw new BadRequestException('topBar must be an array');
      }

      const formattedTopBar = body.topBar.map((item: any, idx: number) => {
        const key = item.key || item.element || `topBar${idx + 1}`;
        const element = item.element || item.key || `TopBar-${idx + 1} Navigation`;
        const enabled = Boolean(item.enabled);
        const text = typeof item.text === 'string' ? item.text : '';
        return { key, element, enabled, text };
      });

      update.topBar = formattedTopBar;

      // Sync topBar1 and topBar2 properties if present
      const item1 = formattedTopBar.find((i: any) => i.key === 'topBar1' || i.element?.includes('1'));
      if (item1) {
        update.topBar1Enabled = item1.enabled;
        update.topBar1Text = item1.text;
      }
      const item2 = formattedTopBar.find((i: any) => i.key === 'topBar2' || i.element?.includes('2'));
      if (item2) {
        update.topBar2Enabled = item2.enabled;
        update.topBar2Text = item2.text;
      }
    } else if (
      body.topBar1Enabled !== undefined ||
      body.topBar1Text !== undefined ||
      body.topBar2Enabled !== undefined ||
      body.topBar2Text !== undefined
    ) {
      const current = await this.getSettings();
      const currentTopBar = current.topBar && current.topBar.length > 0 ? (current.topBar as any) : [
        { key: 'topBar1', element: 'TopBar-1 Navigation', enabled: true, text: '' },
        { key: 'topBar2', element: 'TopBar-2 Navigation', enabled: true, text: '' },
      ];

      update.topBar = currentTopBar.map((tb: any) => {
        if (tb.key === 'topBar1' || tb.element?.includes('1')) {
          return {
            key: tb.key,
            element: tb.element,
            enabled: body.topBar1Enabled !== undefined ? Boolean(body.topBar1Enabled) : tb.enabled,
            text: body.topBar1Text !== undefined ? String(body.topBar1Text) : tb.text,
          };
        }
        if (tb.key === 'topBar2' || tb.element?.includes('2')) {
          return {
            key: tb.key,
            element: tb.element,
            enabled: body.topBar2Enabled !== undefined ? Boolean(body.topBar2Enabled) : tb.enabled,
            text: body.topBar2Text !== undefined ? String(body.topBar2Text) : tb.text,
          };
        }
        return tb;
      });
    }

    const doc = await this.settingsModel
      .findOneAndUpdate(
        { singleton: 1 },
        { $set: update },
        { upsert: true, new: true },
      )
      .exec();

    if (!doc) {
      throw new NotFoundException('Settings not found');
    }

    return doc;
  }
}