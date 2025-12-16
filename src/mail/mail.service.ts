import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import AWS from 'aws-sdk';

@Injectable()
export class MailService {
  private transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {
    // Configure AWS SDK
    AWS.config.update({
      accessKeyId: this.config.get('AWS_ACCESS_KEY'),
      secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY'),
      region: this.config.get('AWS_REGION'),
    });

    const ses = new AWS.SES({ apiVersion: '2010-12-01' });

    // Create Nodemailer SES transporter
    this.transporter = nodemailer.createTransport({
      SES: { ses, aws: AWS },
    });
  }

  async sendInvite(to: string, inviteUrl: string) {
    const info = await this.transporter.sendMail({
      from: this.config.get('EMAIL_USER'), // Must be verified in SES
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
      from: this.config.get('EMAIL_USER'), // Must be verified in SES
      to,
      subject: 'Reset your password',
      text: `Reset link: ${resetUrl}`,
      html: `<p>Reset link: <a href="${resetUrl}">${resetUrl}</a></p>`,
    });
    this.logger.log(`Reset sent: ${info.messageId}`);
    return info;
  }

  async sendInviteCredentials(email: string, password: string, caseId: string) {
    const body = `
    Hello,

    You have been invited to a case (ID: ${caseId}).

    Your login credentials are:
    Email: ${email}
    Password: ${password}

    Please login and update your password immediately.
  `;
    await this.transporter.sendMail({
      to: email,
      subject: 'You have been invited to a case',
      text: body,
    });
  }

}
