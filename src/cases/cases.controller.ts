// src/cases/cases.controller.ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Step1Dto } from './dto/step1.dto';
import { Step2Dto } from './dto/step2.dto';
import { Step3Dto } from './dto/step3.dto';
import { Step4Dto } from './dto/step4.dto';
import { Step5Dto } from './dto/step5.dto';
import { Step6Dto } from './dto/step6.dto';
import { Step7Dto } from './dto/step7.dto';
import { LawyersService } from './lawyer.service';

const END_USER1_STEPS = [1, 2, 5, 6, 7];
const END_USER2_STEPS = [3, 4];

/**
 * Step 5 UI text (mirrors frontend JointAssetsPage)
 */
const STEP5_HEADING = "Joint assets";
const STEP5_QUESTIONS = [
  `Do you have any shared earnings or earnings you'd like to share in the event of a divorce or separation?`,
  `Do you currently (or will you once married) live in a property that is rented or owned by one or both of you?`,
  `Do you have any shared savings or savings you'd like to share in the event of a divorce or separation?`,
  `Do you have any shared pensions or pensions you'd like to share in the event of a divorce or separation?`,
];
const STEP5_FOLLOW_UPS = [
  `Do you have any shared debts or debts you'd like to share in the event of a divorce or separation? This includes current credit card balances, loans, etc.`,
  `Do you have any shared businesses or businesses you'd like to share in the event of a divorce or separation?`,
  `Do you have any shared chattels or chattels you'd like to share in the event of a divorce or separation?`,
  `Do you have any other shared assets or any other assets you'd like to share in the event of a divorce or separation?`,
];

/**
 * Step 6 UI text (mirrors frontend FutureAssetsPage)
 */
const STEP6_HEADING = "Future Assets";
const STEP6_QUESTIONS = [
  `If one of you inherits something, will the inheritance be considered the separate asset (Separate) for the person who inherits it, or a joint asset (Joint) shared between both of you?`,
  `If one of you is gifted something, will the gift be considered a separate asset (Separate) for whichever of you receives it, or a joint asset (Joint) shared between both of you?`,
  `Do you want any future assets or debts acquired in either of your sole names to be treated as Joint or Separate?`,
  `This agreement governs what happens in the event of divorce not death, however it is advisable that you make a new Will once you are married. Do you expect what you leave each other in the event of one of your deaths to be the same as the way your assets will be split in the event of a divorce?`,
];

@Controller('cases')
export class CasesController {
  constructor(private casesService: CasesService, private lawyersService: LawyersService) {}

