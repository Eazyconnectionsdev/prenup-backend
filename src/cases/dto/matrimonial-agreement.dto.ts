// src/cases/dto/matrimonial-agreement.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  ASSET_TREATMENTS,
  CRITICAL_ILLNESS_SAFEGUARDS,
  DEATH_WILLS_ALIGNMENTS,
  FUTURE_ASSETS_TREATMENTS,
  FUTURE_GIFTS_TREATMENTS,
  INHERITANCE_CURRENCIES,
  INHERITANCE_SELECTIONS,
  INHERITANCE_STATUSES,
  REVIEW_TRIGGER_TYPES,
  SPOUSAL_MAINTENANCE_INTENTIONS,
  STANDARD_MILESTONES,
} from '../schemas/case.schema';

const YES_NO = ['Yes', 'No'] as const;

// Free text the couple writes. Long enough for a real clause, bounded so a
// single answer can't be used to bloat the case document.
const LONG_TEXT = 5000;
const SHORT_TEXT = 500;

export class InheritanceEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT)
  id?: string;

  @IsOptional()
  @IsIn(['', 'Partner 1', 'Partner 2'])
  recipientPartner?: string;

  @IsOptional()
  @IsIn(['', ...INHERITANCE_STATUSES])
  inheritanceStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT)
  composition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  originalAmount?: string;

  @IsOptional()
  @IsIn(['', ...INHERITANCE_CURRENCIES])
  originalCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gbpEquivalent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  basisOfEstimate?: string;

  @IsOptional()
  @IsIn(['', ...ASSET_TREATMENTS])
  treatment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  contributionText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  percentageValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  customText?: string;
}

export class SpecialCircumstancesDto {
  @IsOptional()
  @IsIn(YES_NO)
  pregnancyOrAdoption?: string;

  @IsOptional()
  @IsIn(YES_NO)
  sharedBusiness?: string;

  @IsOptional()
  @IsIn(YES_NO)
  financialReliance?: string;

  @IsOptional()
  @IsIn(YES_NO)
  coOwnedRealEstate?: string;

  @IsOptional()
  @IsIn(YES_NO)
  highValueAssets?: string;

  @IsOptional()
  @IsIn(YES_NO)
  priorDependents?: string;
}

export class MatrimonialAgreementDto {
  // 1. Future acquired assets & debts
  @IsOptional()
  @IsIn(FUTURE_ASSETS_TREATMENTS)
  futureAssetsTreatment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  customFutureAssets?: string;

  // 2. Future gifts from third parties
  @IsOptional()
  @IsIn(FUTURE_GIFTS_TREATMENTS)
  futureGiftsTreatment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  customFutureGifts?: string;

  // 3. Expected & pending inheritances
  @IsOptional()
  @IsIn(INHERITANCE_SELECTIONS)
  inheritanceSelection?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InheritanceEntryDto)
  inheritanceEntries?: InheritanceEntryDto[];

  // 4. Spousal maintenance
  @IsOptional()
  @IsIn(SPOUSAL_MAINTENANCE_INTENTIONS)
  spousalMaintenanceIntention?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  customSpousalMaintenance?: string;

  // 5. Critical illness safeguards
  @IsOptional()
  @IsIn(CRITICAL_ILLNESS_SAFEGUARDS)
  criticalIllnessSafeguard?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  customHealthSafeguards?: string;

  // 6. Death & Wills alignment
  @IsOptional()
  @IsIn(DEATH_WILLS_ALIGNMENTS)
  deathWillsAlignment?: string;

  // 7. Agreement review triggers
  @IsOptional()
  @IsIn(REVIEW_TRIGGER_TYPES)
  reviewTriggerType?: string;

  @IsOptional()
  @IsArray()
  @IsIn(STANDARD_MILESTONES, { each: true })
  standardMilestones?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  customReviewTriggers?: string;

  // Special circumstances & case complexity
  @IsOptional()
  @ValidateNested()
  @Type(() => SpecialCircumstancesDto)
  specialCircumstances?: SpecialCircumstancesDto;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT)
  specialCircumstancesOverview?: string;
}
