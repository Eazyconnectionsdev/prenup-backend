// src/cases/schemas/case.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CaseDocument = Case & Document;

@Schema({ _id: false })
export class PartnerInviteDetails {
  @Prop({ default: null })
  firstName?: string;

  @Prop({ default: null })
  lastName?: string;

  @Prop({ default: null })
  email?: string;

  @Prop({ default: null })
  mobileNumber?: string;

  @Prop({
    enum: ['Fiancé', 'Fiancée', 'Partner'],
    default: null,
  })
  relationshipStatus?: string;

  @Prop({
    type: Date,
    default: null,
  })
  targetWeddingDate?: Date | null;

  @Prop({ default: null })
  personalMessage?: string;
}

export const PartnerInviteDetailsSchema =
  SchemaFactory.createForClass(PartnerInviteDetails);



export const AGREEMENT_TYPES = [
  'prenup-marriage',
  'prenup-civil',
  'postnup-marriage',
  'postnup-civil',
  'cohabitation',
  'help-choose',
] as const;

@Schema({ _id: false })
export class OnboardingInfo {
  @Prop({ type: Boolean, default: false })
  completed!: boolean;

  @Prop({ type: Date, default: null })
  completedAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  completedBy?: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false })
  residesInUK!: boolean;
}

export const OnboardingInfoSchema = SchemaFactory.createForClass(OnboardingInfo);

export enum CaseWorkflowStatus {
  NOT_PAID = 'NOT_PAID',

  DRAFT = 'DRAFT',

  COUPLE_SUBMITTED = 'COUPLE_SUBMITTED',

  CM_APPROVED = 'CM_APPROVED',

  LAWYERS_ASSIGNED = 'LAWYERS_ASSIGNED',

  PRE_LAWYER_PENDING = 'PRE_LAWYER_PENDING',

  PRE_LAWYER_COMPLETED = 'PRE_LAWYER_COMPLETED',

  LAWYER_CLIENT_CONFIRMATION =
  'LAWYER_CLIENT_CONFIRMATION',

  LAWYER_REVIEW = 'LAWYER_REVIEW',

  LAWYER_REVIEW_COMPLETED =
  'LAWYER_REVIEW_COMPLETED',

  LAWYER_ILA_PENDING =
  'LAWYER_ILA_PENDING',

  LAWYER_SIGNOFF_COMPLETE =
  'LAWYER_SIGNOFF_COMPLETE',

  COMPLETED = 'COMPLETED',

  CANCELLED = 'CANCELLED',

  ARCHIVED = 'ARCHIVED',
}

//
// SECTION STATUS
//

@Schema({ _id: false })
export class SectionStatus {
  @Prop({ default: false })
  submitted!: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  submittedBy?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  submittedAt?: Date | null;

  @Prop({
    default: false,
  })
  locked!: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  lockedBy?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  lockedAt?: Date | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  unlockedBy?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  unlockedAt?: Date | null;
}

export const SectionStatusSchema =
  SchemaFactory.createForClass(
    SectionStatus,
  );

//
// PRE QUESTIONNAIRE
//

@Schema({ _id: false })
export class PreQuestionnaire {
  @Prop({
    type: [String],
    default: [],
  })
  answers!: string[];

  @Prop({
    type: Types.ObjectId,
    ref: 'Lawyer',
    default: null,
  })
  selectedLawyer?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  selectedAt?: Date | null;

  @Prop({
    default: false,
  })
  submitted?: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  submittedBy?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  submittedAt?: Date | null;

  @Prop({
    default: false,
  })
  locked?: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  lockedBy?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  lockedAt?: Date | null;
}

export const PreQuestionnaireSchema =
  SchemaFactory.createForClass(
    PreQuestionnaire,
  );

//
// APPROVAL
//

@Schema({ _id: false })
export class Approval {
  @Prop({ type: Boolean, default: false })
  user1Approved!: boolean;

  @Prop({ type: Date, default: null })
  user1ApprovedAt!: Date | null;

  @Prop({ type: Boolean, default: false })
  user2Approved!: boolean;

  @Prop({ type: Date, default: null })
  user2ApprovedAt!: Date | null;

  @Prop({ type: Types.ObjectId, default: null })
  disapprovedBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  disapprovedAt!: Date | null;

  @Prop({ type: String, default: null })
  disapprovalReason!: string | null;

  @Prop({ type: Boolean, default: false })
  lawyerApproved!: boolean;

