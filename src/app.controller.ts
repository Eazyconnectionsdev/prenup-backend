import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { AdminService } from './admin/admin.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly adminService: AdminService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('settings/topbar')
  async getTopbarSettings() {
    const settings = await this.adminService.getSettings();
    return {
      topBar1Enabled: settings.topBar1Enabled ?? true,
      topBar1Text: settings.topBar1Text ?? '',
      topBar2Enabled: settings.topBar2Enabled ?? true,
      topBar2Text: settings.topBar2Text ?? '',
      topBar: settings.topBar ?? [],
    };
  }
}

