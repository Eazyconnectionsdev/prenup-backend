import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { AGREEMENT_TYPES } from '../schemas/case.schema';

// The card details the dummy payment screen collects. No real charge is made:
// the service validates the shape of what was entered, keeps the last four
// digits and the brand for the receipt, and discards the number and the CVC.
//
// Note there is deliberately no `amount` here. The price comes from
// SERVICE_PRICING on the server, so the client cannot decide what it pays.
export class PayCaseDto {
  // The service being paid for. Optional: when it is left out, the service
  // already chosen on the case is used.
  @IsOptional()
  @IsIn(AGREEMENT_TYPES, { message: 'Select a valid service' })
  agreementType?: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  // Digits only once the spaces the screen adds are stripped.
  @IsString()
  @Matches(/^\d{12,19}$/, { message: 'Enter a valid card number' })
  cardNumber!: string;

  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/, {
    message: 'Enter the expiry date as MM/YY',
  })
  expiry!: string;

  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'Enter a valid CVC' })
  cvc!: string;

  @IsString()
  @Length(2, 100, { message: 'Enter the name on the card' })
  nameOnCard!: string;

  @IsString()
  @Length(2, 60, { message: 'Select a billing country' })
  country!: string;

  @IsString()
  @Length(2, 12, { message: 'Enter a valid postal code' })
  @MaxLength(12)
  postalCode!: string;
}
