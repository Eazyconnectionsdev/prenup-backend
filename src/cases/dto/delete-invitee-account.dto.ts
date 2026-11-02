import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Staff deleting the invited partner's account. The address must be typed
 * back so a stray click cannot delete the wrong person.
 */
export class DeleteInviteeAccountDto {
  @IsEmail({}, { message: 'Type the account email address to confirm' })
  @MaxLength(254)
  confirmEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Email the partner a fresh invitation (a registration link). Defaults to true. */
  @IsOptional()
  @IsBoolean()
  resendInvite?: boolean;
}
