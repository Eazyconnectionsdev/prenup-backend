import { createHash } from 'crypto';

import * as mammoth from 'mammoth';
import { THEME } from './agreement-document.builder';

import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { S3Service } from 'src/common/s3.service';
import { Case, CaseDocument } from '../cases/schemas/case.schema';
import { caseLawyerIds } from '../cases/case-access.util';
import {
  AgreementVersion,
  AgreementDocument,
} from './schemas/agreement_version.schema';
import {
  AgreementLock,
  AgreementLockDocument,
} from './schemas/agreement_lock.schema';
import { Config } from '../config';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { buildAgreementDocxBuffer } from './agreement-document.builder';
import { renderHtmlToPdf } from './pdf-renderer';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT } from '../common/audit-log/events/audit.event';
import {
  AuditAction,
  AuditModule as AuditModuleEnum,
} from '../common/audit-log/enum/audit-action.enum';
import { DiffParagraph, diffParagraphs, extractParagraphs } from 'src/utils/difference.util';
import { User, UserDocument } from 'src/users/schemas/user.schema';

const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME_TYPE = 'application/pdf';

const agreementLogger = new Logger('AgreementService');

/**
 * Run a step of document generation, and if it throws, say in the log which
 * step it was before letting the error through. Document generation is a
 * chain of four or five fallible calls (build, S3, version insert, lock) and
 * a bare "Internal server error" does not say which one gave out.
 */
async function logFailure<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const err = error as any;
    agreementLogger.error(
      `Document generation failed while ${what}: ${err?.message ?? err}` +
        (err?.code ? ` (code ${err.code})` : ''),
      err?.stack,
    );
    throw error;
  }
}

enum AgreementStage {
  USER = 1,
  CM = 2,
  LAWYER = 3,
}

type CaseActorRole = 'OWNER' | 'INVITED_USER' | 'CASE_MANAGER' | 'ADMIN' | 'LAWYER_P1' | 'LAWYER_P2';

export interface VersionResult {
  success: boolean;
  fileName: string;
  s3Key: string;
  url: string;
  pdfUrl: string | null;
  majorVersion: number;
  minorVersion: number;
  versionId: Types.ObjectId;
}

export interface DocumentVersionSummary {
  id: string;
  majorVersion: number;
  minorVersion: number;
  label: string;
  createdAt: Date;
}

interface VersionRoleMeta {
  checkedInByRole: string;
  roleTag: string;
  versionLabel: string;
}

interface DocxAndPdfUpload {
  docxS3Key: string;
  docxUrl: string;
  pdfS3Key: string | null;
  pdfUrl: string | null;
}