  @Prop({ type: Date, default: null })
  lawyerApprovedAt!: Date | null;

  @Prop({ type: Types.ObjectId, default: null })
  approvedLawyer!: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false })
  caseManagerApproved!: boolean;

  @Prop({ type: Date, default: null })
  caseManagerApprovedAt!: Date | null;

  @Prop({ type: Types.ObjectId, default: null })
  approvedBy!: Types.ObjectId | null;
}

export const ApprovalSchema =
  SchemaFactory.createForClass(
    Approval,
  );

//
// MY INFORMATION
//

@Schema({ _id: false })
export class MyInformation {
  @Prop({ type: Object, default: {} })
  personalInformation?: any;

  @Prop({ type: Object, default: {} })
  legalDeclaration?: any;

  @Prop({ type: Object, default: {} })
  familyAndDependents?: any;

  @Prop({ type: Object, default: {} })
  individualAssets?: any;

  @Prop({ type: Object, default: {} })
  incomeAndRevenue?: any;

  @Prop({ type: Object, default: {} })
  liabilitiesAndDebts?: any;
}

export const MyInformationSchema =
  SchemaFactory.createForClass(
    MyInformation,
  );

//
// PARTNER INFORMATION
//

@Schema({ _id: false })
export class PartnerInformation {
  @Prop({ type: Object, default: {} })
  personalInformation?: any;

  @Prop({ type: Object, default: {} })
  legalDeclaration?: any;

  @Prop({ type: Object, default: {} })
  familyAndDependents?: any;

  @Prop({ type: Object, default: {} })
  individualAssets?: any;

  @Prop({ type: Object, default: {} })
  incomeAndRevenue?: any;

  @Prop({ type: Object, default: {} })
  liabilitiesAndDebts?: any;
}

export const PartnerInformationSchema =
  SchemaFactory.createForClass(
    PartnerInformation,
  );

//
// MATRIMONIAL AGREEMENT & INTENTIONS
//

export const FUTURE_ASSETS_TREATMENTS = [
  'SeparateToAcquirer',
  'FamilyUseJoint',
  'PooledEqually',
  'Custom',
] as const;

export const FUTURE_GIFTS_TREATMENTS = [
  'SeparateToRecipient',
  'JointEqually',
  'Custom',
] as const;

export const INHERITANCE_SELECTIONS = ['NoneExpected', 'LogDetails'] as const;

export const INHERITANCE_STATUSES = [
  'FutureExpectation',
  'PendingProbate',
] as const;

export const SPOUSAL_MAINTENANCE_INTENTIONS = [
  'MutualWaiver',
  'CareerSacrificeOnly',
  'Custom',
] as const;

export const CRITICAL_ILLNESS_SAFEGUARDS = [
  'TermsFixed',
  'Voidable',
  'Custom',
] as const;

export const DEATH_WILLS_ALIGNMENTS = [
  'MirrorDivorce',
  'ProvideDifferently',
  'Unsure',
] as const;

export const REVIEW_TRIGGER_TYPES = ['Never', 'Standard', 'Custom'] as const;

export const STANDARD_MILESTONES = [
  'child_birth',
  'career_change',
  '5_year',
  '10_year',
] as const;

export const ASSET_TREATMENTS = [
  'KeepSeparate',
  'ShareEqually',
  'Contribution',
  'Percentage',
  'Custom',
] as const;

export const INHERITANCE_CURRENCIES = [
  'GBP',
  'USD',
  'EUR',
  'AUD',
  'CAD',
] as const;

// One expected or pending inheritance in the register. Amounts are kept as
// entered (strings) so a partly filled row never fails to save.
@Schema({ _id: false })
export class InheritanceEntry {
  @Prop({ type: String, default: null })
  id?: string | null;

  @Prop({ type: String, default: null })
  recipientPartner?: string | null;

  @Prop({ type: String, enum: INHERITANCE_STATUSES, default: null })
  inheritanceStatus?: string | null;

  @Prop({ type: String, default: null })
  composition?: string | null;

  @Prop({ type: String, default: null })
  originalAmount?: string | null;

  @Prop({ type: String, enum: INHERITANCE_CURRENCIES, default: null })
  originalCurrency?: string | null;

  @Prop({ type: String, default: null })
  gbpEquivalent?: string | null;

  @Prop({ type: String, default: null })
  basisOfEstimate?: string | null;

  @Prop({ type: String, enum: ASSET_TREATMENTS, default: null })
  treatment?: string | null;

