import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { LAWYER_FILE_CATEGORIES } from '../schemas/lawyer.schema';
import { RequiredText } from './create-company.dto';

// Multipart forms send an empty string for a blank date field.
const isFilled = (_: unknown, value: unknown) => value !== undefined && value !== null && value !== '';

/** Text fields of the multipart request that carries a lawyer document upload. */
export class CreateLawyerDocumentDto {
  @RequiredText()
  title: string;

  @IsIn(LAWYER_FILE_CATEGORIES as readonly string[])
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
