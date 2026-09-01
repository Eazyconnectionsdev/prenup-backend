// src/cases/schemas/case.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CaseDocument = Case & Document;
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
  @Prop({ default: false })
  user1Approved?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  user1ApprovedAt?: Date | null;

  @Prop({ default: false })
  user2Approved?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  user2ApprovedAt?: Date | null;

  @Prop({ default: false })
  lawyerApproved?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  lawyerApprovedAt?: Date | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'Lawyer',
    default: null,
  })
  approvedLawyer?: Types.ObjectId | null;

  @Prop({
    default: false,
  })
  caseManagerApproved?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  caseManagerApprovedAt?: Date | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  approvedBy?: Types.ObjectId | null;
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

  @Prop({
    default: false,
  })
  paymentCompleted?: boolean;

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

}
export const CaseSchema =
  SchemaFactory.createForClass(
    Case,
  );