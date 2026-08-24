import {
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTimelineEntryDto {
  @IsString()
  action!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}