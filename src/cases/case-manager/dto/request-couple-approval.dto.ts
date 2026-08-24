import {
  IsOptional,
  IsString,
} from 'class-validator';

export class RequestCoupleApprovalDto {
  @IsOptional()
  @IsString()
  emailMessage?: string;
}