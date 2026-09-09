import { createHash } from 'crypto';

import * as mammoth from 'mammoth';
import puppeteer from 'puppeteer';
import { THEME } from './agreement-document.builder';

import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { S3Service } from 'src/common/s3.service';
import { Case, CaseDocument } from '../cases/schemas/case.schema';
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
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { buildAgreementDocxBuffer } from './agreement-document.builder';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT } from '../common/audit-log/events/audit.event';
import {
  AuditAction,
  AuditModule as AuditModuleEnum,
} from '../common/audit-log/enum/audit-action.enum';
import { DiffParagraph, diffParagraphs, extractParagraphs } from 'src/utils/difference.util';

const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME_TYPE = 'application/pdf';

enum AgreementStage {
  USER = 1,
  CM = 2,
  LAWYER = 3,
}

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
    @InjectModel(AgreementVersion.name)
    private documentVersion: Model<AgreementDocument>,
    @InjectModel(Case.name)
    private caseModel: Model<CaseDocument>,
    @InjectModel(AgreementLock.name)
    private lockModel: Model<AgreementLockDocument>,
    private s3Service: S3Service,
    private eventEmitter: EventEmitter2,
  ) {}

  // User agreement Generation code

  async generateAgreementDocument(
    caseId: string,
    actorId: string,
  ): Promise<VersionResult> {
    const { c, actorObjId } = await this.validateCaseAndActor(caseId, actorId);

    const buffer = await buildAgreementDocxBuffer({
      caseId: c._id.toString(),
      myInformation: (c as any).myInformation,
      partnerInformation: (c as any).partnerInformation,
      jointInformation: (c as any).jointInformation,
    });

    const latestUserVersion = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.USER })
      .sort({ minorVersion: -1 })
      .exec();

    const latestOverall = await this.documentVersion
      .findOne({ caseId: c._id })
      .sort({ majorVersion: -1, minorVersion: -1 })
      .exec();

    const nextMinor = latestUserVersion
      ? latestUserVersion.minorVersion + 1
      : 0;

    const fileName = `agreement-${caseId}-${Date.now()}`;
    const upload = await this.uploadDocxAndPdf(buffer, fileName);

    await this.documentVersion.updateMany(
      { caseId: c._id },
      { isCurrent: false },
    );

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const roleMeta = this.resolveEndUserRoleMeta(c, actorObjId);

    const versionDoc = await this.documentVersion.create({
      caseId: c._id,
      majorVersion: AgreementStage.USER,
      minorVersion: nextMinor,
      s3Bucket: Config.aws.s3.bucketName,
      s3Key: upload.docxS3Key,
      s3Url: upload.docxUrl,
      pdfS3Key: upload.pdfS3Key,
      pdfUrl: upload.pdfUrl,
      originalFileName: `agreement-V${AgreementStage.USER}.${nextMinor}_Master.docx`,
      mimeType: DOCX_MIME_TYPE,
      fileSizeBytes: buffer.length,
      checksum,
      checkedInBy: actorObjId,
      checkedInByRole: roleMeta.checkedInByRole,
      roleTag: roleMeta.roleTag,
      versionLabel: roleMeta.versionLabel,
      isCurrent: true,
      previousVersionId: latestOverall?._id ?? null,
    });

    const isLockDocument = await this.lockModel.find({
      caseId: c._id,
    });

    if (!isLockDocument) {
      await this.lockModel.create({
        caseId: c._id,
        lockedBy: null,
        lockedByRole: null,
        lockedAt: new Date(),
      });
    }

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

  // Case Manager agreement Generation code

  async cmGenerateDocument(
    caseId: string,
    actorId: string,
  ): Promise<VersionResult> {
    const { c, actorObjId } = await this.validateCaseAndActor(caseId, actorId);

    const buffer = await buildAgreementDocxBuffer({
      caseId: c._id.toString(),
      myInformation: (c as any).myInformation,
      partnerInformation: (c as any).partnerInformation,
      jointInformation: (c as any).jointInformation,
    });

    const latestCmVersion = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.CM })
      .sort({ minorVersion: -1 })
      .exec();

    const latestOverall = await this.documentVersion
      .findOne({ caseId: c._id })
      .sort({ majorVersion: -1, minorVersion: -1 })
      .exec();

    const nextMinor = latestCmVersion ? latestCmVersion.minorVersion + 1 : 0;

    const fileName = `agreement-${caseId}-${Date.now()}`;
    const upload = await this.uploadDocxAndPdf(buffer, fileName);

    await this.documentVersion.updateMany(
      { caseId: c._id },
      { isCurrent: false },
    );

    const checksum = createHash('sha256').update(buffer).digest('hex');

    const versionDoc = await this.documentVersion.create({
      caseId: c._id,
      majorVersion: AgreementStage.CM,
      minorVersion: nextMinor,
      s3Bucket: Config.aws.s3.bucketName,
      s3Key: upload.docxS3Key,
      s3Url: upload.docxUrl,
      pdfS3Key: upload.pdfS3Key,
      pdfUrl: upload.pdfUrl,
      originalFileName: `agreement-V${AgreementStage.CM}.${nextMinor}_Master.docx`,
      mimeType: DOCX_MIME_TYPE,
      fileSizeBytes: buffer.length,
      checksum,
      checkedInBy: actorObjId,
      checkedInByRole: 'Case Manager',

      roleTag: 'CM',
      versionLabel: 'Case Manager Version',
      isCurrent: true,
      previousVersionId: latestOverall?._id ?? null,
    });

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

    const latestVersion = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.LAWYER })
      .sort({ minorVersion: -1 })
      .exec();

    if (!latestVersion) {
      throw new NotFoundException(
        'Lawyer stage has not been initialized for this case yet',
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

    const latestLawyerVersion = await this.documentVersion
      .findOne({ caseId: c._id, majorVersion: AgreementStage.LAWYER })
      .sort({ minorVersion: -1 })
      .exec();

    const latestOverall = await this.documentVersion
      .findOne({ caseId: c._id })
      .sort({ majorVersion: -1, minorVersion: -1 })
      .exec();

    const nextMinor = latestLawyerVersion
      ? latestLawyerVersion.minorVersion + 1
      : 1;

    const fileName = `agreement-${caseId}-${Date.now()}`;
    const upload = await this.uploadDocxAndPdf(editedBuffer, fileName);

    await this.documentVersion.updateMany(
      { caseId: c._id },
      { isCurrent: false },
    );

    const checksum = createHash('sha256').update(editedBuffer).digest('hex');
    const roleMeta = this.resolveLawyerRoleMeta(lawyerRole);

    const versionDoc = await this.documentVersion.create({
      caseId: c._id,
      majorVersion: AgreementStage.LAWYER,
      minorVersion: nextMinor,
      s3Bucket: Config.aws.s3.bucketName,
      s3Key: upload.docxS3Key,
      s3Url: upload.docxUrl,
      pdfS3Key: upload.pdfS3Key,
      pdfUrl: upload.pdfUrl,
      originalFileName: `agreement-V${AgreementStage.LAWYER}.${nextMinor}_Master.docx`,

      mimeType: DOCX_MIME_TYPE,
      fileSizeBytes: editedBuffer.length,

      checksum,
      checkedInBy: actorObjId,
      checkedInByRole: roleMeta.checkedInByRole,

      amendmentSummary: amendmentSummary,
      roleTag: roleMeta.roleTag,
      versionLabel: roleMeta.versionLabel,
      isCurrent: true,
      previousVersionId: latestOverall?._id ?? null,
    });

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

  private async uploadDocxAndPdf(
    buffer: Buffer,
    baseFileName: string,
  ): Promise<DocxAndPdfUpload> {
    const docxS3Key = `agreement/docx/${baseFileName}.docx`;
    const docxUrl = await this.s3Service.putToBucket(
      buffer,
      docxS3Key,
      DOCX_MIME_TYPE,
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
      console.error(
        `PDF generation failed for ${baseFileName}:`,
        (error as Error).message,
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

    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(styledHtml, { waitUntil: 'load' });
      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
      });
      return Buffer.from(pdfBytes);
    } finally {
      await browser.close();
    }
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

  private async validateCaseAndActor(caseId: string, actorId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const c = await this.caseModel.findById(caseId).exec();
    if (!c) throw new NotFoundException('Case not found');

    if (!Types.ObjectId.isValid(actorId)) {
      throw new BadRequestException('Invalid actor id');
    }
    const actorObjId = new Types.ObjectId(actorId);
    const isOwner = c.owner?.toString() === actorObjId.toString();
    const isInvited = c.invitedUser?.toString() === actorObjId.toString();
    if (!isOwner && !isInvited) {
      throw new ForbiddenException('Actor not part of this case');
    }

    return { c, actorObjId };
  }
}
