import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Sub-schemas for repeated entries in Step 2 / 4 (financial items)
 */

@Schema({ _id: false })
export class IncomeEntry {
  @Prop({ required: true, type: String }) source: string;
  @Prop({ required: true, type: Number }) amount: number;
  @Prop({ type: String }) notes?: string;
}
export const IncomeEntrySchema = SchemaFactory.createForClass(IncomeEntry);

@Schema({ _id: false })
export class PropertyEntry {
  @Prop({ type: String }) addressLine1?: string;
  @Prop({ type: String }) addressLine2?: string;
  @Prop({ type: String }) townOrCity?: string;
  @Prop({ type: String }) postcode?: string;
  @Prop({ type: Number }) value?: number;
  @Prop({ type: String }) mortgageOutstanding?: string;
  @Prop({ type: String }) notes?: string;
}
export const PropertyEntrySchema = SchemaFactory.createForClass(PropertyEntry);

@Schema({ _id: false })
export class SavingEntry {
  @Prop({ type: String }) name?: string;
  @Prop({ type: Number }) amount?: number;
  @Prop({ type: String }) notes?: string;
}
export const SavingEntrySchema = SchemaFactory.createForClass(SavingEntry);

@Schema({ _id: false })
export class PensionEntry {
  @Prop({ type: String }) name?: string;
  @Prop({ type: Number }) value?: number;
  @Prop({ type: String }) notes?: string;
}
export const PensionEntrySchema = SchemaFactory.createForClass(PensionEntry);

@Schema({ _id: false })
export class DebtEntry {
  @Prop({ type: String }) accountOrLender?: string;
  @Prop({ type: String }) description?: string;
  @Prop({ type: Number }) amount?: number;
  @Prop({ type: String }) notes?: string;
}
export const DebtEntrySchema = SchemaFactory.createForClass(DebtEntry);

@Schema({ _id: false })
export class BusinessEntry {
  @Prop({ type: String }) name?: string;
  @Prop({ type: String }) description?: string;
  @Prop({ type: Number }) value?: number;
  @Prop({ type: Number }) ownershipPercentage?: number;
  @Prop({ type: Number }) otherNumbers?: number;
  @Prop({ type: String }) explanation?: string;
}
export const BusinessEntrySchema = SchemaFactory.createForClass(BusinessEntry);

@Schema({ _id: false })
export class ChattelEntry {
  @Prop({ type: String }) description?: string;
  @Prop({ type: Number }) value?: number;
  @Prop({ type: String }) registrationOrId?: string;
  @Prop({ type: String }) notes?: string;
}
export const ChattelEntrySchema = SchemaFactory.createForClass(ChattelEntry);

@Schema({ _id: false })
export class OtherAssetEntry {
  @Prop({ type: String }) provider?: string;
  @Prop({ type: String }) description?: string;
  @Prop({ type: Number }) value?: number;
  @Prop({ type: String }) notes?: string;
}
export const OtherAssetEntrySchema = SchemaFactory.createForClass(OtherAssetEntry);

/**
 * Step-specific schemas
 */

@Schema({ _id: false })
export class Step1Details {
  // About you
  @Prop({ type: String }) firstName?: string;
  @Prop({ type: String }) middleNames?: string;
  @Prop({ type: String }) lastName?: string;
  @Prop({ type: Date }) dateOfBirth?: Date;
  @Prop({ type: String }) address?: string;
  @Prop({ type: Date }) dateOfMarriage?: Date;
  @Prop({ type: Boolean, default: false }) hasChildren?: boolean;
  @Prop({ type: Boolean, default: false }) fluentInEnglish?: boolean;
  @Prop({ type: String }) nationality?: string;
  @Prop({ type: String }) domicileResidencyStatus?: string;
  @Prop({ type: String }) occupation?: string;
  @Prop({ type: Number }) incomeGBP?: number;
  @Prop({ type: String }) overviewAim?: string;
  @Prop({ type: String }) currentLivingSituation?: string;
  // Confirmations (checkboxes)
  @Prop({ type: Boolean, default: false }) confirm_wenup_platform_used?: boolean;
  @Prop({ type: Boolean, default: false }) property_personal_possessions_remain?: boolean;
  @Prop({ type: Boolean, default: false }) family_home_divided_equally?: boolean;
  @Prop({ type: Boolean, default: false }) court_can_depart_for_children?: boolean;
  @Prop({ type: Boolean, default: false }) agree_costs_shared?: boolean;
}
export const Step1DetailsSchema = SchemaFactory.createForClass(Step1Details);

