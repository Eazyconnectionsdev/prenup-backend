// src/lawyer/lawyer.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import {
  Model,
  Types,
} from 'mongoose';

import * as bcrypt from 'bcrypt';

// =====================================================
// MAIN SCHEMAS
// =====================================================

import {
  Lawyer,
  LawyerDocument,
} from '../schemas/lawyer.schema';

import {
  Company,
  CompanyDocument,
} from '../schemas/company.schema';

import {
  User,
  UserDocument,
} from '../../users/schemas/user.schema';

import {
  Case,
  CaseWorkflowStatus,
} from '../schemas/case.schema';

// =====================================================
// CASE MANAGER SCHEMAS
// =====================================================

import {
  CaseManagerNote,
} from '../../cases/schemas/case_manager_notes.schema';

import {
  CaseDocumentEntity,
} from '../../cases/schemas/case_documents.schema';

import {
  CaseVersion,
} from '../../cases/schemas/case_versions.schema';

import {
  CaseTimeline,
} from '../../cases/schemas/case_timeline.schema';

import {
  CaseAuditLog,
} from '../../cases/schemas/case_audit_logs.schema';

import {
  AgreementVersion,
} from '../../cases/schemas/agreement_versions.schema';

import {
  CaseChangeSet,
} from '../../cases/schemas/case_changesets.schema';

// =====================================================
// DTOs
// =====================================================

import {
  CreateNoteDto,
} from '../case-manager/dto/create-note.dto';

import {
  CreateVersionDto,
} from '../case-manager/dto/create-version.dto';

type CreateLawyerPayload = Partial<Lawyer> & {
  acceptedTerms?: boolean;
  marketingConsent?: boolean;
};

@Injectable()
export class LawyerService {
  constructor(

    // ===================================================
    // LAWYER
    // ===================================================

    @InjectModel(Lawyer.name)
    private readonly lawyerModel:
      Model<LawyerDocument>,

    // ===================================================
    // COMPANY
    // ===================================================

    @InjectModel(Company.name)
    private readonly companyModel:
      Model<CompanyDocument>,

    // ===================================================
    // USER
    // ===================================================

    @InjectModel(User.name)
    private readonly userModel:
      Model<UserDocument>,

    // ===================================================
    // CASE
    // ===================================================

    @InjectModel(Case.name)
    private readonly caseModel:
      Model<Case>,

    // ===================================================
    // NOTES
    // ===================================================

    @InjectModel(CaseManagerNote.name)
    private readonly noteModel:
      Model<CaseManagerNote>,

    // ===================================================
    // DOCUMENTS
    // ===================================================

    @InjectModel(CaseDocumentEntity.name)
    private readonly documentModel:
      Model<CaseDocumentEntity>,

    // ===================================================
    // VERSIONS
    // ===================================================

    @InjectModel(CaseVersion.name)
    private readonly versionModel:
      Model<CaseVersion>,

    // ===================================================
    // TIMELINE
    // ===================================================

    @InjectModel(CaseTimeline.name)
    private readonly timelineModel:
      Model<CaseTimeline>,

    // ===================================================
    // AUDIT LOG
    // ===================================================

    @InjectModel(CaseAuditLog.name)
    private readonly auditLogModel:
      Model<CaseAuditLog>,

    // ===================================================
    // AGREEMENTS
    // ===================================================

    @InjectModel(AgreementVersion.name)
    private readonly agreementVersionModel:
      Model<AgreementVersion>,

    // ===================================================
    // CHANGESETS
    // ===================================================

    @InjectModel(CaseChangeSet.name)
    private readonly changeSetModel:
      Model<CaseChangeSet>,

  ) { }

  // =====================================================
  // HELPERS
  // =====================================================

  private normalizeEmail(
    email?: string,
  ): string | undefined {
    if (!email) {
      return undefined;
    }

    return email
      .trim()
      .toLowerCase();
  }

  private generateTemporaryPassword(): string {
    const random =
      Math.random()
        .toString(36)
        .substring(2, 10);

    return `Lawyer@${random}#`;
  }

  private generateChangeSet(
    previous: any,
    current: any,
  ) {
    const changes: any[] = [];

    const keys = new Set([
      ...Object.keys(previous || {}),
      ...Object.keys(current || {}),
    ]);

    for (const key of keys) {
      const oldValue =
        previous?.[key];

      const newValue =
        current?.[key];

      if (
        JSON.stringify(oldValue) !==
        JSON.stringify(newValue)
      ) {
        changes.push({
          field: key,

          previousValue:
            oldValue,

          newValue:
            newValue,

          action:
            oldValue === undefined
              ? 'ADDED'
              : newValue === undefined
                ? 'REMOVED'
                : 'CHANGED',
        });
      }
    }

    return changes;
  }

