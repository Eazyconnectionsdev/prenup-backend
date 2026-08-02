// src/cases/schemas/case.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CaseDocument = Case & Document;

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

@Schema({
  timestamps: true,
})
export class Case {
  @Prop({
    default: 'Untitled case',
  })
  title!: string;

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

  //
  // NEW QUESTIONNAIRE STRUCTURE
  //

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

  //
  // LAWYER FLOW
  //

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

  //
  // APPROVAL
  //

  @Prop({
    type: ApprovalSchema,
    default: {},
  })
  approval?: Approval;

  //
  // STATUS
  //

  @Prop({
    type: {
      myInformation: SectionStatusSchema,
      partnerInformation:
        SectionStatusSchema,
      jointInformation:
        SectionStatusSchema,
      independentLegalAdvice:
        SectionStatusSchema,
    },
    default: {},
  })
  status!: {
    myInformation?: SectionStatus;
    partnerInformation?: SectionStatus;
    jointInformation?: SectionStatus;
    independentLegalAdvice?: SectionStatus;
  };

  //
  // LOCKING
  //

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

  //
  // WORKFLOW
  //

  @Prop({
    type: String,
    enum: [
      'DRAFT',
      'CM',
      'PAID',
      'LAWYER',
    ],
    default: 'DRAFT',
  })
  workflowStatus?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  assignedCaseManager?: Types.ObjectId | null;
}

export const CaseSchema =
  SchemaFactory.createForClass(
    Case,
  );