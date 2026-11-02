import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ValidateResetTokenDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  @MaxLength(256)
  token: string;
}
