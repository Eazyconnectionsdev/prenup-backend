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
    const accessKey = this.config.get<string>('AWS_ACCESS_KEY');
    const secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.config.get<string>('AWS_REGION');
    const from = this.config.get<string>('EMAIL_USER') || this.config.get('MAIL_FROM');

    this.fromAddress = from?.trim() || null;

    // If AWS SES details not provided, fallback to JSON transport (development)
    if (!accessKey || !secretKey || !region) {
      this.logger.warn('AWS SES not fully configured; using noop/json transporter for emails (development mode).');
      this.transporter = nodemailer.createTransport({ jsonTransport: true } as any);
      return;
    }

    if (!this.fromAddress) {
      this.logger.error('EMAIL_USER or MAIL_FROM is not configured; Mail will not work.');
      throw new Error('EMAIL_USER or MAIL_FROM not configured. Please set a verified SES identity.');
    }

    AWS.config.update({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region,
    });

    const ses = new AWS.SES({ apiVersion: '2010-12-01' });

    this.transporter = nodemailer.createTransport({
      SES: { ses, aws: AWS },
    });

    this.logger.log(`MailService initialized (SES region=${region}, from=${this.fromAddress})`);
  }

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

    const mailOptions: any = {
      from: this.fromAddress,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || this.fromAddress,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent: ${info && (info as any).messageId ? (info as any).messageId : 'no-message-id' } to=${to} subject=${subject}`);
      return info;
    } catch (err) {
      this.logger.error(`Failed to send email to ${to} subject=${subject}`, err as any);
      throw err;
    }
  }

  // Send verification OTP to email
  async sendVerificationOtp(email: string, otp: string, opts?: { expiresAt?: Date }) {
    const expiryText = opts?.expiresAt ? `This OTP will expire at ${opts.expiresAt.toISOString()}` : '';
    const subject = 'Your verification code';
    const text = `Your verification code is: ${otp}\n\n${expiryText}\n\nIf you did not request this, please ignore this email.`;
    const html = `<p>Your verification code is: <strong>${otp}</strong></p>
                  ${opts?.expiresAt ? `<p>Expires: ${opts.expiresAt.toISOString()}</p>` : ''}
                  <p>If you did not request this, please ignore this email.</p>`;

    return this.sendMail({ to: email, subject, text, html });
  }

  // Send password reset link
  async sendReset(email: string, resetUrl: string) {
    const subject = 'Password reset instructions';
    const text = `You requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
    const html = `<p>You requested a password reset. Click the link below to reset your password:</p>
                  <p><a href="${resetUrl}">${resetUrl}</a></p>
                  <p>If you did not request this, ignore this email.</p>`;
    return this.sendMail({ to: email, subject, text, html });
  }

  // Send invite link
  async sendInvite(to: string, inviteUrl: string) {
    const subject = 'You are invited';
    const text = `You have been invited. Accept: ${inviteUrl}`;
    const html = `<p>You have been invited. Accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`;
    return this.sendMail({ to, subject, text, html });
  }

  // Send invite credentials (plaintext password — consider sending a set-password link instead)
  async sendInviteCredentials(to: string, password: string, caseId?: string) {
    const subject = 'You have been invited — sign-in details';
    const text = `You were invited to join. Use the credentials below to sign in:\n\nEmail: ${to}\nPassword: ${password}\n\nWe recommend you change your password after sign-in.`;
    const html = `<p>You were invited to join. Use the credentials below to sign in:</p>
                  <ul>
                    <li><strong>Email:</strong> ${to}</li>
                    <li><strong>Password:</strong> ${password}</li>
                  </ul>
                  <p>We recommend you change your password after sign-in.</p>
                  ${caseId ? `<p>Case ID: ${caseId}</p>` : ''}`;
    return this.sendMail({ to, subject, text, html });
  }
}