@Schema({ _id: false })
export class Step2Details {
  @Prop({ type: Boolean, default: false }) separateEarnings?: boolean;
  @Prop({ type: [IncomeEntrySchema], default: [] }) earningsEntries?: IncomeEntry[];

  @Prop({ type: Boolean, default: false }) separateProperties?: boolean;
  @Prop({ type: [PropertyEntrySchema], default: [] }) propertyEntries?: PropertyEntry[];

  @Prop({ type: Boolean, default: false }) separateSavings?: boolean;
  @Prop({ type: [SavingEntrySchema], default: [] }) savingsEntries?: SavingEntry[];

  @Prop({ type: Boolean, default: false }) separatePensions?: boolean;
  @Prop({ type: [PensionEntrySchema], default: [] }) pensionEntries?: PensionEntry[];

  @Prop({ type: Boolean, default: false }) separateDebts?: boolean;
  @Prop({ type: [DebtEntrySchema], default: [] }) debtEntries?: DebtEntry[];

  @Prop({ type: Boolean, default: false }) separateBusinesses?: boolean;
  @Prop({ type: [BusinessEntrySchema], default: [] }) businessEntries?: BusinessEntry[];

  @Prop({ type: Boolean, default: false }) separateChattels?: boolean;
  @Prop({ type: [ChattelEntrySchema], default: [] }) chattelEntries?: ChattelEntry[];

  @Prop({ type: Boolean, default: false }) separateOtherAssets?: boolean;
  @Prop({ type: [OtherAssetEntrySchema], default: [] }) otherAssetEntries?: OtherAssetEntry[];
}
export const Step2DetailsSchema = SchemaFactory.createForClass(Step2Details);

/**
 * Step 3 & 4 mirror Step 1 & 2 but for the partner.
 */
@Schema({ _id: false })
export class Step3Details extends Step1Details { }
export const Step3DetailsSchema = SchemaFactory.createForClass(Step3Details);

@Schema({ _id: false })
export class Step4Details extends Step2Details { }
export const Step4DetailsSchema = SchemaFactory.createForClass(Step4Details);

/**
 * Step 5 - Joint Assets
 */
@Schema({ _id: false })
export class Step5Details {
  @Prop({ type: Boolean, default: false }) sharedEarnings?: boolean;
  @Prop({ type: Object, default: {} }) sharedEarningsDetails?: any;

  @Prop({ type: Boolean, default: false }) sharedDebts?: boolean;
  @Prop({ type: Object, default: {} }) sharedDebtsDetails?: any;

  @Prop({ type: Boolean, default: false }) sharedBusinesses?: boolean;
  @Prop({ type: Object, default: {} }) sharedBusinessesDetails?: any;

  @Prop({ type: Boolean, default: false }) sharedChattels?: boolean;
  @Prop({ type: Object, default: {} }) sharedChattelsDetails?: any;

  @Prop({ type: Boolean, default: false }) sharedOtherAssets?: boolean;
  @Prop({ type: Object, default: {} }) sharedOtherAssetsDetails?: any;

  @Prop({ type: Boolean, default: false }) liveInRentedOrOwned?: boolean;
  @Prop({ type: Boolean, default: false }) sharedSavings?: boolean;
  @Prop({ type: Boolean, default: false }) sharedPensions?: boolean;
}
export const Step5DetailsSchema = SchemaFactory.createForClass(Step5Details);

/**
 * Step 6 - Future Assets, Inheritance & Gifts
 */
@Schema({ _id: false })
export class FutureInheritance {
  @Prop({ type: Number }) originalAmount?: number;
  @Prop({ type: String }) originalCurrency?: string;
  @Prop({ type: Number }) gbpEquivalent?: number;
  @Prop({ type: String }) basisOfEstimate?: string;
}
export const FutureInheritanceSchema = SchemaFactory.createForClass(FutureInheritance);

