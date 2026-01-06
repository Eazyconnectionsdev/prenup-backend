// src/cases/dto/step5.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
  IsBoolean,
  IsObject,
  IsISO8601,
} from 'class-validator';

export class QuestionDto {
  @IsString()
  question!: string;

  // answer is optional (may be missing/null while drafting). When present, must be 'yes' or 'no'.
  @IsOptional()
  @IsIn(['yes', 'no'], { message: 'answer must be "yes" or "no"' })
  answer?: 'yes' | 'no';
}

export class FollowUpDto {
  @IsString()
  question!: string;

  @IsOptional()
  @IsIn(['yes', 'no'], { message: 'answer must be "yes" or "no"' })
  answer?: 'yes' | 'no';

  // details may be any JSON object (optional)
  @IsOptional()
  @IsObject({ message: 'details must be an object' })
  details?: Record<string, any>;
}

export class Step5Dto {
  @IsOptional()
  @IsString()
  heading?: string;

  // questions array: must be exactly 4 items (matches frontend)
  @IsArray()
  @ArrayMinSize(4, { message: 'questions must have 4 items' })
  @ArrayMaxSize(4, { message: 'questions must have 4 items' })
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];

  // followUpsShown is optional but when present should be boolean
  @IsOptional()
  @IsBoolean({ message: 'followUpsShown must be a boolean' })
  followUpsShown?: boolean;

  // followUps array: must be exactly 4 items (frontend renders 4 follow-ups)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(4, { message: 'followUps must have 4 items' })
  @ArrayMaxSize(4, { message: 'followUps must have 4 items' })
  @ValidateNested({ each: true })
  @Type(() => FollowUpDto)
  followUps?: FollowUpDto[];

  // savedAt optional ISO8601 timestamp
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'savedAt must be an ISO8601 datetime string' })
  savedAt?: string;
}
