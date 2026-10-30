// src/mail/templates/partner-workflow.templates.ts
// Email template definitions for Partner Onboarding, Review Handshake, and Mutual Submit stages.
// Brand: Lets Prenup

import { buildLetsPrenupEmailHtml } from './email-builder';

export interface PartnerInviteEmailParams {
  inviterName: string;
  partnerName?: string;
  inviteUrl: string;
  personalMessage?: string;
  targetWeddingDate?: string;
  // The invited address already has an account: they sign in to accept.
  existingAccount?: boolean;
}

export interface PartnerJoinedEmailParams {
  ownerName: string;
  partnerName: string;
  dashboardUrl: string;
}

export interface PartnerReminderEmailParams {
  inviterName: string;
  partnerName: string;
  continueUrl: string;
}

export interface HandshakeReviewRequestEmailParams {
  recipientName: string;
  submitterName: string;
  caseId: string;
  reviewUrl: string;
}

export interface SubmissionPendingPartnerEmailParams {
  submitterName: string;
  partnerName: string;
  caseId: string;
  caseUrl: string;
}

export interface PartnerChangesRequestedEmailParams {
  recipientName: string;
  partnerName: string;
  caseId: string;
  reason: string;
  editUrl: string;
}

export interface MutualSubmitCompletedEmailParams {
  userName: string;
  partnerName: string;
  caseId: string;
  draftAgreementUrl: string;
}

export interface CaseManagerAlertEmailParams {
  caseId: string;
  primaryApplicant: string;
  partnerApplicant: string;
  adminPortalUrl: string;
}

/**
 * Stage 1 - Email 1: Invitation sent to Partner (User 2)
 */
export function buildPartnerInviteEmail(params: PartnerInviteEmailParams) {
  const { inviterName, inviteUrl, personalMessage, targetWeddingDate, existingAccount } = params;
  const weddingText = targetWeddingDate ? ` Anticipated Wedding Date: <strong>${targetWeddingDate}</strong>.<br/><br/>` : '';
  const personalMsgText = personalMessage
    ? `<div style="background:#FFF1F2;border-left:4px solid #E28691;padding:12px 16px;margin:16px 0;font-style:italic;color:#881337;text-align:left;">
        &ldquo;${personalMessage}&rdquo;
       </div>`
    : '';

  const subject = `You have been invited to Lets Prenup by ${inviterName}`;
  const existingAccountText = existingAccount
    ? `You already have a Lets Prenup account with this email address, so there is nothing new to register. Sign in and accept the invitation to join them.<br/><br/>`
    : '';
  const text = existingAccount
    ? `Hi,\n\n${inviterName} has invited you to collaborate on your prenuptial agreement on Lets Prenup.\n\nYou already have an account with this email address. Sign in and accept the invitation here: ${inviteUrl}\n\nLets Prenup`
    : `Hi,\n\n${inviterName} has invited you to collaborate on your prenuptial agreement on Lets Prenup.\n\nAccept your invitation and get started here: ${inviteUrl}\n\nLets Prenup`;
  const html = buildLetsPrenupEmailHtml({
    eyebrow: 'Partner Invitation',
    heading: 'Join Lets Prenup Together',
    icon: '💍',
    body: `<strong>${inviterName}</strong> has invited you to collaborate on preparing your prenuptial agreement on Lets Prenup.<br/><br/>
           ${existingAccountText}
           ${weddingText}
           ${personalMsgText}
           Lets Prenup provides a guided, secure, and collaborative process for you both to share your details and agree on terms transparently.`,
    ctaLabel: existingAccount ? 'Sign In & Accept Invitation' : 'Accept Invitation & Start',
    ctaUrl: inviteUrl,
    footerNote: 'If you were not expecting this invitation, you can safely ignore this email.',
  });

  return { subject, text, html };
}

/**
 * Stage 1 - Email 2: Confirmation sent to Primary User (User 1) when Partner joins
 */
export function buildPartnerJoinedEmail(params: PartnerJoinedEmailParams) {
  const { ownerName, partnerName, dashboardUrl } = params;

  const subject = `Great news! ${partnerName} has joined your Lets Prenup case`;
  const text = `Hi ${ownerName},\n\nYour partner, ${partnerName}, has accepted your invitation and created their account on Lets Prenup.\n\nYou can now log in to your dashboard to complete your respective questionnaire forms.\n\nDashboard: ${dashboardUrl}\n\nLets Prenup`;
  const html = buildLetsPrenupEmailHtml({
    eyebrow: 'Partner Joined',
    heading: `${partnerName} Is Now Onboard!`,
    icon: '🎉',
    body: `Hello ${ownerName},<br/><br/>
           Great news! Your partner, <strong>${partnerName}</strong>, has successfully accepted your invitation and created their account on Lets Prenup.<br/><br/>
           Both of you can now access your individual questionnaire sections and begin entering your financial and personal details.`,
    highlightBox: {
      title: 'Next Step: Complete Your Questionnaire',
      content: 'Fill out your respective sections. Once both of you complete the forms, you will be able to review each other’s entries together before final submission.',
      type: 'info',
    },
    ctaLabel: 'Go To Dashboard',
    ctaUrl: dashboardUrl,
  });

  return { subject, text, html };
}

