import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('EMAIL_HOST'),
      port: Number(this.config.get('EMAIL_PORT') || 587),
      secure: false,
      auth: {
        user: this.config.get('EMAIL_USER'),
        pass: this.config.get('EMAIL_PASS'),
      },
    });
  }

  async sendInvite(to: string, inviteUrl: string) {
    const info = await this.transporter.sendMail({
      from: this.config.get('EMAIL_USER'),
      to,
      subject: 'You are invited to a Wenup case',
      text: `You have been invited. Accept: ${inviteUrl}`,
      html: `<p>You have been invited. Accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`,
    });
    this.logger.log(`Invite sent: ${info.messageId}`);
    return info;
  }

  async sendReset(to: string, resetUrl: string) {
    const info = await this.transporter.sendMail({
      from: this.config.get('EMAIL_USER'),
      to,
      subject: 'Reset your password',
      text: `Reset link: ${resetUrl}`,
      html: `<p>Reset link: <a href="${resetUrl}">${resetUrl}</a></p>`,
    });
    this.logger.log(`Reset sent: ${info.messageId}`);
    return info;
  }
}
