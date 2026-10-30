import { IsBoolean, IsMongoId, IsOptional, IsString } from 'class-validator';

// A signed-in user with an existing account accepting a partner invitation.
export class AcceptExistingInviteDto {
  @IsMongoId()
  caseId: string;

  // The emailed token. Optional: being signed in as the invited address is
  // proof enough when the person found the invitation after signing in.
  @IsOptional()
  @IsString()
  token?: string;

  // Explicit consent to set aside an unused case of their own (it is kept,
  // never deleted, and its Case ID is never reused).
  @IsOptional()
  @IsBoolean()
  confirmSetAsideOwnCase?: boolean;
}
