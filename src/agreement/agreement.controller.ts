import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Body,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AgreementService } from './agreement.service';

import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CompareVersionsDto } from './dto/compare-versions.dto';

@Controller('agreement/:caseId/document')
export class AgreementController {
  constructor(private readonly agreementService: AgreementService) {}

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  async generate(@Param('caseId') caseId: string, @Req() req) {
    return this.agreementService.generateAgreementDocument(caseId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cm/generate')
  async cmGenerate(@Param('caseId') caseId: string, @Req() req) {
    return this.agreementService.cmGenerateDocument(caseId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('lawyer/initialize')
  async initializeLawyerStage(@Param('caseId') caseId: string, @Req() req) {
    return this.agreementService.initializeLawyerStage(caseId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('lawyer/checkout')
  async checkOut(@Param('caseId') caseId: string, @Req() req) {
    return this.agreementService.lawyerCheckOut(
      caseId,
      req.user.id,
      req.user.role,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('lawyer/checkin')
  @UseInterceptors(FileInterceptor('file'))
  async checkIn(
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('amendmentSummary') amendmentSummaryRaw: string,
    @Req() req,
  ) {

    return this.agreementService.lawyerCheckIn(
      caseId,
      req.user.id,
      req.user.role,
      file.buffer,
      amendmentSummaryRaw,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('lawyer/release')
  async release(@Param('caseId') caseId: string, @Req() req) {
    return this.agreementService.lawyerManualRelease(
      caseId,
      req.user.id,
      req.user.role,
    );
  }
  @UseGuards(JwtAuthGuard)
  @Get('lawyer/lock-status')
  async getLockStatus(@Param('caseId') caseId: string, @Req() req) {
    return this.agreementService.getLockStatus(caseId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('all-versions')
  async findAllVersions(@Param('caseId') caseId: string) {
    return this.agreementService.findAllVersions(caseId);
  }

  @Get(':documentId/detail')
  getVersionDetail(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.agreementService.getVersionDetail(caseId, documentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('compare')
  async compare(
    @Param('caseId') caseId: string,
    @Query() query: CompareVersionsDto,
    @Req() req,
  ) {
    return this.agreementService.compareVersions(
      caseId,
      req.user.id,
      query.versionA,
      query.versionB,
    );
  }
}