  @Prop({ type: String, default: '' })
  contributionText?: string;

  @Prop({ type: String, default: '' })
  percentageValue?: string;

  @Prop({ type: String, default: '' })
  customText?: string;
}

export const InheritanceEntrySchema =
  SchemaFactory.createForClass(InheritanceEntry);

// The enforceability gates: any 'Yes' flags the case for the case manager.
@Schema({ _id: false })
export class SpecialCircumstances {
  @Prop({ type: String, enum: ['Yes', 'No'], default: 'No' })
  pregnancyOrAdoption?: string;

  @Prop({ type: String, enum: ['Yes', 'No'], default: 'No' })
  sharedBusiness?: string;

  @Prop({ type: String, enum: ['Yes', 'No'], default: 'No' })
  financialReliance?: string;

  @Prop({ type: String, enum: ['Yes', 'No'], default: 'No' })
  coOwnedRealEstate?: string;

  @Prop({ type: String, enum: ['Yes', 'No'], default: 'No' })
  highValueAssets?: string;

  @Prop({ type: String, enum: ['Yes', 'No'], default: 'No' })
  priorDependents?: string;
}

export const SpecialCircumstancesSchema =
  SchemaFactory.createForClass(SpecialCircumstances);

@Schema({ _id: false })
export class MatrimonialAgreement {
  @Prop({ type: String, enum: FUTURE_ASSETS_TREATMENTS, default: null })
  futureAssetsTreatment?: string | null;

  @Prop({ type: String, default: '' })
  customFutureAssets?: string;

  @Prop({ type: String, enum: FUTURE_GIFTS_TREATMENTS, default: null })
  futureGiftsTreatment?: string | null;

  @Prop({ type: String, default: '' })
  customFutureGifts?: string;

  @Prop({ type: String, enum: INHERITANCE_SELECTIONS, default: null })
  inheritanceSelection?: string | null;

  @Prop({ type: [InheritanceEntrySchema], default: [] })
  inheritanceEntries?: InheritanceEntry[];

  @Prop({ type: String, enum: SPOUSAL_MAINTENANCE_INTENTIONS, default: null })
  spousalMaintenanceIntention?: string | null;

  @Prop({ type: String, default: '' })
  customSpousalMaintenance?: string;

  @Prop({ type: String, enum: CRITICAL_ILLNESS_SAFEGUARDS, default: null })
  criticalIllnessSafeguard?: string | null;

  @Prop({ type: String, default: '' })
  customHealthSafeguards?: string;

  @Prop({ type: String, enum: DEATH_WILLS_ALIGNMENTS, default: null })
  deathWillsAlignment?: string | null;

  @Prop({ type: String, enum: REVIEW_TRIGGER_TYPES, default: null })
  reviewTriggerType?: string | null;

  @Prop({ type: [String], enum: STANDARD_MILESTONES, default: [] })
  standardMilestones?: string[];

  @Prop({ type: String, default: '' })
  customReviewTriggers?: string;

  @Prop({ type: SpecialCircumstancesSchema, default: {} })
  specialCircumstances?: SpecialCircumstances;

  @Prop({ type: String, default: '' })
  specialCircumstancesOverview?: string;
}

export const MatrimonialAgreementSchema =
  SchemaFactory.createForClass(MatrimonialAgreement);

//
// JOINT INFORMATION
//

@Schema({ _id: false })
export class JointInformation {
  @Prop({ type: Object, default: {} })
  jointAssets?: any;

  @Prop({ type: Object, default: {} })
  jointIncomeAndRevenue?: any;

  @Prop({ type: Object, default: {} })
  jointLiabilitiesAndDebts?: any;

  // No default: the joint section counts this form as filled in as soon as the
  // field exists, so it must stay absent until the couple actually saves it
  @Prop({ type: MatrimonialAgreementSchema })
  matrimonialAgreement?: MatrimonialAgreement;
}

export const JointInformationSchema =
  SchemaFactory.createForClass(
    JointInformation,
  );

//
// INDEPENDENT LEGAL ADVICE
//

@Schema({ _id: false })
export class IndependentLegalAdvice {
  @Prop({ type: Object, default: {} })
  solicitorDetails?: any;

  @Prop({ type: Object, default: {} })
  lawyerQuestionnaire?: any;

  @Prop({ type: Object, default: {} })
  reviewAndSign?: any;
}

export const IndependentLegalAdviceSchema =
  SchemaFactory.createForClass(
    IndependentLegalAdvice,
  );

