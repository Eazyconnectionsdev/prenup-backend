import { IsEmail, IsString } from 'class-validator';
export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  token: string;

  @IsString()
  newPassword: string;
}
