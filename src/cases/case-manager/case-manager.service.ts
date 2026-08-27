// src/case-manager/case-manager.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Case, CaseWorkflowStatus } from '../schemas/case.schema';
import { Lawyer } from '../schemas/lawyer.schema';

import { ReturnDraftDto } from './dto/return-draft.dto';
import { AssignLawyersDto } from './dto/assign-lawyers.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import { ApproveCaseDto } from './dto/approve-case.dto';
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
@Injectable()
export class CaseManagerService {
  constructor(

    @InjectModel(CaseManagerNote.name)
    private readonly noteModel: Model<CaseManagerNote>,

    @InjectModel(CaseDocumentEntity.name)
    private readonly documentModel: Model<CaseDocumentEntity>,

    @InjectModel(CaseVersion.name)
    private readonly versionModel: Model<CaseVersion>,

    @InjectModel(CaseTimeline.name)
    private readonly timelineModel: Model<CaseTimeline>,

    @InjectModel(CaseAuditLog.name)
    private readonly auditLogModel: Model<CaseAuditLog>,

    @InjectModel(AgreementVersion.name)
    private readonly agreementVersionModel: Model<AgreementVersion>,

    @InjectModel(CaseChangeSet.name)
    private readonly changeSetModel: Model<CaseChangeSet>,

    @InjectModel(Case.name)
    private readonly caseModel: Model<Case>,

    @InjectModel(Lawyer.name)
    private readonly lawyerModel: Model<Lawyer>,


  ) { }

  // ====================================================
  // DASHBOARD
  // ====================================================

  async getDashboard(userId: string) {
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
      // ==========================================
      // TOTAL
      // ==========================================
      this.caseModel.countDocuments(),

      // ==========================================
      // PARTNER FILLING
      // ==========================================
      this.caseModel.countDocuments({
        workflowStatus: CaseWorkflowStatus.DRAFT,
        partnerInvited: false,
      }),

      this.caseModel.countDocuments({
        workflowStatus: CaseWorkflowStatus.DRAFT,
        partnerInvited: true,
      }),

      // ==========================================
      // CM REVIEW
      // ==========================================
      this.caseModel.countDocuments({
        workflowStatus: CaseWorkflowStatus.DRAFT,
        cmReturnReason: {
          $exists: true,
          $ne: null,
        },
      }),

      this.caseModel.countDocuments({
        workflowStatus:
          CaseWorkflowStatus.COUPLE_SUBMITTED,
      }),

      // ==========================================
      // LEGAL REVIEW
      // PRE-LAWYER QUESTIONNAIRE
      // ==========================================
      this.caseModel.countDocuments({
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

      this.caseModel.countDocuments({
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

      // ==========================================
      // CLIENT CONFIRMATION
      // ==========================================
      this.caseModel.countDocuments({
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

      this.caseModel.countDocuments({
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

      // ==========================================
      // ILA
      // ==========================================
      this.caseModel.countDocuments({
        workflowStatus:
          CaseWorkflowStatus.ILA_PENDING,

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

      this.caseModel.countDocuments({
        workflowStatus:
          CaseWorkflowStatus.ILA_PENDING,

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

      // ==========================================
      // COMPLETED
      // ==========================================
      this.caseModel.countDocuments({
        workflowStatus:
          CaseWorkflowStatus.COMPLETED,
      }),

      // ==========================================
      // READY FOR ARCHIVE
      // ==========================================
      this.caseModel.countDocuments({
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
        total: completedCases,
        executionPackGenerated:
          completedCases,
      },

      readyForArchive: {
        total: readyForArchive,
      },
    };
  }

  async getStageSummary(userId: string) {
    return {
      partnerFilling:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.DRAFT,
        }),

      cmReview:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.COUPLE_SUBMITTED,
        }),

      preLawyerPending:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.PRE_LAWYER_PENDING,
        }),

      lawyersAssigned:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYERS_ASSIGNED,
        }),


      archived:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.ARCHIVED,
        }),
    };
  }

  // ====================================================
  // OVERVIEW
  // ====================================================

  async getCaseOverview(caseId: string) {
    const caseDoc = await this.caseModel
      .findById(caseId)
      .populate('owner')
      .populate('invitedUser')
      .populate('assignedCaseManager')
      .populate('assignedLawyerP1')
      .populate('assignedLawyerP2');

    if (!caseDoc) {
      throw new NotFoundException('Case not found');
    }

    return caseDoc;
  }

  async getCaseStatus(caseId: string) {
    const caseDoc = await this.caseModel.findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException('Case not found');
    }

    return {
      workflowStatus: caseDoc.workflowStatus,
      fullyLocked: caseDoc.fullyLocked,
      priority: caseDoc.priority,
    };
  }

  // ====================================================
  // RETURN TO DRAFT
  // ====================================================

  async returnToDraft(
    caseId: string,
    dto: ReturnDraftDto,
    userId: string,
  ) {
    const caseDoc =
      await this.caseModel.findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    caseDoc.workflowStatus =
      CaseWorkflowStatus.DRAFT;

    caseDoc.cmApproved = false;

    caseDoc.cmApprovedAt = null;

    caseDoc.cmApprovedBy = null;

    caseDoc.cmReturnReason =
      dto.reason;

    await caseDoc.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'RETURN_TO_DRAFT',
      dto.reason,
    );

    await this.createAuditLog(
      caseId,
      userId,
      'RETURN_TO_DRAFT',
      dto.reason,
    );

    return {
      success: true,
      workflowStatus:
        CaseWorkflowStatus.DRAFT,
    };
  }


