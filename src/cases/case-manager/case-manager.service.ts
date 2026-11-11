// src/case-manager/case-manager.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { AUDIT_EVENT } from '../../common/audit-log/events/audit.event';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import {
  AuditAction,
  AuditModule as AuditModuleName,
} from '../../common/audit-log/enum/audit-action.enum';

import { Case, CaseWorkflowStatus, MutualApprovalStatus } from '../schemas/case.schema';
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
  LEGACY_AGREEMENT_VERSION_MODEL,
} from '../../cases/schemas/agreement_versions.schema';

import {
  CaseChangeSet,
} from '../../cases/schemas/case_changesets.schema';

import { MailService } from '../../mail/mail.service';
import { AgreementService } from '../../agreement/agreement.service';
// The free-text actions the older case_audit_logs helper is called with, and
// the audit action each one stands for.
const CM_LEGACY_AUDIT_ACTIONS: Record<string, AuditAction> = {
  RETURN_TO_DRAFT: AuditAction.DRAFT_RETURNED,
  NOTE_DELETED: AuditAction.DELETED,
  DOCUMENT_DELETED: AuditAction.DELETED,
  CASE_ARCHIVED: AuditAction.CASE_ARCHIVED,
};

@Injectable()
export class CaseManagerService {
  constructor(
    private readonly mailService: MailService,

    private readonly agreementService: AgreementService,

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

    @InjectModel(LEGACY_AGREEMENT_VERSION_MODEL)
    private readonly agreementVersionModel: Model<AgreementVersion>,

    @InjectModel(CaseChangeSet.name)
    private readonly changeSetModel: Model<CaseChangeSet>,

    @InjectModel(Case.name)
    private readonly caseModel: Model<Case>,

    @InjectModel(Lawyer.name)
    private readonly lawyerModel: Model<Lawyer>,

    private readonly eventEmitter: EventEmitter2,
    private readonly auditLogService: AuditLogService,
  ) { }

  /**
   * One line in the case's audit trail (the audit_logs collection behind the
   * Audit tab). Emitted, so a failed write can never fail the action.
   */
  private recordAudit(entry: {
    caseId: Types.ObjectId | string;
    userId: Types.ObjectId | string;
    action: AuditAction;
    module?: string;
    entityType?: string;
    entityId?: Types.ObjectId | string;
    stage?: string;
    notes?: string;
    changedFields?: Record<string, { old: any; new: any }>;
  }) {
    if (!entry.caseId || !entry.userId) return;
    this.eventEmitter.emit(AUDIT_EVENT, {
      module: entry.module ?? AuditModuleName.CASE_MANAGER,
      entityType: entry.entityType ?? 'Case',
      entityId: entry.entityId ?? entry.caseId,
      caseId: entry.caseId,
      action: entry.action,
      userId: entry.userId,
      userRole: 'case_manager',
      stage: entry.stage,
      notes: entry.notes,
      changedFields: entry.changedFields,
    });
  }

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