@Injectable()
export class AgreementService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(AgreementVersion.name)
    private documentVersion: Model<AgreementDocument>,
    @InjectModel(Case.name)
    private caseModel: Model<CaseDocument>,
    @InjectModel(AgreementLock.name)
    private lockModel: Model<AgreementLockDocument>,
    private s3Service: S3Service,
    private eventEmitter: EventEmitter2,
  ) { }


  async generateAgreementDocument(
    caseId: string,
    actorId: string,
  ): Promise<VersionResult> {

    const { c, actorObjId } = await this.validateCaseAndActor(caseId, actorId, [
      'OWNER',
      'INVITED_USER',
    ]);

    if (!c.status?.jointInformation?.locked) {
      throw new BadRequestException(
        'Both partners must approve the joint information before the agreement is generated',
      );
    }

    const buffer = await logFailure(
      `building the docx for case ${caseId}`,
      () =>
        buildAgreementDocxBuffer({
          caseId: c._id.toString(),
          myInformation: (c as any).myInformation,
          partnerInformation: (c as any).partnerInformation,
          jointInformation: (c as any).jointInformation,
        }),
    );

    const fileName = `agreement-${caseId}-${Date.now()}`;
    const upload = await this.uploadDocxAndPdf(buffer, fileName);

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const roleMeta = this.resolveEndUserRoleMeta(c, actorObjId);

    const versionDoc = await logFailure(
      `recording the new version row for case ${caseId}`,
      () =>
      this.createVersionWithRetry(
      c._id,
      AgreementStage.USER,
      0,
      (minorVersion, previousVersionId) => ({
        caseId: c._id,
        majorVersion: AgreementStage.USER,
        minorVersion,
        s3Bucket: Config.aws.s3.bucketName,
        s3Key: upload.docxS3Key,
        s3Url: upload.docxUrl,
        pdfS3Key: upload.pdfS3Key,
        pdfUrl: upload.pdfUrl,
        originalFileName: `agreement-V${AgreementStage.USER}.${minorVersion}_Master.docx`,
        mimeType: DOCX_MIME_TYPE,
        fileSizeBytes: buffer.length,
        checksum,
        checkedInBy: actorObjId,
        checkedInByRole: roleMeta.checkedInByRole,
        roleTag: roleMeta.roleTag,
        versionLabel: roleMeta.versionLabel,
        isCurrent: true,
        previousVersionId,
      }),
      ),
    );

    const nextMinor = versionDoc.minorVersion;

    // This used to be `find()`, whose array result is always truthy, so the
    // lock row was never created. An upsert keeps two concurrent generations
    // from both inserting one - but caseId is uniquely indexed, so when two
    // upserts do race, the loser still gets E11000 back. The row it wanted
    // exists either way, so that duplicate is the success case, not a 500.
    await this.ensureLockRow(c._id);

    this.eventEmitter.emit(AUDIT_EVENT, {
      module: AuditModuleEnum.AGREEMENT,
      entityType: 'AgreementVersion',
      entityId: versionDoc._id,
      caseId: c._id,
      action: AuditAction.DOCUMENT_GENERATED,
      userId: actorObjId,
      userRole: roleMeta.checkedInByRole,
      notes: `Version ${AgreementStage.USER}.${nextMinor} created`,
    });

    return {
      success: true,
      fileName: `${fileName}.docx`,
      s3Key: upload.docxS3Key,
      url: upload.docxUrl,
      pdfUrl: upload.pdfUrl,
      majorVersion: versionDoc.majorVersion,
      minorVersion: versionDoc.minorVersion,
      versionId: versionDoc._id,
    };
  }


  async cmGenerateDocument(
    caseId: string,
    actorId: string,
  ): Promise<VersionResult> {

    const { c, actorObjId } = await this.validateCaseAndActor(caseId, actorId, ['CASE_MANAGER']);

    const buffer = await buildAgreementDocxBuffer({
      caseId: c._id.toString(),
      myInformation: (c as any).myInformation,
      partnerInformation: (c as any).partnerInformation,
      jointInformation: (c as any).jointInformation,
    });

    const fileName = `agreement-${caseId}-${Date.now()}`;
    const upload = await this.uploadDocxAndPdf(buffer, fileName);

    const checksum = createHash('sha256').update(buffer).digest('hex');

    const versionDoc = await this.createVersionWithRetry(
      c._id,
      AgreementStage.CM,
      0,
      (minorVersion, previousVersionId) => ({
        caseId: c._id,
        majorVersion: AgreementStage.CM,
        minorVersion,
        s3Bucket: Config.aws.s3.bucketName,
        s3Key: upload.docxS3Key,
        s3Url: upload.docxUrl,
        pdfS3Key: upload.pdfS3Key,
        pdfUrl: upload.pdfUrl,
        originalFileName: `agreement-V${AgreementStage.CM}.${minorVersion}_Master.docx`,
        mimeType: DOCX_MIME_TYPE,
        fileSizeBytes: buffer.length,
        checksum,
        checkedInBy: actorObjId,
        checkedInByRole: 'Case Manager',
        roleTag: 'CM',
        versionLabel: 'Case Manager Version',
        isCurrent: true,
        previousVersionId,
      }),
    );

    const nextMinor = versionDoc.minorVersion;

    this.eventEmitter.emit(AUDIT_EVENT, {
      module: AuditModuleEnum.AGREEMENT,
      entityType: 'AgreementVersion',
      entityId: versionDoc._id,
      caseId: c._id,

      action: AuditAction.DOCUMENT_GENERATED,
      userId: actorObjId,
      userRole: 'CM',
      notes: `Version ${AgreementStage.CM}.${nextMinor} created`,
    });

    return {
      success: true,
      fileName: `${fileName}.docx`,

      s3Key: upload.docxS3Key,
      url: upload.docxUrl,

      pdfUrl: upload.pdfUrl,
      majorVersion: versionDoc.majorVersion,
      minorVersion: versionDoc.minorVersion,
      versionId: versionDoc._id,
    };
  }

  // Whether the CM stage is initialized, and if not, whether it can be
  // (it copies the latest partner-approved version)
  async getCmStageReadiness(
    caseId: string,
  ): Promise<{ initialized: boolean; canInitialize: boolean }> {
    const id = new Types.ObjectId(caseId);
    const [baseline, userVersion] = await Promise.all([
      this.documentVersion.exists({ caseId: id, majorVersion: AgreementStage.CM }),
      this.documentVersion.exists({ caseId: id, majorVersion: AgreementStage.USER }),
    ]);
    return { initialized: !!baseline, canInitialize: !!baseline || !!userVersion };
  }

  // Creates the CM-stage baseline on demand; does nothing if it already
  // exists. Called when a case manager is assigned to the case, so the CM
  // opens a draft that is already carried over from the couple's approved
  // version rather than having to generate one first.
  async ensureCmStageInitialized(
    caseId: string,
    actorId: string,
  ): Promise<{ initialized: boolean; created: boolean }> {
    const { initialized, canInitialize } = await this.getCmStageReadiness(caseId);
    if (initialized) return { initialized: true, created: false };
    if (!canInitialize) return { initialized: false, created: false };
    try {
      await this.initializeCmStage(caseId, actorId);
    } catch (err: any) {
      // Reassignment and a concurrent generate can both land here; whoever
      // loses the race sees the baseline the other just created.
      const alreadyThere =
        err instanceof ConflictException || err?.code === 11000;
      if (!alreadyThere) throw err;
      return { initialized: true, created: false };
    }
    return { initialized: true, created: true };
  }

  async initializeCmStage(
    caseId: string,
    actorId: string,
  ): Promise<VersionResult> {
    const { c, actorObjId } = await this.validateCaseAndActor(caseId, actorId);

    const existingCmBaseline = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.CM })
      .exec();

    if (existingCmBaseline) {
      throw new ConflictException(
        'CM stage has already been initialized for this case',
      );
    }

    const latestUserVersion = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.USER })
      .sort({ minorVersion: -1 })
      .exec();

    if (!latestUserVersion) {
      throw new NotFoundException(
        'No partner-approved document found to carry into the CM stage',
      );
    }

    await this.documentVersion.updateMany(
      { caseId: c._id },
      { isCurrent: false },
    );

    // Same underlying files as the couple's version — reuse both docx and pdf
    // rather than reconverting an identical document.
    const versionDoc = await this.documentVersion.create({
      caseId: c._id,
      majorVersion: AgreementStage.CM,
      minorVersion: 0,
      s3Bucket: latestUserVersion.s3Bucket,
      s3Key: latestUserVersion.s3Key,
      s3Url: latestUserVersion.s3Url,
      pdfS3Key: latestUserVersion.pdfS3Key,
      pdfUrl: latestUserVersion.pdfUrl,
      originalFileName: `agreement-V${AgreementStage.CM}.0_Master.docx`,
      mimeType: DOCX_MIME_TYPE,
      fileSizeBytes: latestUserVersion.fileSizeBytes,
      checksum: latestUserVersion.checksum,
      checkedInBy: actorObjId,
      checkedInByRole: 'Case Manager',
      roleTag: 'CM',
      versionLabel: 'Case Manager Stage Baseline',
      isCurrent: true,
      previousVersionId: latestUserVersion._id,
    });

    this.eventEmitter.emit(AUDIT_EVENT, {
      module: AuditModuleEnum.AGREEMENT,
      entityType: 'AgreementVersion',
      entityId: versionDoc._id,
      caseId: c._id,
      action: AuditAction.STATUS_CHANGED,
      userId: actorObjId,
      notes: `CM stage initialized — baseline version ${AgreementStage.CM}.0 created`,
    });

    return {
      success: true,
      fileName: versionDoc.originalFileName,
      s3Key: versionDoc.s3Key,
      url: versionDoc.s3Url ?? versionDoc.s3Key,
      pdfUrl: versionDoc.pdfUrl,
      majorVersion: versionDoc.majorVersion,
      minorVersion: versionDoc.minorVersion,
      versionId: versionDoc._id,
    };
  }

  // Whether the lawyer stage is initialized, and if not, whether it can be
  // (it copies the latest CM-approved version)
  async getLawyerStageReadiness(
    caseId: string,
  ): Promise<{ initialized: boolean; canInitialize: boolean }> {
    const id = new Types.ObjectId(caseId);
    const [baseline, cmVersion] = await Promise.all([
      this.documentVersion.exists({ caseId: id, majorVersion: AgreementStage.LAWYER }),
      this.documentVersion.exists({ caseId: id, majorVersion: AgreementStage.CM }),
    ]);
    return { initialized: !!baseline, canInitialize: !!baseline || !!cmVersion };
  }

  // Creates the lawyer-stage baseline on demand; does nothing if it already
  // exists. The trigger is the case manager approving the case
  // (CaseManagerService.approveCase), which freezes the approved CM draft as
  // what the solicitors work from. Also called when the CM assigns lawyers,
  // and as a backstop on a lawyer's first check-out, for cases approved
  // before the approval trigger existed.
  async ensureLawyerStageInitialized(
    caseId: string,
    actorId: string,
  ): Promise<{ initialized: boolean; created: boolean }> {
    const { initialized, canInitialize } = await this.getLawyerStageReadiness(caseId);
    if (initialized) return { initialized: true, created: false };
    if (!canInitialize) return { initialized: false, created: false };
    try {
      await this.initializeLawyerStage(caseId, actorId);
    } catch (err: any) {
      // Both lawyers can check out at the same moment. Whoever loses the race
      // sees the baseline the other just created, which is all they needed.
      const alreadyThere =
        err instanceof ConflictException || err?.code === 11000;
      if (!alreadyThere) throw err;
      return { initialized: true, created: false };
    }
    return { initialized: true, created: true };
  }

  async initializeLawyerStage(
    caseId: string,
    actorId: string,
  ): Promise<VersionResult> {
    const { c, actorObjId } = await this.validateCaseAndActor(caseId, actorId);

    const existingLawyerBaseline = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.LAWYER })
      .exec();

    if (existingLawyerBaseline) {
      throw new ConflictException(
        'Lawyer stage has already been initialized for this case',
      );
    }

    const latestCmVersion = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.CM })
      .sort({ minorVersion: -1 })
      .exec();

    if (!latestCmVersion) {
      throw new NotFoundException(
        'No CM-approved document found to carry into lawyer stage',
      );
    }

    await this.documentVersion.updateMany(
      { caseId: c._id },
      { isCurrent: false },
    );

    // Same underlying files as the CM version — reuse both docx and pdf
    // rather than reconverting an identical document.
    const versionDoc = await this.documentVersion.create({
      caseId: c._id,
      majorVersion: AgreementStage.LAWYER,
      minorVersion: 0,
      s3Bucket: latestCmVersion.s3Bucket,

      s3Key: latestCmVersion.s3Key,
      s3Url: latestCmVersion.s3Url,
      pdfS3Key: latestCmVersion.pdfS3Key,
      pdfUrl: latestCmVersion.pdfUrl,
      originalFileName: `agreement-V${AgreementStage.LAWYER}.0_Master.docx`,
      mimeType: DOCX_MIME_TYPE,
      fileSizeBytes: latestCmVersion.fileSizeBytes,
      checksum: latestCmVersion.checksum,
      checkedInBy: actorObjId,
      checkedInByRole: 'Lawyer',
      roleTag: 'Lawyer',
      versionLabel: 'Lawyer Stage Baseline',
      isCurrent: true,
      previousVersionId: latestCmVersion._id,
    });

    this.eventEmitter.emit(AUDIT_EVENT, {
      module: AuditModuleEnum.AGREEMENT,
      entityType: 'AgreementVersion',

      entityId: versionDoc._id,
      caseId: c._id,
      action: AuditAction.STATUS_CHANGED,
      userId: actorObjId,
      notes: 'Lawyer stage initialized — baseline version 3.0 created',
    });

    return {
      success: true,
      fileName: versionDoc.originalFileName,
      s3Key: versionDoc.s3Key,
      url: versionDoc.s3Url ?? versionDoc.s3Key,
      pdfUrl: versionDoc.pdfUrl,
      majorVersion: versionDoc.majorVersion,
      minorVersion: versionDoc.minorVersion,
      versionId: versionDoc._id,
    };
  }

  async lawyerCheckOut(
    caseId: string,
    lawyerId: string,
    lawyerRole: string,
  ): Promise<{ s3Key: string; url: string; versionId: Types.ObjectId }> {
    const { c, actorObjId } = await this.validateCaseAndActor(caseId, lawyerId);

    const existingLock = await this.lockModel.findOne({ caseId: c._id }).exec();

    if (existingLock && existingLock.lockedBy) {
      if (existingLock.lockedBy.toString() === actorObjId.toString()) {
        throw new ConflictException(
          'You already have this document checked out',
        );
      }
      throw new ConflictException(
        'Document is currently checked out by another lawyer',
      );
    }

    // The baseline is created lazily, so this may be the first check-out on
    // the case: carry the latest CM version over into the lawyer stage now.
    await this.ensureLawyerStageInitialized(caseId, lawyerId);

    const latestVersion = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.LAWYER })
      .sort({ minorVersion: -1 })
      .exec();

    if (!latestVersion) {
      throw new BadRequestException(
        'The case manager has not finalised a draft for this case yet, so there is nothing to check out',
      );
    }

    await this.lockModel.create({
      caseId: c._id,
      lockedBy: actorObjId,
      lockedByRole: lawyerRole,
      lockedAt: new Date(),
    });

    this.eventEmitter.emit(AUDIT_EVENT, {
      module: AuditModuleEnum.AGREEMENT,
      entityType: 'AgreementVersion',
      entityId: latestVersion._id,
      caseId: c._id,
      action: AuditAction.CHECKED_OUT,
      userId: actorObjId,
      userRole: lawyerRole,
      notes: `Checked out v${latestVersion.majorVersion}.${latestVersion.minorVersion}`,
    });

    return {
      s3Key: latestVersion.s3Key,
      url: latestVersion.s3Url ?? latestVersion.s3Key,
      versionId: latestVersion._id,
    };
  }

  async lawyerCheckIn(
    caseId: string,
    lawyerId: string,
    lawyerRole: string,
    editedBuffer: Buffer,
    amendmentSummaryRaw: string,
  ): Promise<VersionResult> {
    if (!editedBuffer) {
      throw new BadRequestException('No file uploaded');
    }

    let amendmentSummary;
    if (amendmentSummaryRaw) {
      try {
        amendmentSummary = JSON.parse(amendmentSummaryRaw);
      } catch {
        throw new BadRequestException('amendmentSummary must be valid JSON');
      }
    }

    const { c, actorObjId } = await this.validateCaseAndActor(caseId, lawyerId);

    const lock = await this.lockModel.findOne({ caseId: c._id }).exec();

    if (
      !lock ||
      !lock.lockedBy ||
      lock.lockedBy.toString() !== actorObjId.toString()
    ) {
      throw new ForbiddenException('This document is not checked out by you');
    }

    const fileName = `agreement-${caseId}-${Date.now()}`;
    const upload = await this.uploadDocxAndPdf(editedBuffer, fileName);

    const checksum = createHash('sha256').update(editedBuffer).digest('hex');
    const roleMeta = this.resolveLawyerRoleMeta(lawyerRole);

    const versionDoc = await this.createVersionWithRetry(
      c._id,
      AgreementStage.LAWYER,
      1,
      (minorVersion, previousVersionId) => ({
        caseId: c._id,
        majorVersion: AgreementStage.LAWYER,
        minorVersion,
        s3Bucket: Config.aws.s3.bucketName,
        s3Key: upload.docxS3Key,
        s3Url: upload.docxUrl,
        pdfS3Key: upload.pdfS3Key,
        pdfUrl: upload.pdfUrl,
        originalFileName: `agreement-V${AgreementStage.LAWYER}.${minorVersion}_Master.docx`,
        mimeType: DOCX_MIME_TYPE,
        fileSizeBytes: editedBuffer.length,
        checksum,
        checkedInBy: actorObjId,
        checkedInByRole: roleMeta.checkedInByRole,
        amendmentSummary: amendmentSummary,
        roleTag: roleMeta.roleTag,
        versionLabel: roleMeta.versionLabel,
        isCurrent: true,
        previousVersionId,
      }),
    );

    const nextMinor = versionDoc.minorVersion;

    await this.lockModel.deleteOne({ caseId: c._id }).exec();

    this.eventEmitter.emit(AUDIT_EVENT, {
      module: AuditModuleEnum.AGREEMENT,
      entityType: 'AgreementVersion',
      entityId: versionDoc._id,
      caseId: c._id,
      action: AuditAction.CHECKED_IN,
      userId: actorObjId,
      userRole: lawyerRole,
      notes: `Checked in v${AgreementStage.LAWYER}.${nextMinor}`,
    });

    return {
      success: true,
      fileName: `${fileName}.docx`,
      s3Key: upload.docxS3Key,
      url: upload.docxUrl,
      pdfUrl: upload.pdfUrl,
      majorVersion: versionDoc.majorVersion,
      minorVersion: versionDoc.minorVersion,
      versionId: versionDoc._id,
    };
  }

  async lawyerManualRelease(
    caseId: string,

    lawyerId: string,
    lawyerRole: string,
  ): Promise<{ success: boolean }> {
    const { c, actorObjId } = await this.validateCaseAndActor(caseId, lawyerId);

    const lock = await this.lockModel.findOne({ caseId: c._id }).exec();

    if (
      !lock ||
      !lock.lockedBy ||
      lock.lockedBy.toString() !== actorObjId.toString()
    ) {
      throw new ForbiddenException('This document is not checked out by you');
    }

    await this.lockModel.deleteOne({ caseId: c._id }).exec();

    this.eventEmitter.emit(AUDIT_EVENT, {
      module: AuditModuleEnum.AGREEMENT,
      entityType: 'Case',
      entityId: c._id,
      caseId: c._id,

      action: AuditAction.CHECKED_OUT,

      userId: actorObjId,
             userRole: lawyerRole,
      notes: 'Lock manually released without uploading changes',
    });

    return { success: true };
    }

  async findAllVersions(caseId: string) {
    const versions = await this.documentVersion
      .find({ caseId: new Types.ObjectId(caseId) })
      .sort({ majorVersion: -1, minorVersion: -1 })
      .populate('checkedInBy', 'name')
      .lean();

    return versions.map((v) => ({
      id: v._id.toString(),
      version: `v${v.majorVersion}.${v.minorVersion}`,
      title: v.versionLabel,
      by: (v.checkedInBy as any)?.name ?? 'Unknown',
      role: v.checkedInByRole,
      roleTag: v.roleTag,
      date: v.createdAt,
      isLatest: v.isCurrent,
      amendmentSummary: v.amendmentSummary,
    }));
  }

  async getVersionDetail(caseId: string, versionId: string) {
    if (!Types.ObjectId.isValid(caseId) || !Types.ObjectId.isValid(versionId)) {
      throw new BadRequestException('Invalid case id or version id');
    }

    const version = await this.documentVersion
      .findOne({
        _id: new Types.ObjectId(versionId),
        caseId: new Types.ObjectId(caseId),
      })
      .populate('checkedInBy', 'name')

      .populate('previousVersionId', 'majorVersion minorVersion')
      .lean();

    if (!version) {
      throw new NotFoundException('Version not found for this case');
    }

    const lock = await this.lockModel
      .findOne({ caseId: new Types.ObjectId(caseId) })
      .populate('lockedBy', 'name')
      .lean();

    const checkedInBy = version.checkedInBy as any;
    const previous = version.previousVersionId as any;

    return {
      id: version._id.toString(),
      version: `v${version.majorVersion}.${version.minorVersion}`,
      title: version.versionLabel,
      isCurrent: version.isCurrent,
      fileUrl: version.s3Url ?? version.s3Key,
      pdfUrl: version.pdfUrl ?? null,
      fileName: version.originalFileName,
      mimeType: version.mimeType,
      fileSizeBytes: version.fileSizeBytes,
      fileSizeLabel: this.formatBytes(version.fileSizeBytes),
      checksum: version.checksum,
      uploadedByName: checkedInBy?.name ?? 'Unknown',
      uploadedByRole: version.checkedInByRole,
      roleTag: version.roleTag,

      uploadedAt: version.createdAt,
      previousVersion: previous
        ? `v${previous.majorVersion}.${previous.minorVersion}`
        : null,
      lock: {
        isLocked: !!lock?.lockedBy,
        lockedByName: (lock?.lockedBy as any)?.name ?? null,
        lockedByRole: lock?.lockedByRole ?? null,

        lockedAt: lock?.lockedAt ?? null,
      },
    };
  }

  async getCurrentLockStatus(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }
  }

  async getLockStatus(caseId: string, lawyerId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const lock = await this.lockModel
      .findOne({ caseId: new Types.ObjectId(caseId) })
      .populate('lockedBy')
      .lean();

    const lockedByDoc = lock?.lockedBy as any;
    const isLocked = !!lockedByDoc;

    return {
      isLocked,
      lockedByName: lockedByDoc?.name ?? null,
      lockedByRole: lock?.lockedByRole ?? null,
      lockedAt: lock?.lockedAt ?? null,
      isLockedByCurrentUser: isLocked && lockedByDoc._id.equals(lawyerId),
    };
  }

  async compareVersions(
    caseId: string,
    actorId: string,
    versionAId: string,
    versionBId: string,
  ): Promise<DiffParagraph[]> {
    const { c } = await this.validateCaseAndActor(caseId, actorId);

    if (versionAId === versionBId) {
      throw new BadRequestException('Cannot compare a version with itself');
    }

    const [versionA, versionB] = await Promise.all([
      this.documentVersion.findOne({ _id: versionAId, caseId: c._id }).exec(),
      this.documentVersion.findOne({ _id: versionBId, caseId: c._id }).exec(),
    ]);

    if (!versionA || !versionB) {
      throw new NotFoundException('One or both versions not found for this case');
    }

    const isAOlder =
      versionA.majorVersion !== versionB.majorVersion
        ? versionA.majorVersion < versionB.majorVersion
        : versionA.minorVersion <= versionB.minorVersion;

    const [older, newer] = isAOlder ? [versionA, versionB] : [versionB, versionA];

    const [olderBuffer, newerBuffer] = await Promise.all([
      this.s3Service.getFromBucket(older.s3Key),
      this.s3Service.getFromBucket(newer.s3Key),
    ]);

    const [olderParagraphs, newerParagraphs] = await Promise.all([
      extractParagraphs(olderBuffer),
      extractParagraphs(newerBuffer),
    ]);

    return diffParagraphs(olderParagraphs, newerParagraphs);
  }

  // private functions

  // (caseId, majorVersion, minorVersion) is a unique index, so two requests
  // that read the same latest version both try to write the same number and
  // the loser used to come back as a 500 -- which is what a double-fired
  // "generate" after approval looked like. Recompute and retry instead.
  private async createVersionWithRetry(
    caseObjId: Types.ObjectId,
    majorVersion: AgreementStage,
    firstMinor: number,
    build: (
      minorVersion: number,
      previousVersionId: Types.ObjectId | null,
    ) => Record<string, any>,
  ): Promise<AgreementDocument> {
    const MAX_ATTEMPTS = 5;

    for (let attempt = 1; ; attempt++) {
      const [latestSameStage, latestOverall] = await Promise.all([
        this.documentVersion
          .findOne({ caseId: caseObjId, majorVersion })
          .sort({ minorVersion: -1 })
          .exec(),
        this.documentVersion
          .findOne({ caseId: caseObjId })
          .sort({ majorVersion: -1, minorVersion: -1 })
          .exec(),
      ]);

      const minorVersion = latestSameStage
        ? latestSameStage.minorVersion + 1
        : firstMinor;

      try {
        const created = await this.documentVersion.create(
          build(minorVersion, latestOverall?._id ?? null),
        );
        // Only once the new version exists, so a failed insert cannot leave
        // the case with no current version at all.
        await this.documentVersion.updateMany(
          { caseId: caseObjId, _id: { $ne: created._id } },
          { isCurrent: false },
        );
        return created;
      } catch (err: any) {
        if (err?.code === 11000 && attempt < MAX_ATTEMPTS) continue;
        throw err;
      }
    }
  }

  /** Create the case's lock row if it has none, tolerating a concurrent insert. */
  private async ensureLockRow(caseObjId: Types.ObjectId): Promise<void> {
    try {
      await this.lockModel.updateOne(
        { caseId: caseObjId },
        {
          $setOnInsert: {
            caseId: caseObjId,
            lockedBy: null,
            lockedByRole: null,
            lockedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if ((error as any)?.code === 11000) return;
      throw error;
    }
  }

  private async uploadDocxAndPdf(
    buffer: Buffer,
    baseFileName: string,
  ): Promise<DocxAndPdfUpload> {
    const docxS3Key = `agreement/docx/${baseFileName}.docx`;
    // The docx upload is the one step here that is allowed to fail the whole
    // request (without the master file there is no version to record), so it
    // is also the step most worth naming in the log.
    const docxUrl = await logFailure(
      `uploading the agreement docx to S3 (${docxS3Key})`,
      () => this.s3Service.putToBucket(buffer, docxS3Key, DOCX_MIME_TYPE),
    );

    let pdfS3Key: string | null = null;
    let pdfUrl: string | null = null;

    try {
      const pdfBuffer = await this.convertDocxToPdf(buffer);
      pdfS3Key = `agreement/pdf/${baseFileName}.pdf`;
      pdfUrl = await this.s3Service.putToBucket(
        pdfBuffer,
        pdfS3Key,
        PDF_MIME_TYPE,
      );
    } catch (error) {
      // Deliberately swallowed: the docx is the master, a missing PDF only
      // costs the preview. The stack matters though - a Chromium that cannot
      // launch on the server looks identical to "no PDF" without it.
      pdfS3Key = null;
      pdfUrl = null;
      agreementLogger.error(
        `PDF generation failed for ${baseFileName}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
    return { docxS3Key, docxUrl, pdfS3Key, pdfUrl };
  }

  private async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    // "Title" isn't in mammoth's default style map, so without this it
    // silently becomes a plain, unstyled paragraph — this line is what
    // gets it back as something we can actually target with CSS.
    const { value: html } = await mammoth.convertToHtml(
      { buffer: docxBuffer },
      { styleMap: ["p[style-name='Title'] => h1.doc-title:fresh"] },
    );

    const styledHtml = `
  <html>
    <head>
      <style>
        @page { margin: 13mm 15mm; }
        body {
          font-family: ${THEME.bodyFont}, sans-serif;
          font-size: 16pt;
          line-height: 1.5;
          color: #${THEME.text};
        }
        h1.doc-title {
          font-family: ${THEME.headingFont}, serif;
          font-size: 30pt;
          font-weight: bold;
          color: #${THEME.navy};
          text-align: center;
          margin-bottom: 4pt;
        }
        h1 {
          font-family: ${THEME.headingFont}, serif;
          font-size: 22pt;
          font-weight: bold;
          color: #${THEME.navy};
          border-bottom: 1pt solid #${THEME.navy};
          padding-bottom: 4pt;
          margin-top: 18pt;
        }
        h2 {
          font-family: ${THEME.headingFont}, serif;
          font-size: 18pt;
          font-weight: bold;
          color: #${THEME.slate};
          margin-top: 12pt;
        }
        strong {
          color: #${THEME.navy};
        }
        p {
          font-size: 16pt;
          margin: 4pt 0;
        }
      </style>
    </head>
    <body>${html}</body>
  </html>
`;

    return renderHtmlToPdf(styledHtml);
  }

  private formatBytes(bytes?: number): string {
    if (!bytes) return '--';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private resolveEndUserRoleMeta(
    c: CaseDocument,
    actorObjId: Types.ObjectId,
  ): VersionRoleMeta {
    const isOwner = c.owner?.toString() === actorObjId.toString();
    return isOwner
      ? { checkedInByRole: 'P1', roleTag: 'P1', versionLabel: 'P1 Draft' }
      : { checkedInByRole: 'P2', roleTag: 'P2', versionLabel: 'P2 Draft' };
  }

  private resolveLawyerRoleMeta(lawyerRole: string): VersionRoleMeta {
    const isP1Lawyer = /p1/i.test(lawyerRole);
    return {
      checkedInByRole: lawyerRole,
      roleTag: isP1Lawyer ? 'L1' : 'L2',
      versionLabel: 'Lawyer Revision',
    };
  }


  private async validateCaseAndActor(
    caseId: string,
    actorId: string,
    allowedRoles?: CaseActorRole[],
  ): Promise<{ c: CaseDocument; actorObjId: Types.ObjectId; role: CaseActorRole }> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const c = await this.caseModel.findById(caseId).exec();
    if (!c) throw new NotFoundException('Case not found');

    if (!Types.ObjectId.isValid(actorId)) {
      throw new BadRequestException('Invalid actor id');
    }

    const actorObjId = new Types.ObjectId(actorId);
    const actorIdStr = actorObjId.toString();

    const actorUser = await this.userModel.findById(actorObjId).exec();
    if (!actorUser) {
      throw new ForbiddenException('Actor not found');
    }

    let matchedRole: CaseActorRole | null = null;

    switch (actorUser.role) {
      case 'superadmin':
      case 'admin':
        matchedRole = 'ADMIN';
        break;

      case 'case_manager':
        matchedRole = 'CASE_MANAGER';
        break;

      case 'lawyer': {
        // Each partner's own choice of solicitor, with the case manager's
        // older assignment as the fallback (see caseLawyerIds).
        const { p1: p1LawyerId, p2: p2LawyerId } = caseLawyerIds(c as any);
        const myIds = [actorIdStr, actorUser.lawyerProfile?.toString()].filter(Boolean);

        if (p1LawyerId && myIds.includes(p1LawyerId)) {
          matchedRole = 'LAWYER_P1';
        } else if (p2LawyerId && myIds.includes(p2LawyerId)) {
          matchedRole = 'LAWYER_P2';
        }
        break;
      }

      case 'end_user': {
        if (c.owner?.toString() === actorIdStr) {
          matchedRole = 'OWNER';
        } else if (c.invitedUser?.toString() === actorIdStr) {
          matchedRole = 'INVITED_USER';
        }
        break;
      }
    }

    if (!matchedRole) {
      throw new ForbiddenException('Actor not part of this case');
    }

    if (allowedRoles && !allowedRoles.includes(matchedRole)) {
      throw new ForbiddenException(`Actor role ${matchedRole} is not permitted for this action`);
    }

    return { c, actorObjId, role: matchedRole };
  }
}