@Schema({ _id: false })
export class Step6Details {
  @Prop({ type: Boolean, default: false }) inheritanceConsideredSeparate?: boolean;
  @Prop({ type: Boolean, default: false }) giftConsideredSeparate?: boolean;
  @Prop({ type: Boolean, default: false }) futureAssetsTreatedJointOrSeparate?: boolean;
  @Prop({ type: Boolean, default: false }) willBeSameAsDivorceSplit?: boolean;
  @Prop({ type: Boolean, default: false }) wantWillHelp?: boolean;

  @Prop({ type: FutureInheritanceSchema, default: {} }) person1FutureInheritance?: FutureInheritance;
  @Prop({ type: FutureInheritanceSchema, default: {} }) person2FutureInheritance?: FutureInheritance;
}
export const Step6DetailsSchema = SchemaFactory.createForClass(Step6Details);

/**
 * Step 7 - Areas of Complexity (yes/no + overview follow-ups)
 */
@Schema({ _id: false })
export class Step7Details {
  @Prop({ type: Boolean, default: false }) isOnePregnant?: boolean;
  @Prop({ type: String }) isOnePregnantOverview?: string;

  @Prop({ type: Boolean, default: false }) businessWorkedTogether?: boolean;
  @Prop({ type: String }) businessWorkedTogetherOverview?: string;

  @Prop({ type: Boolean, default: false }) oneOutOfWorkOrDependent?: boolean;
  @Prop({ type: String }) oneOutOfWorkOverview?: string;

  @Prop({ type: Boolean, default: false }) familyHomeOwnedWith3rdParty?: boolean;
  @Prop({ type: String }) familyHome3rdPartyOverview?: string;

  @Prop({ type: Boolean, default: false }) combinedAssetsOver3m?: boolean;
  @Prop({ type: String }) combinedAssetsOver3mOverview?: string;

  @Prop({ type: Boolean, default: false }) childFromPreviousRelationshipsLivingWithYou?: boolean;
  @Prop({ type: String }) childFromPreviousOverview?: string;

  @Prop({ type: Object, default: {} }) additionalComplexities?: any;
}
export const Step7DetailsSchema = SchemaFactory.createForClass(Step7Details);

/**
 * Step status subdocument (now includes lock metadata)
 */
@Schema({ _id: false })
export class StepStatus {
  @Prop({ type: Boolean, default: false }) submitted: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  submittedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null }) submittedAt: Date | null;

  // lock metadata
  @Prop({ type: Boolean, default: false }) locked: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  lockedBy: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) lockedAt: Date | null;

  // unlock audit
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  unlockedBy: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) unlockedAt: Date | null;
}
export const StepStatusSchema = SchemaFactory.createForClass(StepStatus);

/**
 * Main Case schema
 */
export type CaseDocument = Case & Document;

@Schema({ timestamps: true })
export class Case {
  @Prop({ type: String, default: 'Untitled case' })
  title: string;

  @Prop({ type: Object, default: null })
  inviteCredentials?: {
    email: string;
    password: string;
    createdAt: Date;
  };

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  owner: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedUser: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  invitedEmail: string | null;

  @Prop({ type: String, default: null })
  inviteToken: string | null;

  @Prop({ type: Date, default: null })
  inviteTokenExpires: Date | null;

  // Steps with their full typed structures
  @Prop({ type: Step1DetailsSchema, default: {} })
  step1: Step1Details;

  @Prop({ type: Step2DetailsSchema, default: {} })
  step2: Step2Details;

  @Prop({ type: Step3DetailsSchema, default: {} })
  step3: Step3Details;

  @Prop({ type: Step4DetailsSchema, default: {} })
  step4: Step4Details;

  @Prop({ type: Step5DetailsSchema, default: {} })
  step5: Step5Details;

  @Prop({ type: Step6DetailsSchema, default: {} })
  step6: Step6Details;

  @Prop({ type: Step7DetailsSchema, default: {} })
  step7: Step7Details;

  // per-step status
  @Prop({
    type: {
      step1: StepStatusSchema,
      step2: StepStatusSchema,
      step3: StepStatusSchema,
      step4: StepStatusSchema,
      step5: StepStatusSchema,
      step6: StepStatusSchema,
      step7: StepStatusSchema,
    },
    default: {},
  })
  status: {
    step1?: StepStatus;
    step2?: StepStatus;
    step3?: StepStatus;
    step4?: StepStatus;
    step5?: StepStatus;
    step6?: StepStatus;
    step7?: StepStatus;
  };
}

export const CaseSchema = SchemaFactory.createForClass(Case);