      this.caseModel.countDocuments({
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
      await this.caseModel
        .findById(caseId)
        .populate('owner')
        .populate('invitedUser');

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

    await this.mailService.sendCaseReturnedToDraft(
      caseDoc,
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
    const caseDoc =
      await this.caseModel
        .findById(caseId)
        .populate('owner')
        .populate('invitedUser');

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    const now = new Date();
    const actorId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : null;

    caseDoc.workflowStatus =
      CaseWorkflowStatus.CM_APPROVED;

    // Record the approval itself, not just the stage. returnToDraft clears
    // these three, so approve is what has to set them -- and the couple's
    // dashboard and sidebar open their independent-legal-advice steps off
    // approval.caseManagerApproved.
    caseDoc.cmApproved = true;
    caseDoc.cmApprovedAt = now;
    caseDoc.cmApprovedBy = actorId;
    caseDoc.cmReturnReason = null;

    const approval: any =
      (caseDoc as any).approval ?? {};
    approval.caseManagerApproved = true;
    approval.caseManagerApprovedAt = now;
    approval.approvedBy = actorId;
    (caseDoc as any).approval = approval;
    caseDoc.markModified('approval');

    await caseDoc.save();

    this.recordAudit({
      caseId,
      userId,
      action: AuditAction.APPROVED,
      stage: 'Case manager approval',
      notes: dto?.comments
        ? `Case approved — ${dto.comments}`
        : 'Case approved by the case manager',
      changedFields: {
        workflowStatus: {
          old: CaseWorkflowStatus.COUPLE_SUBMITTED,
          new: CaseWorkflowStatus.CM_APPROVED,
        },
        'approval.caseManagerApproved': { old: false, new: true },
      },
    });

    await this.createTimelineEntry(
      caseId,
      userId,
      'CM_APPROVED',
    );

    await this.mailService.sendCaseApproved(
      caseDoc,
    );

    return {
      success: true,
      status:
        CaseWorkflowStatus.CM_APPROVED,
    };
  }

  // ====================================================
  // COUPLE APPROVALS
  // ====================================================

  async requestCoupleApproval(
    caseId: string,
    userId: string,
  ) {
    this.recordAudit({
      caseId,
      userId,
      action: AuditAction.COUPLE_APPROVAL_REQUESTED,
      stage: 'Couple confirmation',
      notes: 'Both partners asked to confirm',
    });

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

    this.recordAudit({
      caseId,
      userId,
      action: AuditAction.UPLOAD_CONFIRMED,
      stage: 'Couple confirmation',
      notes: "Primary applicant's confirmation uploaded",
      changedFields: { p1Confirmed: { old: false, new: true } },
    });

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

    this.recordAudit({
      caseId,
      userId,
      action: AuditAction.UPLOAD_CONFIRMED,
      stage: 'Couple confirmation',
      notes: "Secondary applicant's confirmation uploaded",
      changedFields: { p2Confirmed: { old: false, new: true } },
    });

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
      await this.caseModel
        .findById(caseId)
        .populate('owner')
        .populate('invitedUser');

    if (!caseDoc) {
      throw new NotFoundException();
    }

    const [p1Lawyer, p2Lawyer] =
      await Promise.all([
        this.lawyerModel.findById(
          dto.p1LawyerId,
        ),
        this.lawyerModel.findById(
          dto.p2LawyerId,
        ),
      ]);

    if (!p1Lawyer || !p2Lawyer) {
      throw new BadRequestException(
        'Lawyer not found',
      );
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

    // Create the lawyer-stage baseline (no-op when re-assigning lawyers)
    await this.agreementService.ensureLawyerStageInitialized(
      caseId,
      userId,
    );

    this.recordAudit({
      caseId,
      userId,
      action: AuditAction.LAWYERS_ASSIGNED,
      stage: 'Lawyers assigned',
      notes: `P1: ${(p1Lawyer as any)?.name ?? dto.p1LawyerId}; P2: ${(p2Lawyer as any)?.name ?? dto.p2LawyerId}`,
      changedFields: {
        assignedLawyerP1: { old: null, new: dto.p1LawyerId },
        assignedLawyerP2: { old: null, new: dto.p2LawyerId },
      },
    });

    await this.createTimelineEntry(
      caseId,
      userId,
      'LAWYERS_ASSIGNED',
    );

    await this.mailService.sendLawyerAssignedNotification(
      caseDoc,
      p1Lawyer,
      p2Lawyer,
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

    this.recordAudit({
      caseId,
      userId,
      action: AuditAction.NOTE_CREATED,
      entityType: 'CaseManagerNote',
      entityId: note._id as any,
      stage: 'Case manager notes',
      notes: dto.category ? `${dto.category} note added` : 'Note added',
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
    this.recordAudit({
      caseId,
      userId,
      action: CM_LEGACY_AUDIT_ACTIONS[action] ?? AuditAction.OTHER,
      stage: action,
      notes,
    });

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
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    const safeName = file?.filename ?? file?.originalname ?? ('document-' + Date.now());
    const originalName = file?.originalname ?? safeName;
    const fileUrl = file?.path ?? file?.location ?? file?.filename ?? originalName;

    const document =
      await this.documentModel.create({
        caseId:
          new Types.ObjectId(caseId),

        fileName:
          safeName,

        originalName:
          originalName,

        mimeType:
          file?.mimetype || 'application/octet-stream',

        fileSize:
          file?.size || 0,

        fileUrl:
          fileUrl,

        uploadedBy:
          new Types.ObjectId(userId),
      });

    this.recordAudit({
      caseId,
      userId,
      action: AuditAction.DOCUMENT_UPLOADED,
      module: AuditModuleName.S3,
      entityType: 'CaseDocument',
      entityId: (document as any)._id,
      stage: 'Case documents',
      notes: originalName,
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

  // The case's audit trail, from the audit-log module. The older
  // case_audit_logs rows are mirrored into it, so this is the whole story.
  async auditLog(
    caseId: string,
    options?: { limit?: number; skip?: number },
  ) {
    return this.auditLogService.getCaseTimeline(caseId, options);
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

  async getCasesByStatus(
    userId: string,
    status: string,
    role?: string,
  ) {
    // Every case at this stage, whoever it is assigned to.
    return this.caseModel
      .find({ workflowStatus: status })
      .populate('owner invitedUser assignedCaseManager')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getAllCases(userId: string, role?: string) {
    // Every case, from not paid through completed / archived. The Cases page
    // narrows them with its own stage, payment and case-manager filters.
    return this.caseModel
      .find({})
      .populate('owner invitedUser assignedCaseManager')
      .sort({ createdAt: -1 })
      .exec();
  }
}