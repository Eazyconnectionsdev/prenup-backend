import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ReturnDraftDto {
  @IsString()
  @MinLength(5)
  reason!: string;

  @IsOptional()
  @IsArray()
  attachments?: string[];
}