  // =====================================================
  // LAWYER MANAGEMENT
  // =====================================================

  // =====================================================
  // SEED LAWYERS
  // =====================================================

  async seedInitialLawyersIfEmpty() {
    const count =
      await this.lawyerModel
        .countDocuments()
        .exec();

    if (count > 0) {
      return {
        seeded: false,
        count,
        message:
          'Lawyers already exist',
      };
    }

    // ---------------------------------------------------
    // FIND DEFAULT COMPANY
    // ---------------------------------------------------

    let defaultCompany =
      await this.companyModel
        .findOne({
          name: 'Default Company',
        })
        .exec();

    // ---------------------------------------------------
    // CREATE DEFAULT COMPANY
    // ---------------------------------------------------

    if (!defaultCompany) {
      defaultCompany =
        await this.companyModel.create({
          name: 'Default Company',
        });
    }

    // ---------------------------------------------------
    // SEED LAWYERS
    // ---------------------------------------------------

    const lawyers = [
      {
        externalId: '1',
        name: 'Flavia Lamia',
        priceText:
          '£300 including VAT/VAT exempt',
        avatarUrl:
          'https://i.pravatar.cc/200?img=32',
        directEmail:
          'flavia.lamia@example.com',
      },

      {
        externalId: '2',
        name: 'Lisa Smith',
        priceText:
          '£300 including VAT/VAT exempt',
        avatarUrl:
          'https://i.pravatar.cc/200?img=12',
        directEmail:
          'lisa.smith@example.com',
      },

      {
        externalId: '3',
        name: 'Karen Weiner',
        priceText:
          '£300 including VAT/VAT exempt',
        avatarUrl:
          'https://i.pravatar.cc/200?img=56',
        directEmail:
          'karen.weiner@example.com',
      },

      {
        externalId: '4',
        name: 'Kye Herbert',
        priceText:
          '£300 including VAT/VAT exempt',
        avatarUrl:
          'https://i.pravatar.cc/200?img=14',
        directEmail:
          'kye.herbert@example.com',
      },

      {
        externalId: '5',
        name: 'Carol Wright',
        priceText:
          '£300 including VAT/VAT exempt',
        avatarUrl:
          'https://i.pravatar.cc/200?img=24',
        directEmail:
          'carol.wright@example.com',
      },

      {
        externalId: '6',
        name: 'Corinne Parke',
        priceText:
          '£300 + VAT',
        avatarUrl:
          'https://i.pravatar.cc/200?img=6',
        directEmail:
          'corinne.parke@example.com',
      },

      {
        externalId: '7',
        name: 'Richard Buxton',
        priceText:
          '£300 + VAT',
        avatarUrl:
          'https://i.pravatar.cc/200?img=18',
        directEmail:
          'richard.buxton@example.com',
      },

      {
        externalId: '9',
        name: 'Bethan Hill-Howells',
        priceText:
          '£300 + VAT',
        avatarUrl:
          'https://i.pravatar.cc/200?img=10',
        directEmail:
          'bethan.hill@example.com',
      },

      {
        externalId: '10',
        name: 'Helen Boynton',
        priceText:
          '£300 + VAT',
        avatarUrl:
          'https://i.pravatar.cc/200?img=52',
        directEmail:
          'helen.boynton@example.com',
      },
    ];

    const documents =
      lawyers.map((lawyer) => ({
        ...lawyer,

        company:
          defaultCompany!._id,

        status:
          'available',

        createdBy:
          'system',
      }));

    await this.lawyerModel
      .insertMany(documents);

    return {
      seeded: true,
      count: documents.length,
    };
  }

  // =====================================================
  // CREATE LAWYER + USER LOGIN
  // =====================================================