  private ensureUser(req: any) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Authentication required');
    return user;
  }

  private isPrivilegedRole(role?: string) {
    return role === 'superadmin' || role === 'admin' || role === 'case_manager';
  }

  /** Create a new case */
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req, @Body() body: CreateCaseDto) {
    const user = this.ensureUser(req);
    const title = body.title;
    return this.casesService.create(user.id, title);
  }

  /**
   * List cases:
   * - admins / superadmin / case_manager -> all cases
   * - others -> cases where they are owner or invitedUser
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);
    if (isPrivileged) {
      return this.casesService.findAll();
    }
    return this.casesService.findByUser(user.id);
  }

  /** Get case by id. Privileged users get populated owner/invitedUser */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);

    const c = await this.casesService.findById(id, isPrivileged);
    if (!c) throw new NotFoundException('Case not found');

    // Non-privileged users should only access if owner or invitedUser
    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();
      const ownerId = c.owner?.toString();
      const invitedId = c.invitedUser?.toString();
      if (ownerId !== userIdStr && invitedId !== userIdStr) {
        throw new ForbiddenException('Forbidden');
      }
    }

    return c;
  }

  /** Invite a user to a case */
  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  async invite(@Req() req, @Param('id') id: string, @Body('email') email: string) {
    const user = this.ensureUser(req);
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    // only privileged or owner can invite
    const isPrivileged = this.isPrivilegedRole(user.role);
    const userIdStr = (user.id ?? user._id)?.toString();
    if (!(isPrivileged || c.owner?.toString() === userIdStr)) {
      throw new ForbiddenException('Forbidden');
    }

    return this.casesService.invite(id, user.id, email);
  }

  /** Attach invited user to a case (accept invite) */
  @UseGuards(JwtAuthGuard)
  @Post(':id/attach-invited')
  async attachInvitedUser(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    return this.casesService.attachInvitedUser(id, user.id);
  }

  /**
   * Get a single step. Special-case step 5 and 6 to return UI-shaped payloads.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id/steps/:stepNumber')
  async getStep(@Req() req, @Param('id') id: string, @Param('stepNumber') stepNumberStr: string) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);

    const c = await this.casesService.findById(id, isPrivileged);
    if (!c) throw new NotFoundException('Case not found');

    // Access check for non-admins
    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();
      if (c.owner?.toString() !== userIdStr && c.invitedUser?.toString() !== userIdStr) {
        throw new ForbiddenException('Forbidden');
      }
    }

    const stepNumber = Number(stepNumberStr);
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 7) {
      throw new BadRequestException('Invalid step number');
    }

    const key = `step${stepNumber}`;
    const doc = (c as any).toObject ? (c as any).toObject() : c;
    const storedStepData = doc[key] ?? {};
    const rawStatus = (doc.status && doc.status[key]) || {};

    // step templates (shallow) — same as your schema defaults
    const getEmptyStepTemplate = (n: number) => {
      switch (n) {
        case 1:
        case 3:
          return {
            firstName: null, middleNames: null, lastName: null, dateOfBirth: null, address: null,
            dateOfMarriage: null, hasChildren: false, fluentInEnglish: false, nationality: null,
            domicileResidencyStatus: null, occupation: null, incomeGBP: null, overviewAim: null,
            currentLivingSituation: null, confirm_wenup_platform_used: false,
            property_personal_possessions_remain: false, family_home_divided_equally: false,
            court_can_depart_for_children: false, agree_costs_shared: false,
          };
        case 2:
        case 4:
          return {
            separateEarnings: false, earningsEntries: [], separateProperties: false, propertyEntries: [],
            separateSavings: false, savingsEntries: [], separatePensions: false, pensionEntries: [],
            separateDebts: false, debtEntries: [], separateBusinesses: false, businessEntries: [],
            separateChattels: false, chattelEntries: [], separateOtherAssets: false, otherAssetEntries: [],
          };
        case 5:
          return {
            sharedEarnings: false, sharedEarningsDetails: {}, sharedDebts: false, sharedDebtsDetails: {},
            sharedBusinesses: false, sharedBusinessesDetails: {}, sharedChattels: false, sharedChattelsDetails: {},
            sharedOtherAssets: false, sharedOtherAssetsDetails: {}, liveInRentedOrOwned: false,
            sharedSavings: false, sharedPensions: false,
          };
        case 6:
          return {
            inheritanceConsideredSeparate: false,
            giftConsideredSeparate: false,
            futureAssetsTreatedJointOrSeparate: false,
            willBeSameAsDivorceSplit: false,
            wantWillHelp: false,
            person1FutureInheritance: { originalAmount: null, originalCurrency: null, gbpEquivalent: null, basisOfEstimate: null },
            person2FutureInheritance: { originalAmount: null, originalCurrency: null, gbpEquivalent: null, basisOfEstimate: null },
          };
        case 7:
          return {
            isOnePregnant: false, isOnePregnantOverview: null, businessWorkedTogether: false, businessWorkedTogetherOverview: null,
            oneOutOfWorkOrDependent: false, oneOutOfWorkOverview: null, familyHomeOwnedWith3rdParty: false,
            familyHome3rdPartyOverview: null, combinedAssetsOver3m: false, combinedAssetsOver3mOverview: null,
            childFromPreviousRelationshipsLivingWithYou: false, childFromPreviousOverview: null, additionalComplexities: {},
          };
        default:
          return {};
      }
    };

    const mergedData = { ...getEmptyStepTemplate(stepNumber), ...storedStepData };

    // normalize status (ObjectId -> string, dates preserved)
    const statusNormalized = {
      submitted: !!rawStatus.submitted,
      submittedBy: rawStatus.submittedBy ? rawStatus.submittedBy.toString() : null,
      submittedAt: rawStatus.submittedAt ? rawStatus.submittedAt : null,
      locked: !!rawStatus.locked,
      lockedBy: rawStatus.lockedBy ? rawStatus.lockedBy.toString() : null,
      lockedAt: rawStatus.lockedAt ? rawStatus.lockedAt : null,
      unlockedBy: rawStatus.unlockedBy ? rawStatus.unlockedBy.toString() : null,
      unlockedAt: rawStatus.unlockedAt ? rawStatus.unlockedAt : null,
    };

    const defaultStatus = {
      submitted: false, submittedBy: null, submittedAt: null,
      locked: false, lockedBy: null, lockedAt: null,
      unlockedBy: null, unlockedAt: null,
    };

    const finalStatus = Object.values(statusNormalized).some(v => v !== null && v !== false) ? statusNormalized : defaultStatus;

    // SPECIAL CASE: step 5 -> return UI-shaped payload that JointAssetsPage expects
    if (stepNumber === 5) {
      const uiQuestions = STEP5_QUESTIONS.map((q, idx) => ({
        question: q,
        answer: idx === 0 ? (mergedData.sharedEarnings ? 'yes' : 'no')
               : idx === 1 ? (mergedData.liveInRentedOrOwned ? 'yes' : 'no')
               : idx === 2 ? (mergedData.sharedSavings ? 'yes' : 'no')
               : idx === 3 ? (mergedData.sharedPensions ? 'yes' : 'no')
               : null,
      }));

      const uiFollowUps = STEP5_FOLLOW_UPS.map((q, idx) => ({
        question: q,
        answer: idx === 0 ? (mergedData.sharedDebts ? 'yes' : 'no')
               : idx === 1 ? (mergedData.sharedBusinesses ? 'yes' : 'no')
               : idx === 2 ? (mergedData.sharedChattels ? 'yes' : 'no')
               : idx === 3 ? (mergedData.sharedOtherAssets ? 'yes' : 'no')
               : null,
        details: idx === 0 ? (mergedData.sharedDebtsDetails || {}) :
                 idx === 1 ? (mergedData.sharedBusinessesDetails || {}) :
                 idx === 2 ? (mergedData.sharedChattelsDetails || {}) :
                 idx === 3 ? (mergedData.sharedOtherAssetsDetails || {}) : {},
      }));

      return {
        stepNumber,
        data: {
          heading: STEP5_HEADING,
          questions: uiQuestions,
          followUpsShown: !!mergedData.sharedEarnings,
          followUps: uiFollowUps,
          savedAt: (mergedData.sharedEarningsDetails && mergedData.sharedEarningsDetails.ui && mergedData.sharedEarningsDetails.ui.savedAt) || doc.updatedAt || null,
        },
        status: finalStatus,
        fullyLocked: !!doc.fullyLocked,
      };
    }

    // SPECIAL CASE: step 6 -> return UI-shaped payload that FutureAssetsPage expects
    if (stepNumber === 6) {
      const uiQuestions = STEP6_QUESTIONS.map((q, idx) => ({
        question: q,
        answer:
          idx === 0 ? (mergedData.inheritanceConsideredSeparate ? 'yes' : 'no')
          : idx === 1 ? (mergedData.giftConsideredSeparate ? 'yes' : 'no')
          : idx === 2 ? (mergedData.futureAssetsTreatedJointOrSeparate ? 'yes' : 'no')
          : idx === 3 ? (mergedData.willBeSameAsDivorceSplit ? 'yes' : 'no')
          : null,
      }));

      const uiPayload = {
        heading: STEP6_HEADING,
        questions: uiQuestions,
        inheritanceSeparate: !!mergedData.inheritanceConsideredSeparate,
        giftsSeparate: !!mergedData.giftConsideredSeparate,
        futureSoleAssetsSeparate: !!mergedData.futureAssetsTreatedJointOrSeparate,
        sameAsWill: !!mergedData.willBeSameAsDivorceSplit,
        wantWillAssistance: !!mergedData.wantWillHelp,
        sooriyaFutureInheritance: {
          originalAmount: mergedData.person1FutureInheritance?.originalAmount ?? null,
          originalCurrency: mergedData.person1FutureInheritance?.originalCurrency ?? null,
          gbpEquivalent: mergedData.person1FutureInheritance?.gbpEquivalent ?? null,
          basisOfEstimate: mergedData.person1FutureInheritance?.basisOfEstimate ?? null,
        },
        gomathiFutureInheritance: {
          originalAmount: mergedData.person2FutureInheritance?.originalAmount ?? null,
          originalCurrency: mergedData.person2FutureInheritance?.originalCurrency ?? null,
          gbpEquivalent: mergedData.person2FutureInheritance?.gbpEquivalent ?? null,
          basisOfEstimate: mergedData.person2FutureInheritance?.basisOfEstimate ?? null,
        },
        savedAt: (mergedData.person1FutureInheritance && (mergedData.person1FutureInheritance as any).savedAt) || doc.updatedAt || null,
      };

      return {
        stepNumber,
        data: uiPayload,
        status: finalStatus,
        fullyLocked: !!doc.fullyLocked,
      };
    }

    // default behavior for other steps: return mergedData shape as before
    return {
      stepNumber,
      data: mergedData,
      status: finalStatus,
      fullyLocked: !!doc.fullyLocked,
    };
  }

  /**
   * Update a specific step of a case
   * - Non-privileged end-users: must follow end-user step rules (which step types they can submit).
   * - Privileged roles: may update any step.
   * - New locking: only step 7 submission triggers a complete lock; otherwise end-users may re-submit/update 1-6.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/steps/:stepNumber')
  async updateStep(@Req() req, @Param('id') id: string, @Param('stepNumber') stepNumberStr: string, @Body() body: any) {
    const user = this.ensureUser(req);
    const stepNumber = Number(stepNumberStr);
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    const isPrivileged = this.isPrivilegedRole(user.role);

    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();

      // Owner path (end_user type user1)
      if (c.owner?.toString() === userIdStr) {
        if (user.endUserType !== 'user1') throw new ForbiddenException('Owner not user1');
        if (!END_USER1_STEPS.includes(stepNumber)) throw new ForbiddenException('Not allowed to submit this step');
      }
      else if (c.invitedUser && c.invitedUser?.toString() === userIdStr) {
        if (user.endUserType !== 'user2') throw new ForbiddenException('Invited user not user2');
        if (!END_USER2_STEPS.includes(stepNumber)) throw new ForbiddenException('Not allowed to submit this step');
      } else {
        throw new ForbiddenException('Forbidden');
      }
    }

    // If case is fully locked, only privileged can update (steps are locked).
    if (c.fullyLocked && !isPrivileged) {
      throw new ForbiddenException('Case is fully locked. Please ask a case manager to unlock it.');
    }

    const dtoMap: Record<number, any> = {
      1: Step1Dto,
      2: Step2Dto,
      3: Step3Dto,
      4: Step4Dto,
      5: Step5Dto,
      6: Step6Dto,
      7: Step7Dto,
    };

    const DtoClass = dtoMap[stepNumber];
    let validatedData: any = body;

    // SPECIAL CASE: map UI payload for step 5 into schema fields
    if (stepNumber === 5) {
      const questions = Array.isArray(body.questions) ? body.questions : [];
      const followUps = Array.isArray(body.followUps) ? body.followUps : [];

      const step5Payload = {
        sharedEarnings: (questions[0]?.answer === 'yes'),
        liveInRentedOrOwned: (questions[1]?.answer === 'yes'),
        sharedSavings: (questions[2]?.answer === 'yes'),
        sharedPensions: (questions[3]?.answer === 'yes'),

        sharedDebts: (followUps[0]?.answer === 'yes'),
        sharedDebtsDetails: followUps[0]?.details || {},

        sharedBusinesses: (followUps[1]?.answer === 'yes'),
        sharedBusinessesDetails: followUps[1]?.details || {},

        sharedChattels: (followUps[2]?.answer === 'yes'),
        sharedChattelsDetails: followUps[2]?.details || {},

        sharedOtherAssets: (followUps[3]?.answer === 'yes'),
        sharedOtherAssetsDetails: followUps[3]?.details || {},

        // store the UI payload for convenience in details (optional)
        sharedEarningsDetails: {
          ui: {
            heading: body.heading || STEP5_HEADING,
            questions,
            followUpsShown: !!body.followUpsShown,
            followUps,
            savedAt: body.savedAt || new Date().toISOString(),
          }
        }
      };

      validatedData = step5Payload;
    }
    // SPECIAL CASE: map UI payload for step 6 into schema fields
    else if (stepNumber === 6) {
      // frontend payload expected:
      // {
      //   inheritanceSeparate: boolean,
      //   giftsSeparate: boolean,
      //   futureSoleAssetsSeparate: boolean,
      //   sameAsWill: boolean,
      //   wantWillAssistance: boolean,
      //   sooriyaFutureInheritance: {...},
      //   gomathiFutureInheritance: {...}
      // }
      const mapped = {
        inheritanceConsideredSeparate: !!body.inheritanceSeparate,
        giftConsideredSeparate: !!body.giftsSeparate,
        futureAssetsTreatedJointOrSeparate: !!body.futureSoleAssetsSeparate,
        willBeSameAsDivorceSplit: !!body.sameAsWill,
        wantWillHelp: !!body.wantWillAssistance,

        person1FutureInheritance: {
          originalAmount: (body.sooriyaFutureInheritance && body.sooriyaFutureInheritance.originalAmount !== undefined) ? body.sooriyaFutureInheritance.originalAmount : null,
          originalCurrency: body.sooriyaFutureInheritance?.originalCurrency ?? null,
          gbpEquivalent: (body.sooriyaFutureInheritance && body.sooriyaFutureInheritance.gbpEquivalent !== undefined) ? body.sooriyaFutureInheritance.gbpEquivalent : null,
          basisOfEstimate: body.sooriyaFutureInheritance?.basisOfEstimate ?? null,
        },

        person2FutureInheritance: {
          originalAmount: (body.gomathiFutureInheritance && body.gomathiFutureInheritance.originalAmount !== undefined) ? body.gomathiFutureInheritance.originalAmount : null,
          originalCurrency: body.gomathiFutureInheritance?.originalCurrency ?? null,
          gbpEquivalent: (body.gomathiFutureInheritance && body.gomathiFutureInheritance.gbpEquivalent !== undefined) ? body.gomathiFutureInheritance.gbpEquivalent : null,
          basisOfEstimate: body.gomathiFutureInheritance?.basisOfEstimate ?? null,
        },

        // Optionally keep UI payload for round-trip hydration
        person1FutureInheritanceDetails: {
          ui: {
            heading: body.heading || STEP6_HEADING,
            answers: body.questions || [],
            savedAt: body.savedAt || new Date().toISOString(),
          }
        }
      };

      // Validate mapped payload if DTO exists
      if (DtoClass) {
        const instance = plainToInstance(DtoClass, mapped);
        const errors = await validate(instance as object, { whitelist: true, forbidNonWhitelisted: false });
        if (errors.length > 0) {
          const formatted = errors.map(err => ({ property: err.property, constraints: err.constraints, children: err.children }));
          throw new BadRequestException({ message: 'Validation failed', errors: formatted });
        }
      }

      validatedData = mapped;
    } else {
      // Default behavior: run DTO validation for other steps if DTO exists
      if (DtoClass) {
        const instance = plainToInstance(DtoClass, body);
        const errors = await validate(instance as object, { whitelist: true, forbidNonWhitelisted: false });
        if (errors.length > 0) {
          const formatted = errors.map(err => ({ property: err.property, constraints: err.constraints, children: err.children }));
          throw new BadRequestException({ message: 'Validation failed', errors: formatted });
        }
        validatedData = instance;
      }
    }

    // call service (service will perform full-lock if this is step 7)
    const updated = await this.casesService.updateStep(id, stepNumber, validatedData, user.id ?? user._id);
    return updated;
  }

  // privileged-only unlock endpoint
  @UseGuards(JwtAuthGuard)
  @Post(':id/unlock')
  async unlockCase(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);
    if (!isPrivileged) throw new ForbiddenException('Only privileged users may unlock cases');

    return this.casesService.unlockCase(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/lawyers')
  async getLawyersForCase(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);

    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    // Access check for non-admins
    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();
      if (
        c.owner?.toString() !== userIdStr &&
        c.invitedUser?.toString() !== userIdStr
      ) {
        throw new ForbiddenException('Forbidden');
      }
    }

    // New rule: pre-questionnaire submission and lawyer selection are only allowed *after*
    // all steps are submitted AND the case is fully locked. Enforce controller-level check here.
    if (!isPrivileged) {
      const allStepsSubmitted = this.casesService.areAllStepsSubmitted(c);
      if (!(c.fullyLocked && allStepsSubmitted)) {
        throw new ForbiddenException('Lawyer listing/selection is allowed only after all steps are submitted and the case is fully locked.');
      }
    }

    const lawyers = await this.lawyersService.listAll();

    const p1SelectedId = c.preQuestionnaireUser1?.selectedLawyer?.toString() ?? null;
    const p2SelectedId = c.preQuestionnaireUser2?.selectedLawyer?.toString() ?? null;

    const userIdStr = (user.id ?? user._id)?.toString();
    const isOwner = c.owner?.toString() === userIdStr;
    const isInvited = c.invitedUser?.toString() === userIdStr;

    const mapped = lawyers.map((l: any) => {
      const lid = l._id.toString();

      const selectedByUser1 = p1SelectedId === lid;
      const selectedByUser2 = p2SelectedId === lid;

      let selectedBy: 'you' | 'partner' | 'both' | null = null;

      if (selectedByUser1 && selectedByUser2) {
        selectedBy = 'both';
      } else if (selectedByUser1) {
        selectedBy = isOwner ? 'you' : 'partner';
      } else if (selectedByUser2) {
        selectedBy = isInvited ? 'you' : 'partner';
      }

      return {
        id: lid,
        externalId: l.externalId,
        name: l.name,
        priceText: l.priceText,
        avatarUrl: l.avatarUrl,
        selectedBy,
      };
    });

    return {
      total: mapped.length,
      lawyers: mapped,
      yourSelected: isOwner ? p1SelectedId : p2SelectedId,
      partnerSelected: isOwner ? p2SelectedId : p1SelectedId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('seed')
  async seedLawyers(@Req() req) {
    return this.lawyersService.seedInitialLawyersIfEmpty();
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/pre-questionnaire')
  async submitPreQuestionnaireEndpoint(@Req() req, @Param('id') id: string, @Body() body: { answers?: string[] }) {
    const user = this.ensureUser(req);
    // basic validation
    if (!body || !Array.isArray(body.answers)) {
      throw new BadRequestException('Request body must include "answers" array');
    }

    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    // New rule: pre-questionnaire can only be submitted after all steps are submitted AND case is fully locked.
    const isPrivileged = this.isPrivilegedRole(user.role);
    const allStepsSubmitted = this.casesService.areAllStepsSubmitted(c);
    if (!(c.fullyLocked && allStepsSubmitted) && !isPrivileged) {
      throw new ForbiddenException('Pre-questionnaire can only be submitted after all steps are submitted and the case is fully locked.');
    }

    // call service to submit (service enforces the same rules)
    const updatedCase = await this.casesService.submitPreQuestionnaire(id, user.id ?? user._id, body.answers);
    return {
      message: 'Pre-questionnaire submitted',
      case: updatedCase,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/select-lawyer')
  async selectLawyerEndpoint(@Req() req, @Param('id') id: string, @Body() body: { lawyerId?: string; force?: boolean }) {
    const user = this.ensureUser(req);
    if (!body || !body.lawyerId) {
      throw new BadRequestException('Request body must include "lawyerId" (Mongo _id of the lawyer)');
    }

    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    const isPrivileged = this.isPrivilegedRole(user.role);

    // New rule: lawyer selection allowed only after all steps are submitted AND case is fully locked.
    const allStepsSubmitted = this.casesService.areAllStepsSubmitted(c);
    if (!(c.fullyLocked && allStepsSubmitted) && !isPrivileged) {
      throw new ForbiddenException('Lawyer selection is allowed only after all steps are submitted and the case is fully locked.');
    }

    // If caller is privileged they can pass force=true to override exclusivity (service handles it)
    const force = !!body.force;

    const updatedCase = await this.casesService.selectLawyer(id, user.id ?? user._id, body.lawyerId, force);
    return {
      message: 'Lawyer selected',
      case: updatedCase,
    };
  }
}
