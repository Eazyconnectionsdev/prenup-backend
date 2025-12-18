// src/cases/dto/step1.dto.ts
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class Step3Dto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() middleNames?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string; // accept ISO date string, convert to Date in service if needed
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsDateString() dateOfMarriage?: string;
  @IsOptional() @IsBoolean() hasChildren?: boolean;
  @IsOptional() @IsBoolean() fluentInEnglish?: boolean;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() domicileResidencyStatus?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsNumber() incomeGBP?: number;
  @IsOptional() @IsString() overviewAim?: string;
  @IsOptional() @IsString() currentLivingSituation?: string;

  // checkboxes
  @IsOptional() @IsBoolean() confirm_wenup_platform_used?: boolean;
  @IsOptional() @IsBoolean() property_personal_possessions_remain?: boolean;
  @IsOptional() @IsBoolean() family_home_divided_equally?: boolean;
  @IsOptional() @IsBoolean() court_can_depart_for_children?: boolean;
  @IsOptional() @IsBoolean() agree_costs_shared?: boolean;
}
