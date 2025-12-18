// src/cases/dto/step5.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

// Shared Earnings
class SharedIncomeEntryDto {
  @IsString() source: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() notes?: string;
}

// Shared Debts
class SharedDebtEntryDto {
  @IsString() accountOrLender: string;
  @IsString() description: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() notes?: string;
}

// Shared Businesses
class SharedBusinessEntryDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() value: number;
  @IsOptional() @IsNumber() ownershipPercentage?: number;
  @IsOptional() @IsString() explanation?: string;
}

// Shared Chattels
class SharedChattelEntryDto {
  @IsString() description: string;
  @IsNumber() value: number;
  @IsOptional() @IsString() registrationOrId?: string;
  @IsOptional() @IsString() notes?: string;
}

// Other Shared Assets
class SharedOtherAssetEntryDto {
  @IsOptional() @IsString() provider?: string;
  @IsString() description: string;
  @IsNumber() value: number;
  @IsOptional() @IsString() notes?: string;
}

// Shared Savings
class SharedSavingEntryDto {
  @IsString() name: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() notes?: string;
}

// Shared Pensions
class SharedPensionEntryDto {
  @IsString() name: string;
  @IsNumber() value: number;
  @IsOptional() @IsString() notes?: string;
}

// Property currently lived in
class PropertyDto {
  @IsString() addressLine1: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() townOrCity?: string;
  @IsOptional() @IsString() postcode?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() mortgageOutstanding?: string;
  @IsOptional() @IsString() notes?: string;
}

export class Step5Dto {
  // 1. Shared Earnings
  @IsBoolean() hasSharedEarnings: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedIncomeEntryDto)
  sharedEarningsEntries?: SharedIncomeEntryDto[];

  // 1b. Shared Debts
  @IsBoolean() hasSharedDebts: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedDebtEntryDto)
  sharedDebtEntries?: SharedDebtEntryDto[];

  // 1c. Shared Businesses
  @IsBoolean() hasSharedBusinesses: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedBusinessEntryDto)
  sharedBusinessEntries?: SharedBusinessEntryDto[];

  // 1d. Shared Chattels
  @IsBoolean() hasSharedChattels: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedChattelEntryDto)
  sharedChattelEntries?: SharedChattelEntryDto[];

  // 1e. Other Shared Assets
  @IsBoolean() hasOtherSharedAssets: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedOtherAssetEntryDto)
  sharedOtherAssetEntries?: SharedOtherAssetEntryDto[];

  // 2. Property currently lived in
  @IsBoolean() hasProperty: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => PropertyDto)
  property?: PropertyDto;

  // 3. Shared Savings
  @IsBoolean() hasSharedSavings: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedSavingEntryDto)
  sharedSavingsEntries?: SharedSavingEntryDto[];

  // 4. Shared Pensions
  @IsBoolean() hasSharedPensions: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedPensionEntryDto)
  sharedPensionEntries?: SharedPensionEntryDto[];
}