  // ====================================================
  // APPROVE CASE
  // ====================================================

  async approveCase(
    caseId: string,
    dto: ApproveCaseDto,
    userId: string,
  ) {
    const caseDoc = await this.caseModel.findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException('Case not found');
    }

    caseDoc.workflowStatus = CaseWorkflowStatus.CM_APPROVED

    await caseDoc.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'CM_APPROVED',
    );

    return {
      success: true,
      status: CaseWorkflowStatus.PRE_LAWYER_PENDING,
    };
  }

  // ====================================================
  // COUPLE APPROVALS
  // ====================================================

  async requestCoupleApproval(
    caseId: string,
    userId: string,
  ) {
    await this.createTimelineEntry(
      caseId,
      userId,
      'COUPLE_APPROVAL_REQUESTED',
    );

    return { success: true };
  }

  async uploadP1Confirmation(
    caseId: string,
    file: any,
    userId: string,
  ) {

    const c =
      await this.caseModel.findById(
        caseId,
      );

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p1Confirmed = true;

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
      await this.caseModel.findById(
        caseId,
      );

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p2Confirmed = true;

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
          previousValue: oldValue,
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

  async getConfirmations(
    caseId: string,
  ) {
    const caseDoc =
      await this.caseModel.findById(caseId);

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

  // ====================================================
  // LAWYER ASSIGNMENT
  // ====================================================

  async availableLawyers(caseId: string) {
    return this.lawyerModel.find();
  }

  async assignLawyers(
    caseId: string,
    dto: AssignLawyersDto,
    userId: string,
  ) {
    if (
      dto.p1LawyerId === dto.p2LawyerId
    ) {
      throw new BadRequestException(
        'Lawyers must be different',
      );
    }

    const caseDoc =
      await this.caseModel.findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException();
    }

    caseDoc.assignedLawyerP1 =
      new Types.ObjectId(dto.p1LawyerId);

    caseDoc.assignedLawyerP2 =
      new Types.ObjectId(dto.p2LawyerId);

    caseDoc.workflowStatus =
      CaseWorkflowStatus.LAWYERS_ASSIGNED;

    caseDoc.lawyersAssignedAt =
      new Date();

    caseDoc.lawyersAssignedBy =
      new Types.ObjectId(userId);

    await caseDoc.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'LAWYERS_ASSIGNED',
    );

    return caseDoc;
  }


  async addNote(
    caseId: string,
    dto: CreateNoteDto,
    userId: string,
  ) {
    const note =
      await this.noteModel.create({
        caseId: new Types.ObjectId(caseId),
        category: dto.category,
        note: dto.note,
        createdBy: new Types.ObjectId(userId),
      });

    await this.createTimelineEntry(
      caseId,
      userId,
      'NOTE_ADDED',
    );

    return note;
  }

  async getNotes(caseId: string) {
    return this.noteModel
      .find({
        caseId: new Types.ObjectId(caseId),
        isActive: true,
      })
      .populate('createdBy')
      .sort({
        createdAt: -1,
      });
  }

  async deleteNote(
    caseId: string,
    noteId: string,
    userId: string,
  ) {
    await this.noteModel.findByIdAndUpdate(
      noteId,
      {
        isActive: false,
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

  private async createTimelineEntry(
    caseId: string,
    userId: string,
    action: string,
    notes?: string,
  ) {
    return this.timelineModel.create({
      caseId: new Types.ObjectId(caseId),
      performedBy: new Types.ObjectId(userId),
      action,
      notes,
    });
  }

  private async createAuditLog(
    caseId: string,
    userId: string,
    action: string,
    notes?: string,
  ) {
    return this.auditLogModel.create({
      caseId: new Types.ObjectId(caseId),
      userId: new Types.ObjectId(userId),
      action,
      notes,
    });
  }
  async uploadDocument(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const document =
      await this.documentModel.create({
        caseId:
          new Types.ObjectId(caseId),

        fileName:
          file?.filename ??
          file?.originalname,

        originalName:
          file?.originalname,

        mimeType:
          file?.mimetype,

        fileSize:
          file?.size,

        fileUrl:
          file?.path ??
          file?.filename,

        uploadedBy:
          new Types.ObjectId(userId),
      });

    await this.createTimelineEntry(
      caseId,
      userId,
      'DOCUMENT_UPLOADED',
    );

    return document;
  }

  async getDocuments(
    caseId: string,
  ) {
    return this.documentModel
      .find({
        caseId:
          new Types.ObjectId(caseId),
      })
      .sort({
        createdAt: -1,
      })
      .populate('uploadedBy');
  }

  async deleteDocument(
    caseId: string,
    documentId: string,
    userId: string,
  ) {
    await this.documentModel.findByIdAndDelete(
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

  async createVersion(
    caseId: string,
    dto: CreateVersionDto,
    userId: string,
  ) {
    const caseDoc =
      await this.caseModel.findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    const versionNo =
      (caseDoc.totalVersions || 0) + 1;

    const version =
      await this.versionModel.create({
        caseId:
          new Types.ObjectId(caseId),

        versionNumber:
          `V${versionNo}`,

        versionType:
          'CASE',

        snapshot:
          dto.updatedVersion,

        changeReason:
          dto.changeReason,

        createdBy:
          new Types.ObjectId(userId),
      });

    const changes =
      this.generateChangeSet(
        dto.previousVersion,
        dto.updatedVersion,
      );

    for (const change of changes) {
      await this.changeSetModel.create({
        caseId:
          new Types.ObjectId(caseId),

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


  async getVersions(
    caseId: string,
  ) {
    return this.versionModel
      .find({
        caseId:
          new Types.ObjectId(caseId),
      })
      .populate('createdBy')
      .sort({
        createdAt: -1,
      });
  }


  async getVersion(
    caseId: string,
    versionId: string,
  ) {
    return this.versionModel.findById(
      versionId,
    );
  }

  async compareVersions(
    caseId: string,
    from: string,
    to: string,
  ) {
    return this.changeSetModel.find({
      caseId:
        new Types.ObjectId(caseId),

      fromVersion: from,
      toVersion: to,
    });
  }

  async getChangeSets(
    caseId: string,
  ) {
    return this.changeSetModel.find({
      caseId:
        new Types.ObjectId(caseId),
    });
  }

  async agreementVersions(
    caseId: string,
  ) {
    return this.agreementVersionModel
      .find({
        caseId:
          new Types.ObjectId(caseId),
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
    const count =
      await this.agreementVersionModel.countDocuments(
        {
          caseId:
            new Types.ObjectId(caseId),
        },
      );

    return this.agreementVersionModel.create({
      caseId:
        new Types.ObjectId(caseId),

      version:
        `V${count + 1}`,

      fileUrl:
        file?.path ??
        file?.filename,

      uploadedBy:
        new Types.ObjectId(userId),
    });
  }

  async compareAgreements(
    caseId: string,
    left: string,
    right: string,
  ) {
    const first =
      await this.agreementVersionModel.findOne({
        caseId:
          new Types.ObjectId(caseId),

        version: left,
      });

    const second =
      await this.agreementVersionModel.findOne({
        caseId:
          new Types.ObjectId(caseId),

        version: right,
      });

    return {
      left: first,
      right: second,
    };
  }

  async timeline(
    caseId: string,
  ) {
    return this.timelineModel
      .find({
        caseId:
          new Types.ObjectId(caseId),
      })
      .populate('performedBy')
      .sort({
        createdAt: -1,
      });
  }

  async auditLog(
    caseId: string,
  ) {
    return this.auditLogModel
      .find({
        caseId:
          new Types.ObjectId(caseId),
      })
      .populate('userId')
      .sort({
        createdAt: -1,
      });
  }


  async archiveCase(
    caseId: string,
    userId: string,
  ) {
    const caseDoc =
      await this.caseModel.findById(
        caseId,
      );

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    caseDoc.workflowStatus =
      CaseWorkflowStatus.ARCHIVED;

    caseDoc.archivedAt =
      new Date();

    await caseDoc.save();

    await this.createAuditLog(
      caseId,
      userId,
      'CASE_ARCHIVED',
    );

    return caseDoc;
  }


  async completedCases(
    userId: string,
  ) {
    return userId;
  }


  async readyForArchive(
    userId: string,
  ) {
    return this.caseModel.find({
      readyForArchive: true,
    });
  }

}