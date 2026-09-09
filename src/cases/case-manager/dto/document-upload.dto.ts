import {
  IsOptional,
  IsString,
} from 'class-validator';

export class DocumentUploadDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}