import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';


import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
  ) {}

  @Roles('admin', 'superadmin', 'case_manager')
  @Post()
  async create(@Body() body: any) {
    return this.companiesService.create(body);
  }

  @Roles('admin', 'superadmin', 'case_manager')
  @Get()
  async listAll() {
    return this.companiesService.listAll();
  }

  @Roles('admin', 'superadmin', 'case_manager')
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.companiesService.findById(id);
  }
}