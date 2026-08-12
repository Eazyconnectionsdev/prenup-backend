// src/mail/mail.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import AWS from 'aws-sdk';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: Mail | null = null;
  private readonly logger = new Logger(MailService.name);
  private fromAddress: string | null = null;

  constructor(private config: ConfigService, @InjectModel(User.name) private userModel: Model<UserDocument>) { }

  onModuleInit() {
    const accessKey = this.config.get<string>('AWS_ACCESS_KEY') || this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY') || this.config.get<string>('AWS_SECRET_KEY');
    const region = this.config.get<string>('AWS_REGION');
    const from = (this.config.get<string>('EMAIL_USER') || this.config.get<string>('MAIL_FROM') || this.config.get<string>('FROM_EMAIL') || '').trim();
    this.fromAddress = from || null;

    if (!accessKey || !secretKey || !region) {
      this.logger.warn('AWS SES not configured; using jsonTransport for development.');
      this.transporter = nodemailer.createTransport({ jsonTransport: true } as any);
      return;
    }

    if (!this.fromAddress) {
      this.logger.error('No from address configured (EMAIL_USER/MAIL_FROM/FROM_EMAIL).');
      throw new Error('MAIL_FROM not configured');
    }

    AWS.config.update({ accessKeyId: accessKey, secretAccessKey: secretKey, region });
    const ses = new AWS.SES({ apiVersion: '2010-12-01' });

    this.transporter = nodemailer.createTransport({ SES: { ses, aws: AWS } } as any);
    this.logger.log(`MailService initialized (SES region=${region}, from=${this.fromAddress})`);
  }

  private async sendRaw(opts: { to: string; subject: string; text?: string; html?: string; replyTo?: string }) {
    const { to, subject, text, html, replyTo } = opts;
    if (!this.transporter) {
      this.logger.warn(`(dev) would send email to=${to} subject=${subject}`);
      return { dev: true };
    }
    if (!this.fromAddress) throw new Error('Mail from address not configured');
    if (!to || typeof to !== 'string') throw new Error('Invalid recipient');

    const mailOptions: any = { from: this.fromAddress, to, subject, text, html, replyTo: replyTo || this.fromAddress };
    try {
      const info = await (this.transporter as any).sendMail(mailOptions);
      this.logger.log(`Email sent to=${to} subject=${subject} id=${(info as any)?.messageId ?? 'n/a'}`);
      return info;
    } catch (err) {
      this.logger.error(`Failed to send email to ${to} subject=${subject}`, err as any);
      throw err;
    }
  }

  async sendMail(to: string, subject: string, text: string, html?: string, replyTo?: string) {
    return this.sendRaw({ to, subject, text, html, replyTo });
  }

  private async resolveEmail(ref: any, fallback?: string): Promise<string | null> {
    try {
      if (!ref && fallback) return fallback;
      if (ref && typeof ref === 'object') {
        const maybe = (ref as any).email;
        if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
        const id = (ref as any)._id ?? (ref as any).id;
        if (id && this.userModel) {
          const u = await this.userModel.findById(id).select('email').lean().exec() as { email?: string } | null;
          if (u && u.email) return String(u.email).trim();
        }
      }
      if (typeof ref === 'string') {
        if (ref.includes('@')) return ref.trim();
        if (this.userModel) {
          const u = await this.userModel.findById(ref).select('email').lean().exec() as { email?: string } | null;
          if (u && u.email) return String(u.email).trim();
        }
      }
      if (ref && typeof ref.toString === 'function' && this.userModel) {
        const maybe = ref.toString();
        if (!maybe.includes('@')) {
          const u = await this.userModel.findById(maybe).select('email').lean().exec() as { email?: string } | null;
          if (u && u.email) return String(u.email).trim();
        }
      }
    } catch (err) {
      this.logger.warn('resolveEmail error', err as any);
    }
    return fallback ?? null;
  }

  async sendInvite(to: string, inviteUrl: string) {
    const subject = 'You are invited';
    const text = `You have been invited. Accept: ${inviteUrl}`;
    const html = `<p>You have been invited. Accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`;
    return this.sendRaw({ to, subject, text, html });
  }

  async sendInviteCredentials(to: string, password: string, caseId?: string) {
    const subject = 'You have been invited — sign-in details';
    const text = `You were invited. Email: ${to}\nPassword: ${password}\n\nWe recommend changing your password after sign-in.${caseId ? `\n\nCase ID: ${caseId}` : ''}`;
    const html = `<p>You were invited. Email: ${to}</p><p>Password: ${password}</p>${caseId ? `<p>Case ID: ${caseId}</p>` : ''}`;
    return this.sendRaw({ to, subject, text, html });
  }

  async sendVerificationOtp(email: string, otp: string, opts?: { expiresAt?: Date }) {
    const expiry = opts?.expiresAt ? `This OTP expires at ${opts.expiresAt.toISOString()}` : '';
    const subject = 'Your verification code';
    const text = `Your verification code: ${otp}\n${expiry}`;
    const html = `<p>Your verification code: <strong>${otp}</strong></p>${expiry ? `<p>${expiry}</p>` : ''}`;
    return this.sendRaw({ to: email, subject, text, html });
  }

  async sendReset(email: string, resetUrl: string) {
    const subject = 'Password reset instructions';
    const text = `Reset link: ${resetUrl}`;
    const html = `<p>Reset link: <a href="${resetUrl}">${resetUrl}</a></p>`;
    return this.sendRaw({ to: email, subject, text, html });
  }

  async sendFirstPhaseCompletedForCase(caseDoc: any) {
    if (!caseDoc) return;
    const caseId = caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : null;
    if (!caseId) return;
    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    const recipients = Array.from(new Set([owner, invited].filter((x): x is string => !!x)));
    if (recipients.length === 0) return;
    const subject = `First phase completed — Case ${caseId}`;
    const text = `The first phase of questionnaires has been submitted for case ${caseId}. Please proceed to pre-lawyer questionnaire and select a lawyer.`;
    const html = `<p>The first phase of questionnaires has been submitted for case <strong>${caseId}</strong>.</p><p>Please proceed to pre-lawyer questionnaire and select a lawyer.</p>`;
    await Promise.all(recipients.map(r => this.sendRaw({ to: r, subject, text, html }).catch(() => null)));
  }

  private async getCaseManagerEmails(): Promise<string[]> {
    try {
      this.logger.debug('Fetching case managers from DB...');
      // explicit projection is slightly clearer than select()
      const cms = await this.userModel.find({ role: 'case_manager' }, { email: 1 }).lean().exec() as Array<{ email?: string }>;
      this.logger.debug(`DB returned ${Array.isArray(cms) ? cms.length : 0} case manager docs`);
      const emails = (cms || [])
        .map(c => typeof c?.email === 'string' ? c.email.trim() : null)
        .filter(Boolean) as string[];

      if (emails.length === 0) {
        this.logger.warn('No case manager emails found in DB (role=case_manager). Falling back to config.');
        // fallback to config if DB empty
        const cfg = String(this.config.get('CASE_MANAGERS_EMAILS') || this.config.get('CASE_MANAGER_EMAILS') || '');
        const list = cfg.split(',').map(s => s.trim()).filter(Boolean);
        return Array.from(new Set(list));
      }

      return Array.from(new Set(emails));
    } catch (err) {
      this.logger.warn('Failed to fetch case managers from DB', err as any);
      const cfg = String(this.config.get('CASE_MANAGERS_EMAILS') || this.config.get('CASE_MANAGER_EMAILS') || '');
      const list = cfg.split(',').map(s => s.trim()).filter(Boolean);
      return Array.from(new Set(list));
    }
  }


  async sendCaseManagerIntimation(caseDoc: any, overrideRecipients?: string[]) {
    const caseId = caseDoc && (caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : 'N/A');
    const recipients = overrideRecipients && overrideRecipients.length ? Array.from(new Set(overrideRecipients)) : await this.getCaseManagerEmails();
    if (!recipients || recipients.length === 0) return;
    const subject = `Case ready for review — ${caseId}`;
    const text = `A case requires review and assignment. Case: ${caseId} Title: ${caseDoc?.title ?? 'N/A'}`;
    const html = `<p>A case requires review and assignment.</p><p>Case: <strong>${caseId}</strong><br/>Title: ${caseDoc?.title ?? 'N/A'}</p>`;
    await Promise.all(recipients.map(r => this.sendRaw({ to: r, subject, text, html }).catch(() => null)));
  }

  async sendAgreementSubmittedForCase(caseDoc: any) {
    if (!caseDoc) return;
    const appUrl = this.config.get('APP_SERVER_URL') || this.config.get('APP_BASE_URL') || '';
    const caseId = caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : null;
    const caseLink = caseId ? `${appUrl}/cases/${caseId}` : appUrl;
    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    const cms = await this.getCaseManagerEmails();
    const userRecipients = Array.from(new Set([owner, invited].filter((x): x is string => !!x)));
    const adminRecipients = cms;
    const userSubject = `Agreement Submitted — case ${caseId}`;
    const userText = `Hi,\n\nThank you for submitting your responses to the Wenup questionnaire.\n\nA draft of your nuptial agreement has been generated and will be shared shortly.\n\nYour case manager will contact you within 1–2 business days.\n\nRegards,\nWenup`;
    const userHtml = `<p>Hi,</p><p>Thank you for submitting your responses to the Wenup questionnaire.</p><p>A draft of your nuptial agreement has been generated and will be shared shortly.</p><p>Your case manager will contact you within 1–2 business days.</p>`;
    const adminSubject = `Agreement submitted — case ${caseId}`;
    const adminText = `Case ${caseId} has been submitted and locked. View: ${caseLink}`;
    const adminHtml = `<p>Case <strong>${caseId}</strong> has been submitted and locked.</p><p><a href="${caseLink}">View case</a></p>`;
    await Promise.all([
      ...userRecipients.map(r => this.sendRaw({ to: r, subject: userSubject, text: userText, html: userHtml }).catch(() => null)),
      ...adminRecipients.map(r => this.sendRaw({ to: r, subject: adminSubject, text: adminText, html: adminHtml }).catch(() => null)),
    ]);
  }

  async sendAgreementDocumentLink(caseDoc: any, link: string, overrideRecipients?: string[]) {
    if (!caseDoc) return;
    const caseId = caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : null;
    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    const recipients = overrideRecipients && overrideRecipients.length ? Array.from(new Set(overrideRecipients)) : Array.from(new Set([owner, invited].filter((x): x is string => !!x)));
    if (!recipients || recipients.length === 0) return;
    const subject = `Your draft agreement is ready — case ${caseId}`;
    const text = `A draft document of your agreement has been uploaded. View: ${link}`;
    const html = `<p>A draft document of your agreement has been uploaded.</p><p><a href="${link}">${link}</a></p>`;
    await Promise.all(recipients.map(r => this.sendRaw({ to: r, subject, text, html }).catch(() => null)));
  }

  async sendCaseAssignedNotification(caseDoc: any, manager: { name?: string; email?: string; phone?: string }, overrideRecipients?: string[]) {
    if (!caseDoc) return;
    const caseId = caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : null;
    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    const recipients = overrideRecipients && overrideRecipients.length ? Array.from(new Set(overrideRecipients)) : Array.from(new Set([owner, invited].filter((x): x is string => !!x)));
    if (!recipients || recipients.length === 0) return;
    const subject = `Your case ${caseId} has been assigned a Case Manager`;
    const text = `Your case (${caseId}) has been assigned to: ${manager.name ?? 'Case Manager'}${manager.email ? `\nEmail: ${manager.email}` : ''}${manager.phone ? `\nPhone: ${manager.phone}` : ''}`;
    const html = `<p>Your case (<strong>${caseId}</strong>) has been assigned to: ${manager.name ?? 'Case Manager'}</p>${manager.email ? `<p>Email: ${manager.email}</p>` : ''}${manager.phone ? `<p>Phone: ${manager.phone}</p>` : ''}`;
    await Promise.all(recipients.map(r => this.sendRaw({ to: r, subject, text, html }).catch(() => null)));
  }

  async sendLawyerIntro(lawyerEmail: string, caseDoc: any, clientMessage?: string) {
    if (!lawyerEmail) return;
    const caseId = caseDoc && (caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : 'N/A');
    const subject = `Client introduction — new client via LetsPrenup (case ${caseId})`;
    const clientInfo = caseDoc?.owner?.email ? caseDoc.owner.email : (caseDoc?.invitedEmail ?? 'N/A');
    const text = `You have been selected as the lawyer for case ${caseId}. Client: ${clientInfo}\n\nMessage: ${clientMessage || '(no message)'}`;
    const html = `<p>You have been selected as the lawyer for case <strong>${caseId}</strong>.</p><p>Client: ${clientInfo}</p><p>Message: ${clientMessage || '(no message)'}</p>`;
    return this.sendRaw({ to: lawyerEmail, subject, text, html }).catch(() => null);
  }
}
