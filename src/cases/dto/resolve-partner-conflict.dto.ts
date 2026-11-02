import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolvePartnerConflictDto {
  // APPROVE: let the invitee join; their own case is set aside (kept, with
  // its Case ID). REJECT: withdraw the invitation.
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