//
// CASE
//
//
// CASE
//

@Schema({
  timestamps: true,
})
export class Case {
  @Prop({
    default: 'Untitled case',
  })
  title!: string;

  /**
   * Human-readable case identifier shown on the frontend.
   * Format: CASE-YYYY-NNNNN (e.g. CASE-2026-00001).
   * Generated once on creation; all internal lookups still use _id.
   */
  @Prop({
    type: String,
    unique: true,
    sparse: true,
    default: null,
  })
  caseNumber?: string | null;

  @Prop({
    default: false,
  })
  paymentCompleted?: boolean;

  // Chosen during onboarding (user 1 only).
  @Prop({
    type: String,
    enum: AGREEMENT_TYPES,
    default: null,
  })
  agreementType?: string | null;

  @Prop({
    type: OnboardingInfoSchema,
    default: {},
  })
  onboarding?: OnboardingInfo;

  @Prop({
    type: Object,
    default: null,
  })
  inviteCredentials?: {
    email: string;
    password: string;
    createdAt: Date;
  };

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  owner!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  invitedUser?: Types.ObjectId | null;

  @Prop({
    type: String,
    default: null,
  })
  invitedEmail?: string | null;

  @Prop({
    type: String,
    default: null,
  })
  inviteToken?: string | null;

  @Prop({
    type: Date,
    default: null,
  })
  inviteTokenExpires?: Date | null;

  // =====================================================
  // QUESTIONNAIRE DATA
  // =====================================================

  @Prop({
    type: MyInformationSchema,
    default: {},
  })
  myInformation!: MyInformation;

  @Prop({
    type: PartnerInformationSchema,
    default: {},
  })
  partnerInformation!: PartnerInformation;

  @Prop({
    type: JointInformationSchema,
    default: {},
  })
  jointInformation!: JointInformation;

  @Prop({
    type: IndependentLegalAdviceSchema,
    default: {},
  })
  independentLegalAdvice!: IndependentLegalAdvice;

  // =====================================================
  // PRE LAWYER QUESTIONNAIRE
  // =====================================================

  @Prop({
    type: PreQuestionnaireSchema,
    default: {},
  })
  preQuestionnaireUser1!: PreQuestionnaire;

  @Prop({
    type: PreQuestionnaireSchema,
    default: {},
  })
  preQuestionnaireUser2!: PreQuestionnaire;

  // =====================================================
  // APPROVAL
  // =====================================================

  @Prop({
    type: ApprovalSchema,
    default: {},
  })
  approval?: Approval;

  // =====================================================
  // SECTION STATUS
  // =====================================================

  @Prop({
    type: {
      myInformation: SectionStatusSchema,
      partnerInformation: SectionStatusSchema,
      jointInformation: SectionStatusSchema,
      independentLegalAdvice: SectionStatusSchema,
    },
    default: {},
  })
  status!: {
    myInformation?: SectionStatus;
    partnerInformation?: SectionStatus;
    jointInformation?: SectionStatus;
    independentLegalAdvice?: SectionStatus;
  };

  // =====================================================
  // LOCKING
  // =====================================================

  @Prop({
    default: false,
  })
  fullyLocked?: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  fullyLockedBy?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  fullyLockedAt?: Date | null;

  // =====================================================
  // CASE WORKFLOW
  // =====================================================

  @Prop({
    default: false,
  })
  partnerInvited!: boolean;

  @Prop({
    type: String,
    enum: Object.values(
      CaseWorkflowStatus,
    ),
    default:
      CaseWorkflowStatus.NOT_PAID,
  })
  workflowStatus!: CaseWorkflowStatus;

  // =====================================================
  // CASE MANAGER
  // =====================================================

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  assignedCaseManager?: Types.ObjectId | null;

  @Prop({
    default: false,
  })
  cmApproved?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  cmApprovedAt?: Date | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  cmApprovedBy?: Types.ObjectId | null;

  @Prop({
    type: String,
    default: null,
  })
  cmReturnReason?: string | null;

  // =====================================================
  // CLIENT CONFIRMATION
  // =====================================================

  @Prop({
    default: false,
  })
  p1Confirmed?: boolean;

  @Prop({
    default: false,
  })
  p2Confirmed?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  p1ConfirmedAt?: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  p2ConfirmedAt?: Date | null;

  // =====================================================
  // LAWYERS
  // =====================================================

