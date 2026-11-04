import {
  Controller, Get, Param, UseGuards, Body,
  Patch,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { UpdateUserProfileDto } from './interface/update-user-profile.dto';
import { UpdatePartnerProfileDto } from './interface/update-partner-profile.dto';
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) { }

  // Declared before `@Get(':id')` so "partner" isn't swallowed as an id.
  @UseGuards(JwtAuthGuard)
  @Get('partner')
  async getPartner(@Req() req) {
    return this.usersService.getPartner(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(
    @Req() req,
    @Body() updateUserDto: UpdateUserProfileDto,
  ) {
    // JwtStrategy.validate() exposes the user id as `id` (not `userId`)
    return this.usersService.updateProfile(
      req.user.id,
      updateUserDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('partner/profile')
  async updatePartnerProfile(
    @Req() req,
    @Body() updatePartnerDto: UpdatePartnerProfileDto,
  ) {
    return this.usersService.updatePartnerProfile(
      req.user.id,
      updatePartnerDto,
    );
  }

}
