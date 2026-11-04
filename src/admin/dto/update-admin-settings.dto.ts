import { IsBoolean, IsOptional } from 'class-validator';

/** Patch one or more TopBar settings at once. */
export class UpdateAdminSettingsDto {
  @IsOptional()
  @IsBoolean()
  topBar1Enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  topBar1Toggle?: boolean;

  @IsOptional()
  @IsBoolean()
  topBar2Enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  topBar2Toggle?: boolean;
}