  async create(
    companyId: string,

    payload: CreateLawyerPayload,
    password?: string,
  ) {
    if (
      !Types.ObjectId.isValid(
        companyId,
      )
    ) {
      throw new BadRequestException(
        'Invalid companyId',
      );
    }

    const company =
      await this.companyModel
        .findById(companyId)
        .exec();

    if (!company) {
      throw new NotFoundException(
        'Company not found',
      );
    }

    if (
      !payload.name?.trim()
    ) {
      throw new BadRequestException(
        'Lawyer name is required',
      );
    }

    // ---------------------------------------------------
    // EMAIL
    // ---------------------------------------------------

    const email =
      this.normalizeEmail(
        payload.directEmail ||
        payload.publicEmail,
      );

    if (!email) {
      throw new BadRequestException(
        'Lawyer email is required for login',
      );
    }

    // ---------------------------------------------------
    // DUPLICATE LAWYER
    // ---------------------------------------------------

    const existingLawyer =
      await this.lawyerModel
        .findOne({
          name:
            payload.name.trim(),

          company:
            company._id,
        })
        .exec();

    if (existingLawyer) {
      throw new BadRequestException(
        'Lawyer already exists for this company',
      );
    }

    // ---------------------------------------------------
    // DUPLICATE USER
    // ---------------------------------------------------

    const existingUser =
      await this.userModel
        .findOne({
          email,
        })
        .exec();

    if (existingUser) {
      throw new BadRequestException(
        'A user with this email already exists',
      );
    }

    // ---------------------------------------------------
    // PASSWORD
    // ---------------------------------------------------

    const temporaryPassword =
      password ||
      this.generateTemporaryPassword();

    const passwordHash =
      await bcrypt.hash(
        temporaryPassword,
        12,
      );

    // ---------------------------------------------------
    // NAME
    // ---------------------------------------------------

    const nameParts =
      payload.name
        .trim()
        .split(/\s+/);

    const firstName =
      nameParts.shift() || '';

    const lastName =
      nameParts.join(' ');

    // ---------------------------------------------------
    // CREATE USER
    // ---------------------------------------------------

    const user =
      await this.userModel.create({
        email,

        passwordHash,

        firstName,

        lastName,

        role: 'lawyer',

        acceptedTerms:
          payload.acceptedTerms ?? true,

        marketingConsent:
          payload.marketingConsent ?? false,

        emailVerified: true,
      });

    try {
      // -------------------------------------------------
      // CREATE LAWYER
      // -------------------------------------------------

      const lawyer =
        await this.lawyerModel.create({
          ...payload,

          name:
            payload.name.trim(),

          directEmail:
            payload.directEmail ||
            email,

          company:
            company._id,

          user:
            user._id,

          createdBy:
            'admin',
        });

      return {
        lawyer,

        user: {
          id: user._id,
          email: user.email,
          role: user.role,
        },

        temporaryPassword,
      };
    } catch (error) {
      // -------------------------------------------------
      // ROLLBACK USER
      // -------------------------------------------------

      await this.userModel
        .findByIdAndDelete(
          user._id,
        )
        .exec();

      throw error;
    }
  }

  // =====================================================
  // CREATE LOGIN FOR EXISTING LAWYER
  // =====================================================

  async createLoginAccount(
    lawyerId: string,
    email: string,
    password?: string,
  ) {
    if (
      !Types.ObjectId.isValid(
        lawyerId,
      )
    ) {
      throw new BadRequestException(
        'Invalid lawyer ID',
      );
    }

    const lawyer =
      await this.lawyerModel
        .findById(lawyerId)
        .exec();

    if (!lawyer) {
      throw new NotFoundException(
        'Lawyer not found',
      );
    }

    if (lawyer.user) {
      throw new BadRequestException(
        'This lawyer already has a login account',
      );
    }

    const normalizedEmail =
      this.normalizeEmail(email);

    if (!normalizedEmail) {
      throw new BadRequestException(
        'Email is required',
      );
    }

    const existingUser =
      await this.userModel
        .findOne({
          email:
            normalizedEmail,
        })
        .exec();

    if (existingUser) {
      throw new BadRequestException(
        'A user with this email already exists',
      );
    }

    const temporaryPassword =
      password ||
      this.generateTemporaryPassword();

    const passwordHash =
      await bcrypt.hash(
        temporaryPassword,
        12,
      );

    const nameParts =
      lawyer.name
        .trim()
        .split(/\s+/);

    const firstName =
      nameParts.shift() || '';

    const lastName =
      nameParts.join(' ');

    const user =
      await this.userModel.create({
        email:
          normalizedEmail,

        passwordHash,

        firstName,

        lastName,

        role: 'lawyer',

        emailVerified: false,
      });

    try {
      lawyer.user =
        user._id;

      lawyer.directEmail =
        normalizedEmail;

      await lawyer.save();

      return {
        lawyer,

        user: {
          id: user._id,
          email: user.email,
          role: user.role,
        },

        temporaryPassword,
      };
    } catch (error) {
      await this.userModel
        .findByIdAndDelete(
          user._id,
        )
        .exec();

      throw error;
    }
  }

