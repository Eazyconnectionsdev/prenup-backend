// src/cases/dto/step6.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

// DTO for future inheritance/gift/debt entries
class FutureAssetEntryDto {
  @IsNumber() originalAmount: number;
  @IsString() originalCurrency: string;
  @IsNumber() gbpEquivalent: number;
  @IsString() basisOfEstimate: string;
}

// Step 6 DTO
export class Step6Dto {
  // 1. Inheritance: Separate or Joint
  @IsBoolean() inheritanceSeparate: boolean;

  // 2. Gifts: Separate or Joint
  @IsBoolean() giftsSeparate: boolean;

  // 3. Future assets or debts acquired in sole names: Separate or Joint
  @IsBoolean() futureSoleAssetsSeparate: boolean;

  // 4. Agreement for divorce vs. death
  @IsBoolean() sameAsWill: boolean;

  // 5. Will assistance
  @IsBoolean() wantWillAssistance: boolean;

  // 6. Future inheritance details for Person 1
  @IsOptional()
  @ValidateNested()
  @Type(() => FutureAssetEntryDto)
  sooriyaFutureInheritance?: FutureAssetEntryDto;

  // 7. Future inheritance details for Person 2
  @IsOptional()
  @ValidateNested()
  @Type(() => FutureAssetEntryDto)
  gomathiFutureInheritance?: FutureAssetEntryDto;
}
