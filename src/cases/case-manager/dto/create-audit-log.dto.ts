import {
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAuditLogDto {
  @IsString()
  action!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}