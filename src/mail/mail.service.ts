// src/mail/mail.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import AWS from 'aws-sdk';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

// <-- Adjust this import path if your user schema file is located elsewhere -->
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: any;
  private readonly logger = new Logger(MailService.name);
  private fromAddress: string | null = null;

  constructor(
    private config: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

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
                  ${opts?.expiresAt ? `<p>Expires: ${opts.expiresAt.toISOString()}</p>` : '' }
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

  /**
   * Resolve an email for a user reference (object with email / ObjectId string / plain email).
   * Returns the resolved email string or null.
   */
  private async resolveEmail(ref: any, fallbackEmail?: string): Promise<string | null> {
    try {
      if (!ref && fallbackEmail) return fallbackEmail;

      // if populated object with email
      if (ref && typeof ref === 'object') {
        const maybeEmail = (ref as any).email;
        if (typeof maybeEmail === 'string' && maybeEmail.trim()) {
          return maybeEmail.trim();
        }

        // try lookup by _id if present
        const id = (ref as any)._id ?? (ref as any).id;
        if (id && this.userModel) {
          const u = await this.userModel.findById(id).select('email').lean().exec() as { email?: string } | null;
          if (u && u.email) return String(u.email).trim();
        }
      }

      // if ref is a string (maybe an email or ObjectId string)
      if (typeof ref === 'string') {
        if (ref.includes('@')) return ref.trim();
        if (this.userModel) {
          const u = await this.userModel.findById(ref).select('email').lean().exec() as { email?: string } | null;
          if (u && u.email) return String(u.email).trim();
        }
      }

      // if ref is an ObjectId-like (with toString) and we have userModel
      if (ref && typeof ref.toString === 'function' && this.userModel) {
        const maybeId = ref.toString();
        if (!maybeId.includes('@')) {
          const u = await this.userModel.findById(maybeId).select('email').lean().exec() as { email?: string } | null;
          if (u && u.email) return String(u.email).trim();
        }
      }
    } catch (err) {
      this.logger.warn('Failed to resolve email for ref', err as any);
    }
    if (fallbackEmail) return fallbackEmail;
    return null;
  }

  /**
   * New helper: send the "first phase completed" notification to owner + invited user.
   * It intentionally omits a link and uses the requested text.
   */
  async sendFirstPhaseCompletedForCase(caseDoc: any) {
    if (!caseDoc) {
      this.logger.warn('sendFirstPhaseCompletedForCase called without caseDoc');
      return;
    }

    const caseId = caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : null;
    if (!caseId) {
      this.logger.warn('sendFirstPhaseCompletedForCase: case id not available');
      return;
    }

    // Resolve owner and invited user emails (best-effort)
    let ownerEmail: string | null = null;
    let invitedEmail: string | null = null;
    try {
      ownerEmail = await this.resolveEmail(caseDoc.owner);
    } catch (err) {
      this.logger.warn('Error resolving owner email for first-phase email', err as any);
    }
    try {
      invitedEmail = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    } catch (err) {
      this.logger.warn('Error resolving invited email for first-phase email', err as any);
    }

    const recipients = Array.from(new Set([ownerEmail, invitedEmail].filter(Boolean))) as string[];
    if (recipients.length === 0) {
      this.logger.warn('No recipients resolved for First Phase Completed email for case', caseId);
      return;
    }

    const subject = `First phase completed — Case ${caseId}`;
    const text = `Hello,

The first phase of questionnaires has been submitted by both you and your partner for case ${caseId}.
You have now moved to the pre-lawyer questionnaires and may proceed to select a lawyer.
If you have questions, contact support.

Regards,
LetsPrenup Team
`;
    const html = `<p>Hello,</p>
                  <p>The first phase of questionnaires has been submitted by both you and your partner for case <strong>${caseId}</strong>.</p>
                  <p>You have now moved to the pre-lawyer questionnaires and may proceed to select a lawyer.</p>
                  <p>If you have questions, contact support.</p>
                  <p>Regards,<br/>LetsPrenup Team</p>`;

    const sendPromises: Promise<any>[] = [];
    for (const to of recipients) {
      sendPromises.push(
        this.sendMail({ to, subject, text, html }).catch((err) => {
          this.logger.error(`Failed to send First Phase Completed email to ${to} for case ${caseId}`, err as any);
          return null;
        }),
      );
    }

    try {
      await Promise.all(sendPromises);
      this.logger.log(`First Phase Completed emails processed for case ${caseId} to: ${recipients.join(', ')}`);
    } catch (err) {
      this.logger.error(`Unexpected error while sending First Phase Completed emails for case ${caseId}`, err as any);
    }
  }

  /**
   * Send "Agreement Submitted" notifications for a given case document.
   *
   * (unchanged original behaviour; kept for backward compatibility)
   */
  async sendAgreementSubmittedForCase(caseDoc: any) {
    if (!caseDoc) {
      this.logger.warn('sendAgreementSubmittedForCase called without caseDoc');
      return;
    }

    const appUrl = this.config.get('APP_SERVER_URL') || '';
    const caseId = caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : null;
    const caseLink = caseId ? `${appUrl}/cases/${caseId}` : appUrl;

    // helper to resolve email for a user reference (reuse private resolveEmail)
    let ownerEmail: string | null = null;
    try {
      ownerEmail = await this.resolveEmail(caseDoc.owner);
    } catch (err) {
      this.logger.warn('Error resolving owner email', err as any);
    }

    let invitedEmail: string | null = null;
    try {
      invitedEmail = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    } catch (err) {
      this.logger.warn('Error resolving invited user email', err as any);
    }

    // gather case manager emails
    let caseManagerEmails: string[] = [];
    try {
      const cms = await this.userModel
        .find({ role: 'case_manager' })
        .select('email')
        .lean()
        .exec() as Array<{ email?: string }>;

      if (Array.isArray(cms) && cms.length > 0) {
        caseManagerEmails = cms
          .map((u) => (u && typeof u.email === 'string' ? u.email.trim() : null))
          .filter(Boolean) as string[];
      }

      if ((!caseManagerEmails || caseManagerEmails.length === 0) && this.config.get('CASE_MANAGERS_EMAILS')) {
        const cmsConfig = String(this.config.get('CASE_MANAGERS_EMAILS'));
        caseManagerEmails = cmsConfig.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } catch (err) {
      this.logger.warn('Error resolving case manager emails', err as any);
      if (this.config.get('CASE_MANAGERS_EMAILS')) {
        const cmsConfig = String(this.config.get('CASE_MANAGERS_EMAILS'));
        caseManagerEmails = cmsConfig.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    // prepare recipients deduped
    const recipients = Array.from(new Set([ownerEmail, invitedEmail, ...caseManagerEmails].filter(Boolean))) as string[];

    if (recipients.length === 0) {
      this.logger.warn('No recipients resolved for Agreement Submitted email for case', caseId);
      return;
    }

    // Compose user-facing subject/body
    const userSubject = `Agreement submitted — Case ${caseId}`;
    const userText = `The agreement for case ${caseId} has been submitted and the case is now locked.\n\nView the case: ${caseLink}\n\nIf you have questions, contact support.`;
    const userHtml = `<p>The agreement for case <strong>${caseId}</strong> has been submitted and the case is now locked.</p>
                      <p><a href="${caseLink}">View case</a></p>
                      <p>If you have questions, contact support.</p>`;

    // Compose case-manager/admin subject/body (shorter)
    const adminSubject = `Agreement submitted — case ${caseId}`;
    const adminText = `Case ${caseId} has been submitted and fully locked. View: ${caseLink}`;
    const adminHtml = `<p>Case <strong>${caseId}</strong> has been submitted and fully locked.</p><p><a href="${caseLink}">View case</a></p>`;

    const sendPromises: Promise<any>[] = [];

    if (ownerEmail) {
      sendPromises.push(
        this.sendMail({
          to: ownerEmail,
          subject: userSubject,
          text: userText,
          html: userHtml,
        }).catch((err) => {
          this.logger.error(`Failed to send Agreement Submitted email to owner ${ownerEmail} for case ${caseId}`, err as any);
          return null;
        }),
      );
    }

    if (invitedEmail) {
      sendPromises.push(
        this.sendMail({
          to: invitedEmail,
          subject: userSubject,
          text: userText,
          html: userHtml,
        }).catch((err) => {
          this.logger.error(`Failed to send Agreement Submitted email to invited user ${invitedEmail} for case ${caseId}`, err as any);
          return null;
        }),
      );
    }

    for (const cm of caseManagerEmails) {
      if (!cm) continue;
      sendPromises.push(
        this.sendMail({
          to: cm,
          subject: adminSubject,
          text: adminText,
          html: adminHtml,
        }).catch((err) => {
          this.logger.error(`Failed to send Agreement Submitted email to case manager ${cm} for case ${caseId}`, err as any);
          return null;
        }),
      );
    }

    try {
      await Promise.all(sendPromises);
      this.logger.log(`Agreement Submitted emails processed for case ${caseId} to recipients: ${recipients.join(', ')}`);
    } catch (err) {
      this.logger.error(`Unexpected error while sending Agreement Submitted emails for case ${caseId}`, err as any);
    }
  }

  // alias / compatibility: accept either caseDoc or caseId (prefers caseDoc)
  async sendAgreementSubmitted(caseOrDoc: any) {
    return this.sendAgreementSubmittedForCase(caseOrDoc);
  }
}
