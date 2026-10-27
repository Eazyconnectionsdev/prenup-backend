
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Company, CompanyDocument } from './schemas/company.schema';
import { Lawyer, LawyerDocument } from './schemas/lawyer.schema';
import { Enquiry, EnquiryDocument } from './schemas/enquiry.schema';
import { CreateLawyerDto } from './dto/create-lawyer.dto';
import { CreateCaseManagerDto } from './dto/create-case-manager.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Case, CaseDocument, CaseWorkflowStatus } from '../cases/schemas/case.schema';
import { Settings, SettingsDocument } from './schemas/settings.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>,
    @InjectModel(Enquiry.name) private enquiryModel: Model<EnquiryDocument>,
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
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
    const normalized = (status || '').toUpperCase() as CaseWorkflowStatus;
    const validStatuses = Object.values(CaseWorkflowStatus) as string[];

    if (!validStatuses.includes(normalized)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this.caseModel
        .find({ workflowStatus: normalized })
        .populate('owner', 'firstName lastName email')
        .populate('invitedUser', 'firstName lastName email')
        .populate('assignedCaseManager', 'firstName lastName email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.caseModel.countDocuments({ workflowStatus: normalized }),
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
    const updated = await this.userModel.findByIdAndUpdate(id, { role }, { new: true }).exec();
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  async deactivateUser(id: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid user id');
    const updated = await this.userModel.findByIdAndUpdate(id, { active: false }, { new: true }).exec();
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  // ---------------- Enquiries -----------------
  async listEnquiries(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.enquiryModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec();
    const total = await this.enquiryModel.countDocuments().exec();
    return { total, docs };
  }

  async createEnquiry(payload: any) {
    const doc = new this.enquiryModel(payload);
    return doc.save();
  }

  // ---------------- Companies -----------------
  async listCompanies(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.companyModel.find().skip(skip).limit(limit).lean().exec();
    const total = await this.companyModel.countDocuments().exec();
    return { total, docs };
  }

  async getCompanyById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid company id');
    const doc = await this.companyModel.findById(id).lean().exec();
    if (!doc) throw new NotFoundException('Company not found');
    return doc;
  }

  async createCompany(payload: Partial<Company>) {
    const doc = new this.companyModel(payload);
    return doc.save();
  }

  async setCompanyVerified(id: string, verified: boolean, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid company id');
    const updated = await this.companyModel.findByIdAndUpdate(id, { verified }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Company not found');
    return updated;
  }

  // ---------------- Lawyers -----------------
  async listLawyers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.lawyerModel.find().populate('company').skip(skip).limit(limit).lean().exec();
    const total = await this.lawyerModel.countDocuments().exec();
    return { total, docs };
  }

  async getLawyerById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const doc = await this.lawyerModel.findById(id).populate('company').lean().exec();
    if (!doc) throw new NotFoundException('Lawyer not found');
    return doc;
  }

  /**
   * Create a lawyer profile AND its associated login account (User with role=lawyer).
   * The account is created pre-verified so the lawyer can log in immediately.
   * Both the Lawyer document and the User document are cross-linked via
   * `userId` on the Lawyer and `lawyerProfile` on the User.
   */
  async createLawyer(payload: CreateLawyerDto) {
    // validate company id string
    if (!payload.company || !Types.ObjectId.isValid(String(payload.company))) {
      throw new BadRequestException('Valid company id required');
    }

    const companyId = new Types.ObjectId(payload.company);

    // ensure company exists
    const companyExists = await this.companyModel.exists({ _id: companyId });
    if (!companyExists) {
      throw new BadRequestException('Company not found');
    }

    const normalizedLoginEmail = payload.loginEmail?.toLowerCase?.()?.trim();
    if (!normalizedLoginEmail) throw new BadRequestException('loginEmail is required');

    // check email uniqueness
    const existingUser = await this.userModel.findOne({ email: normalizedLoginEmail }).lean().exec();
    if (existingUser) {
      throw new BadRequestException(`A user account with email "${normalizedLoginEmail}" already exists`);
    }

    const externalId = payload.externalId?.trim() || `LAW-${Date.now().toString().slice(-6)}`;

    // Step 1: Create the Lawyer profile document first (without userId)
    const docPayload: Partial<Lawyer> = {
      externalId,
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

    const lawyerDoc = await new this.lawyerModel(docPayload).save();

    // Step 2: Hash the password and create the User account
    const passwordHash = await bcrypt.hash(payload.password, 10);

    // Parse first/last from full name for the user record
    const nameParts = payload.name.trim().split(' ');
    const firstName = nameParts[0] || payload.name;
    const lastName = nameParts.slice(1).join(' ') || undefined;

    const userDoc = await new this.userModel({
      email: normalizedLoginEmail,
      passwordHash,
      firstName,
      lastName: lastName || null,
      role: 'lawyer',
      emailVerified: true,          // admin-created accounts are pre-verified
      acceptedTerms: true,
      lawyerProfile: lawyerDoc._id,
    }).save();

    // Step 3: Cross-link userId back onto the Lawyer document
    lawyerDoc.userId = (userDoc as any)._id;
    await (lawyerDoc as any).save();

    return { lawyer: lawyerDoc, user: { _id: userDoc._id, email: userDoc.email, role: userDoc.role } };
  }

  async setLawyerVerified(id: string, verified: boolean, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const updated = await this.lawyerModel.findByIdAndUpdate(id, { verified }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Lawyer not found');
    return updated;
  }

  async archiveLawyer(id: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const updated = await this.lawyerModel.findByIdAndUpdate(id, { status: 'archived' }, { new: true }).exec();
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