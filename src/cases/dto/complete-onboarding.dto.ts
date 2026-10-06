import { Equals, IsIn } from 'class-validator';
import { AGREEMENT_TYPES } from '../schemas/case.schema';

export class CompleteOnboardingDto {
  @IsIn(AGREEMENT_TYPES, { message: 'Select a valid agreement type' })
  agreementType: string;

  // Both confirmations are mandatory on the onboarding screen.
  @Equals(true, { message: 'You must confirm you reside in the UK' })
  residesInUK: boolean;

  @Equals(true, { message: 'You must confirm you understand the service' })
  understandsService: boolean;
}
