// src/mail/mail.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import AWS from 'aws-sdk';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: any;
  private readonly logger = new Logger(MailService.name);
  private fromAddress: string | null = null;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    // Validate required env variables early
    const accessKey = this.config.get<string>('AWS_ACCESS_KEY');
    const secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.config.get<string>('AWS_REGION');
    const from = this.config.get<string>('EMAIL_USER');

    this.fromAddress = from?.trim() || null;

    if (!accessKey || !secretKey || !region) {
      this.logger.error('AWS SES credentials/region are not fully configured. Mail will not work.');
      throw new Error('AWS SES not configured. Please set AWS_ACCESS_KEY, AWS_SECRET_ACCESS_KEY and AWS_REGION.');
    }

    if (!this.fromAddress) {
      this.logger.error('EMAIL_USER is not configured. Mail will not work.');
      throw new Error('EMAIL_USER not configured. Please set EMAIL_USER to a verified SES identity.');
    }

    // Configure AWS SDK
    AWS.config.update({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region,
    });

    const ses = new AWS.SES({ apiVersion: '2010-12-01' });

    // Create Nodemailer SES transporter
    this.transporter = nodemailer.createTransport({
      SES: { ses, aws: AWS },
    });

    this.logger.log(`MailService initialized (SES region=${region}, from=${this.fromAddress})`);
  }

  // Generic mail sender used by specific helpers
  private async sendMail(opts: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
  }) {
    const { to, subject, text, html, replyTo } = opts;

    if (!this.transporter) {
      this.logger.error('Transporter not initialized');
      throw new Error('Mail transporter not initialized');
    }

    if (!this.fromAddress) {
      this.logger.error('From address not configured');
      throw new Error('Mail sender is not configured');
    }

    if (!to || typeof to !== 'string') {
      this.logger.error('Invalid "to" address passed to sendMail', to);
      throw new Error('Invalid recipient email');
    }

    const mailOptions = {
      from: this.fromAddress,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || this.fromAddress,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent: ${info && info.messageId ? info.messageId : 'no-message-id' } to=${to} subject=${subject}`);
      return info;
    } catch (err) {
      this.logger.error(`Failed to send email to ${to} subject=${subject}`, err as any);
      throw err;
    }
  }

  /**
   * Send invite email containing a link
   */
  async sendInvite(to: string, inviteUrl: string) {
    if (!inviteUrl || typeof inviteUrl !== 'string') {
      this.logger.error('Invalid inviteUrl passed to sendInvite', inviteUrl);
      throw new Error('Invalid invite URL');
    }

    const subject = 'You are invited to a Wenup case';
    const text = `You have been invited. Accept: ${inviteUrl}`;
    const html = `<p>You have been invited. Accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`;

    return this.sendMail({ to, subject, text, html });
  }

  /**
   * Send password reset link
   */
  async sendReset(to: string, resetUrl: string) {
    if (!resetUrl || typeof resetUrl !== 'string') {
      this.logger.error('Invalid resetUrl passed to sendReset', resetUrl);
      throw new Error('Invalid reset URL');
    }

    const subject = 'Reset your password';
    const text = `Reset link: ${resetUrl}`;
    const html = `<p>Reset link: <a href="${resetUrl}">${resetUrl}</a></p>`;

    return this.sendMail({ to, subject, text, html });
  }

  /**
   * Send generated credentials to invited user (must include from in transporter)
   * NOTE: Prefer sending a set-password link rather than plaintext password where possible.
   */
  async sendInviteCredentials(to: string, password: string, caseId: string) {
    if (!to || !password) {
      this.logger.error('Invalid arguments to sendInviteCredentials', { to, caseId });
      throw new Error('Invalid arguments for invite credentials email');
    }

    const subject = 'You have been invited to a case';
    const text = `
Hello,

You have been invited to a case (ID: ${caseId}).

Your login credentials:
Email: ${to}
Password: ${password}

Please log in and update your password immediately.
    `;

    const html = `
<p>Hello,</p>
<p>You have been invited to a case (ID: <strong>${caseId}</strong>).</p>
<p><strong>Login credentials</strong><br/>
Email: ${to}<br/>
Password: ${password}</p>
<p>Please log in and update your password immediately.</p>
    `;

    return this.sendMail({ to, subject, text, html });
  }
}