/**
 * Stage 2 - Email 3: Friendly reminder sent to Partner to complete forms
 */
export function buildPartnerReminderEmail(params: PartnerReminderEmailParams) {
  const { inviterName, partnerName, continueUrl } = params;

  const subject = `Reminder: Continue your questionnaire on Lets Prenup`;
  const text = `Hi ${partnerName},\n\nThis is a friendly reminder that ${inviterName} is waiting for you to complete your questionnaire on Lets Prenup.\n\nContinue here: ${continueUrl}\n\nLets Prenup`;
  const html = buildLetsPrenupEmailHtml({
    eyebrow: 'Gentle Reminder',
    heading: 'Your Questionnaire Is Waiting',
    icon: '⏳',
    body: `Hello ${partnerName},<br/><br/>
           Just a friendly reminder that <strong>${inviterName}</strong> is waiting for you to complete your questionnaire sections on Lets Prenup.<br/><br/>
           Completing your responses will allow both of you to review your joint information and move forward with creating your prenuptial agreement draft.`,
    ctaLabel: 'Continue Questionnaire',
    ctaUrl: continueUrl,
    footerNote: 'Need assistance? You can save your progress and return at any time.',
  });

  return { subject, text, html };
}

/**
 * Stage 3 - Email 4: Handshake Review Request (Sent to Partner when Submitter clicks Submit for Review)
 */
export function buildHandshakeReviewRequestEmail(params: HandshakeReviewRequestEmailParams) {
  const { recipientName, submitterName, caseId, reviewUrl } = params;

  const subject = `Action Required: Review & Approve Agreement Forms — Case #${caseId}`;
  const text = `Hi ${recipientName},\n\n${submitterName} has completed their questionnaire sections and submitted them for your review for Case #${caseId}.\n\nPlease log in to review all entries and approve to generate your draft agreement.\n\nReview link: ${reviewUrl}\n\nLets Prenup`;
  const html = buildLetsPrenupEmailHtml({
    eyebrow: 'Action Required',
    heading: 'Forms Ready for Your Review',
    icon: '🤝',
    body: `Hello ${recipientName},<br/><br/>
           <strong>${submitterName}</strong> has finalized and submitted their questionnaire details for <strong>Case #${caseId}</strong>.<br/><br/>
           This is the **Handshake Review stage**: Please log in to review both individual and joint responses. If everything looks accurate, give your approval to finalize and lock the forms.`,
    detailsList: [
      { label: 'Case Number', value: caseId },
      { label: 'Submitted By', value: submitterName },
      { label: 'Current Status', value: 'Pending Your Review & Approval' },
    ],
    highlightBox: {
      title: 'How It Works',
      content: 'Carefully check the asset, income, and debt disclosures. If adjustments are needed, you can request changes. Once approved by you, the answers will be locked and your draft agreement will be generated.',
      type: 'info',
    },
    ctaLabel: 'Review & Approve Forms',
    ctaUrl: reviewUrl,
  });

  return { subject, text, html };
}

/**
 * Stage 3 - Email 5: Confirmation sent to the Submitter that their forms are with the partner
 */
export function buildSubmissionPendingPartnerEmail(params: SubmissionPendingPartnerEmailParams) {
  const { submitterName, partnerName, caseId, caseUrl } = params;

  const subject = `Forms Submitted for Partner Review — Case #${caseId}`;
  const text = `Hi ${submitterName},\n\nYour questionnaire has been submitted for ${partnerName}'s review for Case #${caseId}.\n\nOnce ${partnerName} approves, your agreement draft will be created.\n\nView case: ${caseUrl}\n\nLets Prenup`;
  const html = buildLetsPrenupEmailHtml({
    eyebrow: 'Under Review',
    heading: 'Forms Submitted Successfully!',
    icon: '📬',
    body: `Hello ${submitterName},<br/><br/>
           Thank you for finalizing your responses for <strong>Case #${caseId}</strong>.<br/><br/>
           We have notified <strong>${partnerName}</strong> that your forms are ready for review. Once they review and confirm the details, the mutual handshake will be complete and your agreement draft will be prepared.`,
    detailsList: [
      { label: 'Case Number', value: caseId },
      { label: 'Awaiting Review From', value: partnerName },
    ],
    ctaLabel: 'View Case Status',
    ctaUrl: caseUrl,
  });

  return { subject, text, html };
}

