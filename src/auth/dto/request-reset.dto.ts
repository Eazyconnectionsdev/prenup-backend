import { IsEmail, MaxLength } from 'class-validator';

export class RequestResetDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;
}
