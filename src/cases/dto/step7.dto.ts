// src/cases/dto/step7.dto.ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';

// Sub DTO for a question with optional overview
class Step7QuestionDto {
  @IsBoolean()
  answer: boolean;

  @IsOptional()
  @IsString()
  overview?: string;
}

export class Step7Dto {
  // 1. Pregnancy
  @IsOptional()
  overview?: string;
  @IsOptional()
  pregnancy?: Step7QuestionDto;

  // 2. Business worked in together
  @IsOptional()
  businessTogether?: Step7QuestionDto;

  // 3. Out of work / financially dependent
  @IsOptional()
  outOfWorkDependent?: Step7QuestionDto;

  // 4. Family home owned with a 3rd party
  @IsOptional()
  familyHomeThirdParty?: Step7QuestionDto;

  // 5. Combined assets worth more than £3m
  @IsOptional()
  assetsOver3M?: Step7QuestionDto;

  // 6. Repeated: Out of work / financially dependent
  @IsOptional()
  outOfWorkDependent2?: Step7QuestionDto;

  // 7. Repeated: Family home owned with 3rd party
  @IsOptional()
  familyHomeThirdParty2?: Step7QuestionDto;

  // 8. Repeated: Combined assets worth more than £3m
  @IsOptional()
  assetsOver3M2?: Step7QuestionDto;

  // 9. Child from current or previous relationships living with you
  @IsOptional()
  childLivingWithYou?: Step7QuestionDto;
}
