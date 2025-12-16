import { IsEmail, IsString } from 'class-validator';

export class InviteDto {
  @IsEmail()
  email: string;

  @IsString()
  caseId: string;
}
