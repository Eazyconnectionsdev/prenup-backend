import { IsInt, IsObject } from 'class-validator';

export class UpdateStepDto {
  @IsInt()
  stepNumber: number;

  @IsObject()
  data: any;
}