  // =====================================================
  // LIST LAWYERS
  // =====================================================

  async listAll() {
    return this.lawyerModel
      .find()
      .populate(
        'company',
        'name',
      )
      .populate(
        'user',
        'email firstName lastName role emailVerified',
      )
      .sort({
        createdAt: -1,
      })
      .lean()
      .exec();
  }

  // =====================================================
  // FIND LAWYER
  // =====================================================

  async findById(
    id: string,
  ) {
    if (
      !Types.ObjectId.isValid(id)
    ) {
      throw new BadRequestException(
        'Invalid lawyer ID',
      );
    }

    const lawyer =
      await this.lawyerModel
        .findById(id)
        .populate(
          'company',
          'name',
        )
        .populate(
          'user',
          'email firstName lastName role emailVerified',
        )
        .exec();

    if (!lawyer) {
      throw new NotFoundException(
        'Lawyer not found',
      );
    }

    return lawyer;
  }

  // =====================================================
  // FIND LAWYER BY USER ID
  // =====================================================

  async findByUserId(
    userId: string,
  ) {
    if (
      !Types.ObjectId.isValid(
        userId,
      )
    ) {
      throw new BadRequestException(
        'Invalid user ID',
      );
    }

    const lawyer =
      await this.lawyerModel
        .findOne({
          user:
            new Types.ObjectId(
              userId,
            ),
        })
        .populate(
          'company',
          'name',
        )
        .populate(
          'user',
          'email firstName lastName role emailVerified',
        )
        .lean()
        .exec();

    if (!lawyer) {
      throw new NotFoundException(
        'Lawyer profile not found for this user',
      );
    }

    return lawyer;
  }

  // =====================================================
  // UPDATE LAWYER
  // =====================================================

  async update(
    lawyerId: string,
    payload: Partial<Lawyer>,
  ) {
    if (
      !Types.ObjectId.isValid(
        lawyerId,
      )
    ) {
      throw new BadRequestException(
        'Invalid lawyer ID',
      );
    }

    const lawyer =
      await this.lawyerModel
        .findById(lawyerId);

    if (!lawyer) {
      throw new NotFoundException(
        'Lawyer not found',
      );
    }

    // Don't accidentally change relationships
    delete (payload as any).user;
    delete (payload as any).company;

    Object.assign(
      lawyer,
      payload,
    );

    return lawyer.save();
  }

  // =====================================================
  // UPDATE LAWYER STATUS
  // =====================================================

  async updateStatus(
    lawyerId: string,
    status:
      | 'available'
      | 'unavailable'
      | 'archived',
  ) {
    if (
      !Types.ObjectId.isValid(
        lawyerId,
      )
    ) {
      throw new BadRequestException(
        'Invalid lawyer ID',
      );
    }

    const lawyer =
      await this.lawyerModel
        .findById(lawyerId);

    if (!lawyer) {
      throw new NotFoundException(
        'Lawyer not found',
      );
    }

    lawyer.status =
      status;

    return lawyer.save();
  }

  // =====================================================
  // DELETE LAWYER
  // =====================================================

  async remove(
    lawyerId: string,
  ) {
    if (
      !Types.ObjectId.isValid(
        lawyerId,
      )
    ) {
      throw new BadRequestException(
        'Invalid lawyer ID',
      );
    }

    const lawyer =
      await this.lawyerModel
        .findById(lawyerId);

    if (!lawyer) {
      throw new NotFoundException(
        'Lawyer not found',
      );
    }

    await this.lawyerModel
      .findByIdAndDelete(
        lawyerId,
      )
      .exec();

    return {
      success: true,

      message:
        'Lawyer deleted successfully',
    };
  }

  // =====================================================
  // DASHBOARD
  // =====================================================

