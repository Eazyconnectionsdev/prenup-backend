// src/cases/dto/step2.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class IncomeEntryDto {
  @IsString() source: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() notes?: string;
}

class PropertyEntryDto {
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() townOrCity?: string;
  @IsOptional() @IsString() postcode?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() mortgageOutstanding?: string;
  @IsOptional() @IsString() notes?: string;
}

class SavingEntryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() notes?: string;
}

class PensionEntryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() notes?: string;
}

class DebtEntryDto {
  @IsOptional() @IsString() accountOrLender?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() notes?: string;
}

class BusinessEntryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsNumber() ownershipPercentage?: number;
  @IsOptional() @IsString() explanation?: string;
}

class ChattelEntryDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() registrationOrId?: string;
  @IsOptional() @IsString() notes?: string;
}

class OtherAssetEntryDto {
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() notes?: string;
}

export class Step4Dto {
  @IsOptional() @IsBoolean() separateEarnings?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => IncomeEntryDto) earningsEntries?: IncomeEntryDto[];

  @IsOptional() @IsBoolean() separateProperties?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PropertyEntryDto) propertyEntries?: PropertyEntryDto[];

  @IsOptional() @IsBoolean() separateSavings?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SavingEntryDto) savingsEntries?: SavingEntryDto[];

  @IsOptional() @IsBoolean() separatePensions?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PensionEntryDto) pensionEntries?: PensionEntryDto[];

  @IsOptional() @IsBoolean() separateDebts?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DebtEntryDto) debtEntries?: DebtEntryDto[];

  @IsOptional() @IsBoolean() separateBusinesses?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BusinessEntryDto) businessEntries?: BusinessEntryDto[];

  @IsOptional() @IsBoolean() separateChattels?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChattelEntryDto) chattelEntries?: ChattelEntryDto[];

  @IsOptional() @IsBoolean() separateOtherAssets?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OtherAssetEntryDto) otherAssetEntries?: OtherAssetEntryDto[];
}
