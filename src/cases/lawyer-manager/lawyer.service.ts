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

import { CreateNoteDto } from '../case-manager/dto/create-note.dto';
import { CreateVersionDto } from '../case-manager/dto/create-version.dto';
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
export class LawyerService {
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

  async dashboard(userId: string) {
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

  // ====================================================
  // OVERVIEW
  // ====================================================

  async caseOverview(caseId: string) {
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

  async status(caseId: string) {
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

  async notes(caseId: string) {
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

  async documents(
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


  async versions(
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


  async version(
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

  async changeSets(
    caseId: string,
  ) {
    return this.changeSetModel.find({
      caseId:
        new Types.ObjectId(caseId),
    });
  }

  async agreements(
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




  async completedCases(
    userId: string,
  ) {
    return userId;
  }


  async stageSummary(userId: string) {
    return {
      lawyersAssigned:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYERS_ASSIGNED,
        }),

      review:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYER_REVIEW,
        }),

      ila:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYER_ILA_PENDING,
        }),

      signoff:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.LAWYER_SIGNOFF_COMPLETE,
        }),

      completed:
        await this.caseModel.countDocuments({
          workflowStatus:
            CaseWorkflowStatus.COMPLETED,
        }),
    };
  }


  async reviewComplete(
    caseId: string,
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


  async requestILA(
    caseId: string,
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
      CaseWorkflowStatus.LAWYER_ILA_PENDING;

    await caseDoc.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'ILA_REQUESTED',
    );

    return caseDoc;
  }

  async completeP1ILA(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p1ILACompleted = true;

    c.p1ILACompletedAt =
      new Date();

    c.p1ILAFile =
      file?.path ?? file?.filename;

    await c.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'P1_ILA_COMPLETED',
    );

    return c;
  }


  async completeP2ILA(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.p2ILACompleted = true;

    c.p2ILACompletedAt =
      new Date();

    c.p2ILAFile =
      file?.path ?? file?.filename;

    await c.save();

    await this.createTimelineEntry(
      caseId,
      userId,
      'P2_ILA_COMPLETED',
    );

    return c;
  }

  async ilaStatus(
    caseId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);

    return {
      p1ILACompleted:
        c?.p1ILACompleted,

      p2ILACompleted:
        c?.p2ILACompleted,

      p1ILACompletedAt:
        c?.p1ILACompletedAt,

      p2ILACompletedAt:
        c?.p2ILACompletedAt,
    };
  }


  async p1Signoff(
    caseId: string,
    userId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException();
    }

    c.p1LawyerSigned = true;

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

  async p2Signoff(
    caseId: string,
    userId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException();
    }

    c.p2LawyerSigned = true;

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

  async finalP1Confirmation(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.finalP1Confirmed = true;

    c.finalP1ConfirmedAt =
      new Date();

    await c.save();

    return c;
  }


  async finalP2Confirmation(
    caseId: string,
    file: any,
    userId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);
 
    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }           c

    c.finalP2Confirmed = true;

    c.finalP2ConfirmedAt =
      new Date();

    await c.save();

    return c;
  }

  async confirmations(
    caseId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);

    return {
      finalP1Confirmed:
        c?.finalP1Confirmed,

      finalP2Confirmed:
        c?.finalP2Confirmed,

      finalP1ConfirmedAt:
        c?.finalP1ConfirmedAt,

      finalP2ConfirmedAt:
        c?.finalP2ConfirmedAt,
    };
  }


  async completeCase(
    caseId: string,
    userId: string,
  ) {
    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException();
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

    c.readyForArchive = true;

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




}