  @Prop({
    type: Types.ObjectId,
    ref: 'Lawyer',
    default: null,
  })
  assignedLawyerP1?: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'Lawyer',
    default: null,
  })
  assignedLawyerP2?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  lawyersAssignedAt?: Date | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  lawyersAssignedBy?: Types.ObjectId | null;

  // =====================================================
  // PRIORITY
  // =====================================================

  @Prop({
    enum: [
      'LOW',
      'MEDIUM',
      'HIGH',
      'URGENT',
    ],
    default: 'MEDIUM',
  })
  priority!: string;

  // =====================================================
  // LEGAL STAGE
  // =====================================================

  @Prop({
    default: false,
  })
  p1LawyerApproved?: boolean;

  @Prop({
    default: false,
  })
  p2LawyerApproved?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  p1LawyerApprovedAt?: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  p2LawyerApprovedAt?: Date | null;

  // =====================================================
  // AGREEMENT STAGE
  // =====================================================

  @Prop({
    default: false,
  })
  executionPackGenerated?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  executionPackGeneratedAt?: Date | null;

  @Prop({
    default: false,
  })
  readyForArchive?: boolean;

  // =====================================================
  // COMPLETION
  // =====================================================

  @Prop({
    type: Date,
    default: null,
  })
  completedAt?: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  archivedAt?: Date | null;

  // =====================================================
  // VERSION TRACKING
  // =====================================================

  @Prop({
    default: 1,
  })
  currentVersion!: number;

  @Prop({
    default: 0,
  })
  totalVersions!: number;

  // =====================================================
  // QUICK DASHBOARD STATS
  // =====================================================

  @Prop({
    default: 0,
  })
  totalNotes!: number;

  @Prop({
    default: 0,
  })
  totalDocuments!: number;

  @Prop({
    default: 0,
  })
  totalTimelineEntries!: number;



  // =====================================================
// ILA
// =====================================================

@Prop({
  default: false,
})
p1ILACompleted?: boolean;

@Prop({
  default: false,
})
p2ILACompleted?: boolean;

@Prop({
  type: Date,
  default: null,
})
p1ILACompletedAt?: Date | null;

@Prop({
  type: Date,
  default: null,
})
p2ILACompletedAt?: Date | null;

@Prop({
  type: String,
  default: null,
})
p1ILAFile?: string | null;

@Prop({
  type: String,
  default: null,
})
p2ILAFile?: string | null;


// =====================================================
// LAWYER SIGNOFF
// =====================================================

@Prop({
  default: false,
})
p1LawyerSigned?: boolean;

@Prop({
  default: false,
})
p2LawyerSigned?: boolean;

@Prop({
  type: Date,
  default: null,
})
p1LawyerSignedAt?: Date | null;

@Prop({
  type: Date,
  default: null,
})
p2LawyerSignedAt?: Date | null;

@Prop({
  default: false,
})
dualLawyerSignoffCompleted?: boolean;

@Prop({
  type: Date,
  default: null,
})
dualLawyerSignoffCompletedAt?: Date | null;


// =====================================================
// FINAL CLIENT CONFIRMATION
// =====================================================

@Prop({
  default: false,
})
finalP1Confirmed?: boolean;

@Prop({
  default: false,
})
finalP2Confirmed?: boolean;

@Prop({
  type: Date,
  default: null,
})
finalP1ConfirmedAt?: Date | null;

@Prop({
  type: Date,
  default: null,
})
finalP2ConfirmedAt?: Date | null;


// =====================================================
// CURRENT AGREEMENT
// =====================================================

@Prop({
  type: String,
  default: null,
})
currentAgreementVersion?: string | null;

@Prop({
  type: Types.ObjectId,
  ref: 'AgreementVersion',
  default: null,
})
currentAgreementId?: Types.ObjectId | null;

// =====================================================
// Lawyer review tracking
// =====================================================


@Prop({
  default: false,
})
lawyerReviewCompleted?: boolean;

@Prop({
  type: Date,
  default: null,
})
lawyerReviewCompletedAt?: Date | null;

@Prop({
  type: PartnerInviteDetailsSchema,
  default: {},
})
partnerInviteDetails?: PartnerInviteDetails;

}
export const CaseSchema =
  SchemaFactory.createForClass(
    Case,
  );

// Sparse unique index so existing documents with caseNumber: null are not
// forced to conflict while still preventing duplicate caseNumbers.
CaseSchema.index({ caseNumber: 1 }, { unique: true, sparse: true });
