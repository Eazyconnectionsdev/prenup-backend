// src/mail/mail.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import AWS from 'aws-sdk';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { User, UserDocument } from '../users/schemas/user.schema';
import { getDisplayCaseId } from '../utils/case-number.util';
import { buildLetsPrenupEmailHtml, EmailLayoutOptions } from './templates/email-builder';
import {
  buildPartnerInviteEmail,
  buildPartnerJoinedEmail,
  buildPartnerReminderEmail,
  buildHandshakeReviewRequestEmail,
  buildSubmissionPendingPartnerEmail,
  buildPartnerChangesRequestedEmail,
  buildMutualSubmitCompletedEmail,
  buildCaseManagerAlertEmail,
} from './templates/partner-workflow.templates';

// ---------------------------------------------------------------------------
// Shared HTML email layout – matches Lets Prenup brand design
// ---------------------------------------------------------------------------
function buildEmailHtml(opts: EmailLayoutOptions): string {
  return buildLetsPrenupEmailHtml(opts);
}

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

    const logoCandidates = [
      path.join(__dirname, 'assets/logo-heart.png'),
      path.join(__dirname, '../mail/assets/logo-heart.png'),
      path.join(process.cwd(), 'src/mail/assets/logo-heart.png'),
      path.join(process.cwd(), 'public/images/logo-heart.png'),
    ];
    const logoFile = logoCandidates.find((p) => fs.existsSync(p));
    const attachments: any[] = [];
    if (logoFile) {
      attachments.push({
        filename: 'logo-heart.png',
        path: logoFile,
        cid: 'company-logo@letsprenup',
      });
    }

    const mailOptions: any = {
      from: this.fromAddress,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || this.fromAddress,
      attachments,
    };
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

  async sendInvite(to: string, inviteUrl: string, opts?: { inviterName?: string; personalMessage?: string; targetWeddingDate?: string; existingAccount?: boolean }) {
    const inviterName = opts?.inviterName || 'Your Partner';
    const { subject, text, html } = buildPartnerInviteEmail({
      inviterName,
      inviteUrl,
      personalMessage: opts?.personalMessage,
      targetWeddingDate: opts?.targetWeddingDate,
      existingAccount: opts?.existingAccount,
    });
    return this.sendRaw({ to, subject, text, html });
  }

  async sendPartnerInvite(to: string, inviteUrl: string, opts?: { inviterName?: string; personalMessage?: string; targetWeddingDate?: string; existingAccount?: boolean }) {
    return this.sendInvite(to, inviteUrl, opts);
  }

  async sendPartnerJoinedNotification(to: string, ownerName: string, partnerName: string, dashboardUrl: string) {
    const { subject, text, html } = buildPartnerJoinedEmail({
      ownerName: ownerName || 'there',
      partnerName: partnerName || 'Your partner',
      dashboardUrl,
    });
    return this.sendRaw({ to, subject, text, html });
  }

  async sendPartnerReminder(to: string, inviterName: string, partnerName: string, continueUrl: string) {
    const { subject, text, html } = buildPartnerReminderEmail({
      inviterName: inviterName || 'Your Partner',
      partnerName: partnerName || 'there',
      continueUrl,
    });
    return this.sendRaw({ to, subject, text, html });
  }

  async sendHandshakeReviewRequest(to: string, recipientName: string, submitterName: string, caseId: string, reviewUrl: string) {
    const { subject, text, html } = buildHandshakeReviewRequestEmail({
      recipientName: recipientName || 'there',
      submitterName: submitterName || 'Your Partner',
      caseId: caseId || 'N/A',
      reviewUrl,
    });
    return this.sendRaw({ to, subject, text, html });
  }

  async sendSubmissionPendingPartner(to: string, submitterName: string, partnerName: string, caseId: string, caseUrl: string) {
    const { subject, text, html } = buildSubmissionPendingPartnerEmail({
      submitterName: submitterName || 'there',
      partnerName: partnerName || 'Your Partner',
      caseId: caseId || 'N/A',
      caseUrl,
    });
    return this.sendRaw({ to, subject, text, html });
  }

  async sendPartnerChangesRequested(to: string, recipientName: string, partnerName: string, caseId: string, reason: string, editUrl: string) {
    const { subject, text, html } = buildPartnerChangesRequestedEmail({
      recipientName: recipientName || 'there',
      partnerName: partnerName || 'Your Partner',
      caseId: caseId || 'N/A',
      reason: reason || 'Please review and adjust your entries.',
      editUrl,
    });
    return this.sendRaw({ to, subject, text, html });
  }

  /**
   * MUTUAL EMAIL: Sent to BOTH User 1 and User 2 when Handshake review is approved!
   */
  async sendMutualSubmitCompleted(caseDoc: any, draftAgreementUrl?: string) {
    if (!caseDoc) return;
    const caseId = getDisplayCaseId(caseDoc);
    const appUrl = this.config.get('APP_SERVER_URL') || this.config.get('APP_BASE_URL') || '';
    const rawId = caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : null;
    const url = draftAgreementUrl || (rawId ? `${appUrl}/cases/${rawId}` : appUrl);

    const ownerEmail = await this.resolveEmail(caseDoc.owner);
    const invitedEmail = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);

    const ownerName = (caseDoc.owner as any)?.firstName || 'Applicant 1';
    const invitedName = (caseDoc.invitedUser as any)?.firstName || (caseDoc.partnerInviteDetails as any)?.firstName || 'Applicant 2';

    // 1. Send to Owner
    if (ownerEmail) {
      const email1 = buildMutualSubmitCompletedEmail({
        userName: ownerName,
        partnerName: invitedName,
        caseId,
        draftAgreementUrl: url,
      });
      await this.sendRaw({ to: ownerEmail, subject: email1.subject, text: email1.text, html: email1.html }).catch(() => null);
    }

    // 2. Send to Invited Partner
    if (invitedEmail) {
      const email2 = buildMutualSubmitCompletedEmail({
        userName: invitedName,
        partnerName: ownerName,
        caseId,
        draftAgreementUrl: url,
      });
      await this.sendRaw({ to: invitedEmail, subject: email2.subject, text: email2.text, html: email2.html }).catch(() => null);
    }
  }

  async sendInviteCredentials(to: string, password: string, caseId?: string) {
    const subject = 'Your Lets Prenup Account — Sign-In Details';
    const text = `You were invited to Lets Prenup.\nEmail: ${to}\nPassword: ${password}\n\nWe recommend changing your password after sign-in.${caseId ? `\n\nCase ID: ${caseId}` : ''}`;
    const html = buildEmailHtml({
      eyebrow: 'Welcome to Lets Prenup',
      heading: 'Your Account Is Ready!',
      icon: '🔐',
      body: `Here are your sign-in credentials:<br/><br/>
             <strong>Email:</strong> ${to}<br/>
             <strong>Temporary Password:</strong> ${password}<br/>
             ${caseId ? `<strong>Case ID:</strong> ${caseId}<br/>` : ''}
             <br/>Please log in and change your password as soon as possible.`,
      ctaLabel: 'Log In Now',
      ctaUrl: '#',
      footerNote: 'For security reasons, please change your password after your first login.',
    });
    return this.sendRaw({ to, subject, text, html });
  }

  async sendVerificationOtp(email: string, otp: string, opts?: { expiresAt?: Date }) {
    const expiry = opts?.expiresAt
      ? `This code expires at ${opts.expiresAt.toLocaleString()}.`
      : 'This code expires shortly.';
    const subject = 'Your Lets Prenup Verification Code';
    const text = `Your verification code: ${otp}\n${expiry}`;
    const html = buildEmailHtml({
      eyebrow: 'Email Verification',
      heading: `Your Code: ${otp}`,
      icon: '✉️',
      body: `Use the verification code above to confirm your email address.<br/><br/>${expiry}<br/><br/>If you did not request this, please ignore this email.`,
      footerNote: 'Never share this code with anyone.',
    });
    return this.sendRaw({ to: email, subject, text, html });
  }

  async sendReset(email: string, resetUrl: string, opts?: { expiryHours?: number }) {
    const hours = opts?.expiryHours;
    const validity = hours
      ? `This link is valid for ${hours} hour${hours === 1 ? '' : 's'} and can only be used once.`
      : 'This link is valid for a limited time and can only be used once.';
    const subject = 'Reset Your Lets Prenup Password';
    const text = `We received a request to reset your password.\nClick the link to proceed: ${resetUrl}\n\n${validity}\n\nIf you did not request this, please ignore this email.`;
    const html = buildEmailHtml({
      eyebrow: 'Password Reset',
      heading: 'Reset Your Password',
      icon: '🔑',
      body: `We received a request to reset the password for your Lets Prenup account.<br/><br/>Click the button below to choose a new password.<br/><br/>${validity}`,
      ctaLabel: 'Reset Password',
      ctaUrl: resetUrl,
      footerNote: 'If you did not request a password reset, you can safely ignore this email and your password will stay the same.',
    });
    return this.sendRaw({ to: email, subject, text, html });
  }

  async sendPasswordChanged(email: string) {
    const subject = 'Your Lets Prenup Password Was Changed';
    const text = `Your Lets Prenup password was just changed.\n\nIf this wasn't you, please reset your password immediately and contact support.`;
    const html = buildEmailHtml({
      eyebrow: 'Security Alert',
      heading: 'Your Password Was Changed',
      icon: '🔒',
      body: `The password for your Lets Prenup account (<strong>${email}</strong>) was just changed.<br/><br/>You can now sign in with your new password.`,
      footerNote: `If you did not make this change, please reset your password immediately and contact support.`,
    });
    return this.sendRaw({ to: email, subject, text, html });
  }

  async sendFirstPhaseCompletedForCase(caseDoc: any) {
    if (!caseDoc) return;
    const caseId = getDisplayCaseId(caseDoc);
    if (!caseId || caseId === 'N/A') return;
    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    const recipients = Array.from(new Set([owner, invited].filter((x): x is string => !!x)));
    if (recipients.length === 0) return;
    const subject = `First Phase Completed — Case ${caseId}`;
    const text = `The first phase of questionnaires has been submitted for case ${caseId}. Please proceed to the pre-lawyer questionnaire and select a lawyer.`;
    const html = buildEmailHtml({
      eyebrow: 'Phase 1 Complete',
      heading: 'Great Progress!',
      icon: '✅',
      body: `The first phase of questionnaires has been submitted for case <strong>${caseId}</strong>.<br/><br/>The next step is to complete the pre-lawyer questionnaire and choose your lawyer. Log in to continue.`,
      ctaLabel: 'Continue to Next Step',
      ctaUrl: '#',
    });
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
    const caseId = getDisplayCaseId(caseDoc);
    const recipients = overrideRecipients && overrideRecipients.length ? Array.from(new Set(overrideRecipients)) : await this.getCaseManagerEmails();
    if (!recipients || recipients.length === 0) return;
    const subject = `Case Ready for Review — ${caseId}`;
    const text = `A case requires review and assignment. Case: ${caseId}. Title: ${caseDoc?.title ?? 'N/A'}`;
    const html = buildEmailHtml({
      eyebrow: 'Action Required',
      heading: 'New Case Awaiting Review',
      icon: '📋',
      body: `A new case has been submitted and requires your review and assignment.<br/><br/>
             <strong>Case ID:</strong> ${caseId}<br/>
             <strong>Title:</strong> ${caseDoc?.title ?? 'N/A'}<br/><br/>
             Please log in to the admin dashboard to review and assign this case.`,
      ctaLabel: 'Review Case',
      ctaUrl: '#',
    });
    await Promise.all(recipients.map(r => this.sendRaw({ to: r, subject, text, html }).catch(() => null)));
  }

  async sendAgreementSubmittedForCase(caseDoc: any) {
    if (!caseDoc) return;
    const appUrl = this.config.get('APP_SERVER_URL') || this.config.get('APP_BASE_URL') || '';
    const caseId = getDisplayCaseId(caseDoc);
    const rawId = caseDoc._id ? String(caseDoc._id) : caseDoc.id ? String(caseDoc.id) : null;
    const caseLink = rawId ? `${appUrl}/cases/${rawId}` : appUrl;
    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    const cms = await this.getCaseManagerEmails();
    const userRecipients = Array.from(new Set([owner, invited].filter((x): x is string => !!x)));
    const adminRecipients = cms;

    const userSubject = `Agreement Submitted — Case ${caseId}`;
    const userText = `Hi,\n\nThank you for submitting your responses to the Lets Prenup questionnaire.\n\nA draft of your prenuptial agreement has been generated and will be shared shortly.\n\nYour case manager will contact you within 1–2 business days.\n\nRegards,\nLets Prenup`;
    const userHtml = buildEmailHtml({
      eyebrow: 'Submission Confirmed',
      heading: 'Agreement Submitted!',
      icon: '📝',
      body: `Thank you for submitting your responses to the Lets Prenup questionnaire.<br/><br/>
             A draft of your prenuptial agreement has been generated and will be shared with you shortly.<br/><br/>
             Your case manager will reach out to you within <strong>1–2 business days</strong>.`,
      footerNote: 'If you have any questions, please contact your case manager.',
    });

    const adminSubject = `Agreement Submitted — Case ${caseId}`;
    const adminText = `Case ${caseId} has been submitted and locked. View: ${caseLink}`;
    const adminHtml = buildEmailHtml({
      eyebrow: 'Case Update',
      heading: `Case ${caseId} Submitted`,
      icon: '🔒',
      body: `Case <strong>${caseId}</strong> has been submitted and is now locked for review.<br/><br/>Please log in to review the submission and proceed with the next steps.`,
      ctaLabel: 'View Case',
      ctaUrl: caseLink,
    });

    await Promise.all([
      ...userRecipients.map(r => this.sendRaw({ to: r, subject: userSubject, text: userText, html: userHtml }).catch(() => null)),
      ...adminRecipients.map(r => this.sendRaw({ to: r, subject: adminSubject, text: adminText, html: adminHtml }).catch(() => null)),
    ]);
  }

  async sendAgreementDocumentLink(caseDoc: any, link: string, overrideRecipients?: string[]) {
    if (!caseDoc) return;
    const caseId = getDisplayCaseId(caseDoc);
    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    const recipients = overrideRecipients && overrideRecipients.length ? Array.from(new Set(overrideRecipients)) : Array.from(new Set([owner, invited].filter((x): x is string => !!x)));
    if (!recipients || recipients.length === 0) return;
    const subject = `Your Draft Agreement Is Ready — Case ${caseId}`;
    const text = `Your draft nuptial agreement for case ${caseId} is ready. View the document here: ${link}`;
    const html = buildEmailHtml({
      eyebrow: 'Document Ready',
      heading: 'Your Draft Agreement Is Ready!',
      icon: '📄',
      body: `Your draft prenuptial agreement for case <strong>${caseId}</strong> has been prepared and is available for your review.<br/><br/>Click the button below to view and download your document.`,
      ctaLabel: 'View Document',
      ctaUrl: link,
      footerNote: 'Please review the document carefully and contact your case manager if you have any questions.',
    });
    await Promise.all(recipients.map(r => this.sendRaw({ to: r, subject, text, html }).catch(() => null)));
  }

  async sendCaseAssignedNotification(caseDoc: any, manager: { name?: string; email?: string; phone?: string }, overrideRecipients?: string[]) {
    if (!caseDoc) return;
    const caseId = getDisplayCaseId(caseDoc);
    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);
    const recipients = overrideRecipients && overrideRecipients.length ? Array.from(new Set(overrideRecipients)) : Array.from(new Set([owner, invited].filter((x): x is string => !!x)));
    if (!recipients || recipients.length === 0) return;
    const subject = `Your Case Manager Has Been Assigned — Case ${caseId}`;
    const text = `Your case (${caseId}) has been assigned to: ${manager.name ?? 'Case Manager'}${manager.email ? `\nEmail: ${manager.email}` : ''}${manager.phone ? `\nPhone: ${manager.phone}` : ''}`;
    const html = buildEmailHtml({
      eyebrow: 'Case Update',
      heading: 'Your Case Manager Is Assigned!',
      icon: '👤',
      body: `A case manager has been assigned to your case <strong>${caseId}</strong>.<br/><br/>
             <strong>Name:</strong> ${manager.name ?? 'Case Manager'}<br/>
             ${manager.email ? `<strong>Email:</strong> ${manager.email}<br/>` : ''}
             ${manager.phone ? `<strong>Phone:</strong> ${manager.phone}<br/>` : ''}
             <br/>Your case manager will reach out to you shortly to guide you through the next steps.`,
    });
    await Promise.all(recipients.map(r => this.sendRaw({ to: r, subject, text, html }).catch(() => null)));
  }

  async sendLawyerIntro(lawyerEmail: string, caseDoc: any, clientMessage?: string) {
    if (!lawyerEmail) return;
    const caseId = getDisplayCaseId(caseDoc);
    const subject = `New Client Introduction — Case ${caseId} via Lets Prenup`;
    const clientInfo = caseDoc?.owner?.email ? caseDoc.owner.email : (caseDoc?.invitedEmail ?? 'N/A');
    const text = `You have been selected as the lawyer for case ${caseId}.\nClient: ${clientInfo}\n\nMessage: ${clientMessage || '(no message)'}`;
    const html = buildEmailHtml({
      eyebrow: 'New Client',
      heading: 'You Have a New Client!',
      icon: '⚖️',
      body: `You have been selected as the lawyer for case <strong>${caseId}</strong>.<br/><br/>
             <strong>Client:</strong> ${clientInfo}<br/><br/>
             <strong>Client Message:</strong><br/>${clientMessage || '(No message provided)'}`,
      ctaLabel: 'View Case Details',
      ctaUrl: '#',
    });
    return this.sendRaw({ to: lawyerEmail, subject, text, html }).catch(() => null);
  }

  async sendLawyerAssignedNotification(
    caseDoc: any,
    p1Lawyer: any,
    p2Lawyer: any,
  ) {
    if (!caseDoc) return;

    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);

    // User 1
    if (owner) {
      await this.sendRaw({
        to: owner,
        subject: 'Your Lawyer Has Been Assigned — Lets Prenup',
        text: `Your lawyer has been assigned.\n\nLawyer: ${p1Lawyer.name}\nFee: ${p1Lawyer.priceText}\n\nYour lawyer will contact you shortly.`,
        html: buildEmailHtml({
          eyebrow: 'Lawyer Assigned',
          heading: 'Your Lawyer Is Ready!',
          icon: '⚖️',
          body: `We are pleased to inform you that a lawyer has been assigned to represent you.<br/><br/>
                 <strong>Lawyer:</strong> ${p1Lawyer.name}<br/>
                 <strong>Fee:</strong> ${p1Lawyer.priceText}<br/><br/>
                 Your lawyer will contact you shortly to introduce themselves and discuss the next steps.`,
        }),
      });
    }

    // User 2
    if (invited) {
      await this.sendRaw({
        to: invited,
        subject: 'Your Lawyer Has Been Assigned — Lets Prenup',
        text: `Your lawyer has been assigned.\n\nLawyer: ${p2Lawyer.name}\nFee: ${p2Lawyer.priceText}\n\nYour lawyer will contact you shortly.`,
        html: buildEmailHtml({
          eyebrow: 'Lawyer Assigned',
          heading: 'Your Lawyer Is Ready!',
          icon: '⚖️',
          body: `We are pleased to inform you that a lawyer has been assigned to represent you.<br/><br/>
                 <strong>Lawyer:</strong> ${p2Lawyer.name}<br/>
                 <strong>Fee:</strong> ${p2Lawyer.priceText}<br/><br/>
                 Your lawyer will contact you shortly to introduce themselves and discuss the next steps.`,
        }),
      });
    }
  }

  async sendCaseReturnedToDraft(
    caseDoc: any,
    reason: string,
  ) {
    if (!caseDoc) return;

    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);

    const recipients = Array.from(
      new Set([owner, invited].filter((x): x is string => !!x)),
    );

    if (!recipients.length) return;

    const subject = 'Action Required: Your Case Has Been Returned to Draft';
    const text = `Your case has been returned to draft by the Case Manager.\n\nReason:\n${reason}\n\nPlease log in, review your information, make the required amendments, and resubmit your forms.`;
    const html = buildEmailHtml({
      eyebrow: 'Action Required',
      heading: 'Case Returned to Draft',
      icon: '✏️',
      body: `Your case has been reviewed by the Case Manager and returned to draft status.<br/><br/>
             <strong>Reason:</strong><br/>${reason}<br/><br/>
             Please log in, review your information, make the required amendments, and resubmit your forms.`,
      ctaLabel: 'Review & Resubmit',
      ctaUrl: '#',
      footerNote: 'Please action this as soon as possible to avoid delays.',
    });

    await Promise.all(
      recipients.map((email) =>
        this.sendRaw({ to: email, subject, text, html }).catch(() => null),
      ),
    );
  }

  async sendCaseApproved(caseDoc: any) {
    if (!caseDoc) return;

    const owner = await this.resolveEmail(caseDoc.owner);
    const invited = await this.resolveEmail(caseDoc.invitedUser, caseDoc.invitedEmail);

    const recipients = Array.from(
      new Set([owner, invited].filter((x): x is string => !!x)),
    );

    if (!recipients.length) return;

    const subject = 'Congratulations — Your Case Has Been Approved!';
    const text = `Your case has been approved by the Case Manager.\n\nThe review process has been completed successfully.\n\nYour case will now proceed to the next stage of the legal review process.`;
    const html = buildEmailHtml({
      eyebrow: 'Case Approved',
      heading: 'Congratulations!',
      icon: '✅',
      body: `Your case has been reviewed and <strong>approved</strong> by the Case Manager.<br/><br/>
             The review process has been completed successfully.<br/><br/>
             Your case will now proceed to the next stage of the legal review process. We will keep you updated on any further steps.`,
      footerNote: 'Thank you for choosing Lets Prenup for your prenuptial agreement.',
    });

    await Promise.all(
      recipients.map((email) =>
        this.sendRaw({ to: email, subject, text, html }).catch(() => null),
      ),
    );
  }
}
