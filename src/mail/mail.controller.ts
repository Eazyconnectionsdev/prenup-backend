// src/mail/mail.controller.ts
import { Controller, Get, Res } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Controller('mail')
export class MailController {
  @Get('preview')
  getPreview(@Res() res: any) {
    const previewPath = path.join(process.cwd(), 'preview-emails.html');
    if (fs.existsSync(previewPath)) {
      res.setHeader('Content-Type', 'text/html');
      return res.sendFile(previewPath);
    }
    return res.status(404).send('Preview file not found.');
  }
}