  async dashboard(
    userId: string,
  ) {
    const [
      totalCases,

      partnerNotInvited,
      partnerFilling,

      returnedToDraft,
      awaitingCmReview,

      p1QuestionnairePending,
      p2QuestionnairePending,

      p1ConfirmationPending,
      p2ConfirmationPending,

      p1LawyerApprovalPending,
      p2LawyerApprovalPending,

      completedCases,

      readyForArchive,
    ] = await Promise.all([

      // TOTAL

      this.caseModel
        .countDocuments(),

      // PARTNER

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.DRAFT,

          partnerInvited:
            false,
        }),

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.DRAFT,

          partnerInvited:
            true,
        }),

      // CM REVIEW

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.DRAFT,

          cmReturnReason: {
            $exists: true,
            $ne: null,
          },
        }),

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.COUPLE_SUBMITTED,
        }),

      // PRE LAWYER

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.PRE_LAWYER_PENDING,

          $or: [
            {
              preQuestionnaireUser1: {
                $exists: false,
              },
            },

            {
              'preQuestionnaireUser1.submitted':
                false,
            },
          ],
        }),

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.PRE_LAWYER_PENDING,

          $or: [
            {
              preQuestionnaireUser2: {
                $exists: false,
              },
            },

            {
              'preQuestionnaireUser2.submitted':
                false,
            },
          ],
        }),

      // CLIENT CONFIRMATION

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYER_REVIEW,

          $or: [
            {
              p1Confirmed: false,
            },

            {
              p1Confirmed: {
                $exists: false,
              },
            },
          ],
        }),

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYER_REVIEW,

          $or: [
            {
              p2Confirmed: false,
            },

            {
              p2Confirmed: {
                $exists: false,
              },
            },
          ],
        }),

      // ILA

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYER_ILA_PENDING,

          $or: [
            {
              p1ILACompleted: false,
            },

            {
              p1ILACompleted: {
                $exists: false,
              },
            },
          ],
        }),

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYER_ILA_PENDING,

          $or: [
            {
              p2ILACompleted: false,
            },

            {
              p2ILACompleted: {
                $exists: false,
              },
            },
          ],
        }),

      // COMPLETED

      this.caseModel
        .countDocuments({
          workflowStatus:
            CaseWorkflowStatus.COMPLETED,
        }),

      // ARCHIVE

      this.caseModel
        .countDocuments({
          readyForArchive: true,
        }),
    ]);

    return {
      totalCases,

      partnerFilling: {
        total:
          partnerNotInvited +
          partnerFilling,

        partnerNotInvited,

        partnerFilling,
      },

      cmReview: {
        total:
          returnedToDraft +
          awaitingCmReview,

        returnedToDraft,

        awaitingCmReview,
      },

      legalReview: {
        total:
          p1QuestionnairePending +
          p2QuestionnairePending +
          p1ConfirmationPending +
          p2ConfirmationPending +
          p1LawyerApprovalPending +
          p2LawyerApprovalPending,

        preLawyer: {
          p1QuestionnairePending,
          p2QuestionnairePending,
        },

        clientConfirmation: {
          p1ConfirmationPending,
          p2ConfirmationPending,
        },

        lawyerSignOff: {
          p1LawyerApprovalPending,
          p2LawyerApprovalPending,
        },
      },

      completed: {
        total:
          completedCases,

        executionPackGenerated:
          completedCases,
      },

      readyForArchive: {
        total:
          readyForArchive,
      },
    };
  }

  // =====================================================
  // DASHBOARD STAGE SUMMARY
  // =====================================================

  async stageSummary(
    userId: string,
  ) {
    return {
      lawyersAssigned:
        await this.caseModel
          .countDocuments({
            workflowStatus:
              CaseWorkflowStatus.LAWYERS_ASSIGNED,
          }),

      review:
        await this.caseModel
          .countDocuments({
            workflowStatus:
              CaseWorkflowStatus.LAWYER_REVIEW,
          }),

      ila:
        await this.caseModel
          .countDocuments({
            workflowStatus:
              CaseWorkflowStatus.LAWYER_ILA_PENDING,
          }),

      signoff:
        await this.caseModel
          .countDocuments({
            workflowStatus:
              CaseWorkflowStatus.LAWYER_SIGNOFF_COMPLETE,
          }),

      completed:
        await this.caseModel
          .countDocuments({
            workflowStatus:
              CaseWorkflowStatus.COMPLETED,
          }),
    };
  }

  // =====================================================
  // CASE OVERVIEW
  // =====================================================

  async caseOverview(
    caseId: string,
  ) {
    const caseDoc =
      await this.caseModel
        .findById(caseId)
        .populate('owner')
        .populate('invitedUser')
        .populate('assignedCaseManager')
        .populate('assignedLawyerP1')
        .populate('assignedLawyerP2');

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    return caseDoc;
  }

  // =====================================================
  // CASE STATUS
  // =====================================================

  async status(
    caseId: string,
  ) {
    const caseDoc =
      await this.caseModel
        .findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    return {
      workflowStatus:
        caseDoc.workflowStatus,

      fullyLocked:
        caseDoc.fullyLocked,

      priority:
        caseDoc.priority,
    };
  }

  // =====================================================
  // REVIEW COMPLETE
  // =====================================================

  async reviewComplete(
    caseId: string,
    userId: string,
  ) {
    const caseDoc =
      await this.caseModel
        .findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    caseDoc.workflowStatus =
      CaseWorkflowStatus.LAWYER_REVIEW_COMPLETED;

    caseDoc.lawyerReviewCompleted =
      true;

    caseDoc.lawyerReviewCompletedAt =
      new Date();

    await caseDoc.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'LAWYER_REVIEW_COMPLETED',
    );

    return caseDoc;
  }

  // =====================================================
  // REQUEST ILA
  // =====================================================

  async requestILA(
    caseId: string,
    userId: string,
  ) {
    const caseDoc =
      await this.caseModel
        .findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    caseDoc.workflowStatus =
      CaseWorkflowStatus.LAWYER_ILA_PENDING;

    await caseDoc.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'ILA_REQUESTED',
    );

    return caseDoc;
  }

  // =====================================================
  // P1 ILA
  // =====================================================

  async completeP1ILA(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p1ILACompleted =
      true;

    c.p1ILACompletedAt =
      new Date();

    c.p1ILAFile =
      file?.path ??
      file?.filename;

    await c.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'P1_ILA_COMPLETED',
    );

    return c;
  }

  // =====================================================
  // P2 ILA
  // =====================================================

  async completeP2ILA(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p2ILACompleted =
      true;

    c.p2ILACompletedAt =
      new Date();

    c.p2ILAFile =
      file?.path ??
      file?.filename;

    await c.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'P2_ILA_COMPLETED',
    );

    return c;
  }

  // =====================================================
  // ILA STATUS
  // =====================================================

  async ilaStatus(
    caseId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    return {
      p1ILACompleted:
        c.p1ILACompleted,

      p2ILACompleted:
        c.p2ILACompleted,

      p1ILACompletedAt:
        c.p1ILACompletedAt,

      p2ILACompletedAt:
        c.p2ILACompletedAt,
    };
  }

  // =====================================================
  // P1 LAWYER SIGNOFF
  // =====================================================

  async p1Signoff(
    caseId: string,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p1LawyerSigned =
      true;

    c.p1LawyerSignedAt =
      new Date();

    await c.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'P1_LAWYER_SIGNOFF',
    );

    return c;
  }

  // =====================================================
  // P2 LAWYER SIGNOFF
  // =====================================================

  async p2Signoff(
    caseId: string,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p2LawyerSigned =
      true;

    c.p2LawyerSignedAt =
      new Date();

    if (
      c.p1LawyerSigned &&
      c.p2LawyerSigned
    ) {
      c.dualLawyerSignoffCompleted =
        true;

      c.dualLawyerSignoffCompletedAt =
        new Date();

      c.workflowStatus =
        CaseWorkflowStatus.LAWYER_CLIENT_CONFIRMATION;
    }

    await c.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'DUAL_LAWYER_SIGNOFF_COMPLETE',
    );

    return c;
  }

  // =====================================================
  // P1 FINAL CONFIRMATION
  // =====================================================

  async finalP1Confirmation(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.finalP1Confirmed =
      true;

    c.finalP1ConfirmedAt =
      new Date();

    await c.save();

    return c;
  }

  // =====================================================
  // P2 FINAL CONFIRMATION
  // =====================================================

  async finalP2Confirmation(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.finalP2Confirmed =
      true;

    c.finalP2ConfirmedAt =
      new Date();

    await c.save();

    return c;
  }

  // =====================================================
  // CONFIRMATIONS
  // =====================================================

  async confirmations(
    caseId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    return {
      finalP1Confirmed:
        c.finalP1Confirmed,

      finalP2Confirmed:
        c.finalP2Confirmed,

      finalP1ConfirmedAt:
        c.finalP1ConfirmedAt,

      finalP2ConfirmedAt:
        c.finalP2ConfirmedAt,
    };
  }

  // =====================================================
  // COMPLETE CASE
  // =====================================================

  async completeCase(
    caseId: string,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    if (
      !c.finalP1Confirmed ||
      !c.finalP2Confirmed
    ) {
      throw new BadRequestException(
        'Client confirmations missing',
      );
    }

    c.workflowStatus =
      CaseWorkflowStatus.COMPLETED;

    c.completedAt =
      new Date();

    c.readyForArchive =
      true;

    await c.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'CASE_COMPLETED',
    );

    await this.createAuditLog(
      caseId,
      userId,
      'CASE_COMPLETED',
    );

    return c;
  }

  // =====================================================
  // DOCUMENTS
  // =====================================================

  async uploadDocument(
    caseId: string,
    file: any,
    userId: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'File is required',
      );
    }

    const document =
      await this.documentModel.create({
        caseId:
          new Types.ObjectId(
            caseId,
          ),

        fileName:
          file.filename ??
          file.originalname,

        originalName:
          file.originalname,

        mimeType:
          file.mimetype,

        fileSize:
          file.size,

        fileUrl:
          file.path ??
          file.filename,

        uploadedBy:
          new Types.ObjectId(
            userId,
          ),
      });

    await this.createTimelineEntry(
      caseId,
      userId,
      'DOCUMENT_UPLOADED',
    );

    return document;
  }

  async documents(
    caseId: string,
  ) {
    return this.documentModel
      .find({
        caseId:
          new Types.ObjectId(
            caseId,
          ),
      })
      .sort({
        createdAt: -1,
      })
      .populate(
        'uploadedBy',
      );
  }

  async deleteDocument(
    caseId: string,
    documentId: string,
    userId: string,
  ) {
    await this.documentModel
      .findByIdAndDelete(
        documentId,
      );

    await this.createAuditLog(
      caseId,
      userId,
      'DOCUMENT_DELETED',
    );

    return {
      success: true,
    };
  }

  // =====================================================
  // NOTES
  // =====================================================

  async addNote(
    caseId: string,
    dto: CreateNoteDto,
    userId: string,
  ) {
    const note =
      await this.noteModel.create({
        caseId:
          new Types.ObjectId(
            caseId,
          ),

        category:
          dto.category,

        note:
          dto.note,

        createdBy:
          new Types.ObjectId(
            userId,
          ),
      });

    await this.createTimelineEntry(
      caseId,
      userId,
      'NOTE_ADDED',
    );

    return note;
  }

  async notes(
    caseId: string,
  ) {
    return this.noteModel
      .find({
        caseId:
          new Types.ObjectId(
            caseId,
          ),

        isActive:
          true,
      })
      .populate(
        'createdBy',
      )
      .sort({
        createdAt: -1,
      });
  }

  async deleteNote(
    caseId: string,
    noteId: string,
    userId: string,
  ) {
    await this.noteModel
      .findByIdAndUpdate(
        noteId,
        {
          isActive:
            false,
        },
      );

    await this.createAuditLog(
      caseId,
      userId,
      'NOTE_DELETED',
    );

    return {
      success: true,
    };
  }

  // =====================================================
  // CASE VERSIONING
  // =====================================================

  async createVersion(
    caseId: string,
    dto: CreateVersionDto,
    userId: string,
  ) {
    const caseDoc =
      await this.caseModel
        .findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    const versionNo =
      (caseDoc.totalVersions || 0) +
      1;

    const version =
      await this.versionModel.create({
        caseId:
          new Types.ObjectId(
            caseId,
          ),

        versionNumber:
          `V${versionNo}`,

        versionType:
          'CASE',

        snapshot:
          dto.updatedVersion,

        changeReason:
          dto.changeReason,

        createdBy:
          new Types.ObjectId(
            userId,
          ),
      });

    const changes =
      this.generateChangeSet(
        dto.previousVersion,
        dto.updatedVersion,
      );

    for (
      const change of changes
    ) {
      await this.changeSetModel
        .create({
          caseId:
            new Types.ObjectId(
              caseId,
            ),

          fromVersion:
            `V${versionNo - 1}`,

          toVersion:
            `V${versionNo}`,

          field:
            change.field,

          previousValue:
            change.previousValue,

          newValue:
            change.newValue,

          action:
            change.action,
        });
    }

    caseDoc.totalVersions =
      versionNo;

    caseDoc.currentVersion =
      versionNo;

    await caseDoc.save();

    return version;
  }

  async versions(
    caseId: string,
  ) {
    return this.versionModel
      .find({
        caseId:
          new Types.ObjectId(
            caseId,
          ),
      })
      .populate(
        'createdBy',
      )
      .sort({
        createdAt: -1,
      });
  }

  async version(
    versionId: string,
  ) {
    return this.versionModel
      .findById(
        versionId,
      );
  }

  async compareVersions(
    caseId: string,
    from: string,
    to: string,
  ) {
    return this.changeSetModel
      .find({
        caseId:
          new Types.ObjectId(
            caseId,
          ),

        fromVersion:
          from,

        toVersion:
          to,
      });
  }

  async changeSets(
    caseId: string,
  ) {
    return this.changeSetModel
      .find({
        caseId:
          new Types.ObjectId(
            caseId,
          ),
      });
  }

  // =====================================================
  // AGREEMENTS
  // =====================================================

  async agreements(
    caseId: string,
  ) {
    return this.agreementVersionModel
      .find({
        caseId:
          new Types.ObjectId(
            caseId,
          ),
      })
      .sort({
        createdAt: -1,
      });
  }

  async uploadAgreement(
    caseId: string,
    file: any,
    userId: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'File is required',
      );
    }

    const count =
      await this.agreementVersionModel
        .countDocuments({
          caseId:
            new Types.ObjectId(
              caseId,
            ),
        });

    return this.agreementVersionModel
      .create({
        caseId:
          new Types.ObjectId(
            caseId,
          ),

        version:
          `V${count + 1}`,

        fileUrl:
          file.path ??
          file.filename,

        uploadedBy:
          new Types.ObjectId(
            userId,
          ),
      });
  }

  async compareAgreements(
    caseId: string,
    left: string,
    right: string,
  ) {
    const first =
      await this.agreementVersionModel
        .findOne({
          caseId:
            new Types.ObjectId(
              caseId,
            ),

          version:
            left,
        });

    const second =
      await this.agreementVersionModel
        .findOne({
          caseId:
            new Types.ObjectId(
              caseId,
            ),

          version:
            right,
        });

    return {
      left: first,
      right: second,
    };
  }

  // =====================================================
  // TIMELINE
  // =====================================================

  async timeline(
    caseId: string,
  ) {
    return this.timelineModel
      .find({
        caseId:
          new Types.ObjectId(
            caseId,
          ),
      })
      .populate(
        'performedBy',
      )
      .sort({
        createdAt: -1,
      });
  }

  // =====================================================
  // AUDIT LOG
  // =====================================================

  async auditLog(
    caseId: string,
  ) {
    return this.auditLogModel
      .find({
        caseId:
          new Types.ObjectId(
            caseId,
          ),
      })
      .populate(
        'userId',
      )
      .sort({
        createdAt: -1,
      });
  }

  // =====================================================
  // COMPLETED CASES
  // =====================================================

  async completedCases(
    userId: string,
  ) {
    return this.caseModel
      .find({
        workflowStatus:
          CaseWorkflowStatus.COMPLETED,

        $or: [
          {
            assignedLawyerP1:
              new Types.ObjectId(
                userId,
              ),
          },

          {
            assignedLawyerP2:
              new Types.ObjectId(
                userId,
              ),
          },
        ],
      })
      .populate(
        'assignedLawyerP1',
      )
      .populate(
        'assignedLawyerP2',
      )
      .sort({
        completedAt: -1,
      });
  }

  // =====================================================
  // CONFIRMATION HELPERS
  // =====================================================

  async uploadP1Confirmation(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p1Confirmed =
      true;

    c.p1ConfirmedAt =
      new Date();

    await c.save();

    return c;
  }

  async uploadP2Confirmation(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel
        .findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p2Confirmed =
      true;

    c.p2ConfirmedAt =
      new Date();

    if (
      c.p1Confirmed &&
      c.p2Confirmed
    ) {
      c.workflowStatus =
        CaseWorkflowStatus.LAWYER_REVIEW_COMPLETED;
    }

    await c.save();

    return c;
  }

  async getConfirmations(
    caseId: string,
  ) {
    const caseDoc =
      await this.caseModel
        .findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    return {
      p1Confirmed:
        caseDoc.p1Confirmed,

      p2Confirmed:
        caseDoc.p2Confirmed,

      p1ConfirmedAt:
        caseDoc.p1ConfirmedAt,

      p2ConfirmedAt:
        caseDoc.p2ConfirmedAt,
    };
  }

  // =====================================================
  // TIMELINE HELPER
  // =====================================================

  private async createTimelineEntry(
    caseId: string,
    userId: string,
    action: string,
    notes?: string,
  ) {
    return this.timelineModel
      .create({
        caseId:
          new Types.ObjectId(
            caseId,
          ),

        performedBy:
          new Types.ObjectId(
            userId,
          ),

        action,

        notes,
      });
  }

  // =====================================================
  // AUDIT HELPER
  // =====================================================

  private async createAuditLog(
    caseId: string,
    userId: string,
    action: string,
    notes?: string,
  ) {
    return this.auditLogModel
      .create({
        caseId:
          new Types.ObjectId(
            caseId,
          ),

        userId:
          new Types.ObjectId(
            userId,
          ),

        action,

        notes,
      });
  }
}