/**
 * Stage 3 - Email 6: Sent when Reviewing Partner requests changes (Disapproves)
 */
export function buildPartnerChangesRequestedEmail(params: PartnerChangesRequestedEmailParams) {
  const { recipientName, partnerName, caseId, reason, editUrl } = params;

  const subject = `Updates Requested on Your Questionnaire — Case #${caseId}`;
  const text = `Hi ${recipientName},\n\n${partnerName} reviewed the questionnaire for Case #${caseId} and requested adjustments.\n\nFeedback: ${reason}\n\nPlease update and resubmit: ${editUrl}\n\nLets Prenup`;
  const html = buildLetsPrenupEmailHtml({
    eyebrow: 'Changes Requested',
    heading: 'Adjustments Requested by Partner',
    icon: '📝',
    body: `Hello ${recipientName},<br/><br/>
           Your partner, <strong>${partnerName}</strong>, has reviewed the questionnaire for <strong>Case #${caseId}</strong> and requested some adjustments before final approval.`,
    highlightBox: {
      title: 'Partner Feedback',
      content: `&ldquo;${reason || 'Please review and make adjustments to the disclosed details.'}&rdquo;`,
      type: 'warning',
    },
    ctaLabel: 'Review & Update Forms',
    ctaUrl: editUrl,
    footerNote: 'Once you update the necessary fields, you can resubmit them for your partner’s approval.',
  });

  return { subject, text, html };
}

/**
 * Stage 4 - Email 7: MUTUAL EMAIL sent to BOTH User 1 and User 2 when Handshake completes!
 */
export function buildMutualSubmitCompletedEmail(params: MutualSubmitCompletedEmailParams) {
  const { userName, partnerName, caseId, draftAgreementUrl } = params;

  const subject = `Mutual Approval Complete — Draft Agreement Generated! Case #${caseId}`;
  const text = `Hi ${userName},\n\nCongratulations! Both you and ${partnerName} have reviewed and approved your questionnaires for Case #${caseId}.\n\nYour draft prenuptial agreement has been generated and locked.\n\nA Case Manager will be assigned to your case shortly (within 1–2 business days) to guide you through the next legal steps.\n\nView Agreement: ${draftAgreementUrl}\n\nLets Prenup`;
  const html = buildLetsPrenupEmailHtml({
    eyebrow: 'Handshake Complete',
    heading: 'Congratulations! Handshake Completed',
    icon: '✨',
    body: `Hello ${userName},<br/><br/>
           Both you and <strong>${partnerName}</strong> have officially reviewed and approved your respective questionnaire responses for <strong>Case #${caseId}</strong>.<br/><br/>
           Your information has now been frozen, and your initial <strong>draft prenuptial agreement</strong> has been generated successfully.`,
    highlightBox: {
      title: 'What Happens Next?',
      content: 'A dedicated <strong>Case Manager</strong> is being assigned to your case right now. They will review your submitted agreement and reach out to both of you within <strong>1–2 business days</strong> to guide you through legal review and lawyer allocation.',
      type: 'success',
    },
    detailsList: [
      { label: 'Case Number', value: caseId },
      { label: 'Partners', value: `${userName} & ${partnerName}` },
      { label: 'Stage', value: 'Case Manager Review & Assignment' },
    ],
    ctaLabel: 'View Draft Agreement',
    ctaUrl: draftAgreementUrl,
    footerNote: 'Thank you for choosing Lets Prenup for your prenuptial agreement.',
  });

  return { subject, text, html };
}

/**
 * Stage 4 - Email 8: Notification sent to Case Managers / Admin
 */
export function buildCaseManagerAlertEmail(params: CaseManagerAlertEmailParams) {
  const { caseId, primaryApplicant, partnerApplicant, adminPortalUrl } = params;

  const subject = `New Case Ready for Assignment — Case #${caseId}`;
  const text = `Case #${caseId} has been mutually approved by ${primaryApplicant} and ${partnerApplicant} and is ready for Case Manager review.\n\nPortal: ${adminPortalUrl}\n\nLets Prenup`;
  const html = buildLetsPrenupEmailHtml({
    eyebrow: 'New Case Awaiting Assignment',
    heading: `Case #${caseId} Ready for Review`,
    icon: '📋',
    body: `A couple has successfully completed their mutual review (Handshake) and submitted their case.<br/><br/>
           Please assign a Case Manager to review the questionnaire responses and coordinate the next phase.`,
    detailsList: [
      { label: 'Case ID', value: caseId },
      { label: 'Primary Applicant', value: primaryApplicant },
      { label: 'Partner Applicant', value: partnerApplicant },
    ],
    ctaLabel: 'Review & Assign Case',
    ctaUrl: adminPortalUrl,
  });

  return { subject, text, html };
}
