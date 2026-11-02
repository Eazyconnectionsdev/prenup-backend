import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { COMPANY_FILE_CATEGORIES } from '../schemas/company.schema';
import { RequiredText } from './create-company.dto';

// Multipart forms send an empty string for a blank date field.
const isFilled = (_: unknown, value: unknown) => value !== undefined && value !== null && value !== '';

/** Text fields of the multipart request that carries a company document upload. */
export class CreateCompanyDocumentDto {
  @RequiredText()
  title: string;

  @IsIn(COMPANY_FILE_CATEGORIES as readonly string[])
  category: string;

  @ValidateIf(isFilled)
  @IsISO8601({ strict: true })
  issueDate?: string;

  @ValidateIf(isFilled)
  @IsISO8601({ strict: true })
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
