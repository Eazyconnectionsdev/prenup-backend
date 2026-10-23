// src/mail/templates/email-builder.ts
// Modern, responsive email layout template for Lets Prenup

export interface EmailLayoutOptions {
  eyebrow?: string;       // small uppercase label above the heading
  heading: string;        // large bold heading
  icon?: string;          // emoji displayed below the heading
  highlightBox?: {        // optional stylized info callout
    title?: string;
    content: string;
    type?: 'info' | 'success' | 'warning' | 'alert';
  };
  body: string;           // main body copy (may contain safe HTML like <strong>)
  detailsList?: Array<{   // key-value pair list (e.g. Case ID, Submitter, Date)
    label: string;
    value: string;
  }>;
  ctaLabel?: string;      // button text
  ctaUrl?: string;        // button href
  footerNote?: string;    // optional footnote / security advice
}

export function buildLetsPrenupEmailHtml(opts: EmailLayoutOptions): string {
  const {
    eyebrow,
    heading,
    icon,
    highlightBox,
    body,
    detailsList,
    ctaLabel,
    ctaUrl,
    footerNote,
  } = opts;

  // Lets Prenup Brand Palette
  const BRAND_ROSE = '#E28691';
  const BRAND_DARK = '#0F172A';
  const TEXT_PRIMARY = '#1E293B';
  const TEXT_MUTED = '#64748B';
  const BG_PAGE = '#F8FAFC';
  const CARD_BORDER = '#F1E5E7';

  // 1. Eyebrow badge
  const eyebrowHtml = eyebrow
    ? `<table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px;">
        <tr>
          <td style="background:#FFF1F2;border:1px solid #FFE4E6;border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND_ROSE};">
            ${eyebrow}
          </td>
        </tr>
       </table>`
    : '';

  // 2. Icon display
  const iconHtml = icon
    ? `<div style="margin:16px 0 12px;font-size:42px;line-height:1;">${icon}</div>`
    : '';

  // 3. Highlight callout box (e.g. Next Steps, Warning, Feedback)
  let highlightHtml = '';
  if (highlightBox) {
    const boxStyles = {
      info: { bg: '#F0F9FF', border: '#BAE6FD', text: '#0369A1', title: '#0C4A6E' },
      success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', title: '#14532D' },
      warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', title: '#78350F' },
      alert: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', title: '#7F1D1D' },
    };
    const s = boxStyles[highlightBox.type || 'info'];
    highlightHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${s.bg};border:1px solid ${s.border};border-left:4px solid ${s.text};border-radius:6px;">
        <tr>
          <td style="padding:14px 18px;text-align:left;">
            ${highlightBox.title ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${s.title};">${highlightBox.title}</p>` : ''}
            <p style="margin:0;font-size:13px;line-height:1.6;color:${s.text};">${highlightBox.content}</p>
          </td>
        </tr>
      </table>
    `;
  }

  // 4. Details key-value list (e.g. Case Number, Date, Partner Name)
  let detailsHtml = '';
  if (detailsList && detailsList.length > 0) {
    const rows = detailsList
      .map(
        (item) => `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:${TEXT_MUTED};border-bottom:1px solid #F1F5F9;font-weight:600;">${item.label}</td>
          <td style="padding:8px 12px;font-size:13px;color:${TEXT_PRIMARY};border-bottom:1px solid #F1F5F9;text-align:right;font-weight:700;">${item.value}</td>
        </tr>
      `,
      )
      .join('');

    detailsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
        ${rows}
      </table>
    `;
  }

  // 5. CTA Button
  const ctaHtml =
    ctaLabel && ctaUrl
      ? `<table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0;">
          <tr>
            <td align="center" style="border-radius:8px;background:${BRAND_ROSE};">
              <a href="${ctaUrl}" target="_blank"
                 style="display:inline-block;padding:14px 36px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;border-radius:8px;">
                ${ctaLabel} &rarr;
              </a>
            </td>
          </tr>
        </table>`
      : '';

  // 6. Footer Note
  const footerNoteHtml = footerNote
    ? `<p style="margin:22px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.5;">${footerNote}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${heading}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BG_PAGE};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG_PAGE};padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Logo / Brand Header with Company Logo -->
        <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;">
          <tr>
            <td align="center" valign="middle" style="padding-right:12px;">
              <img src="cid:company-logo@letsprenup" width="44" height="44" alt="Lets Prenup Logo"
                   style="display:block;width:44px;height:44px;max-width:44px;border:0;outline:none;" />
            </td>
            <td align="center" valign="middle">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;letter-spacing:0.5px;color:${BRAND_DARK};line-height:1;">
                Lets <span style="color:${BRAND_ROSE};">Prenup</span>
              </span>
            </td>
          </tr>
        </table>

        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:580px;background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:14px;padding:44px 38px;text-align:center;box-shadow:0 8px 30px rgba(15,23,42,0.06);">
          <tr>
            <td>
              ${eyebrowHtml}
              ${iconHtml}
              <h1 style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:${BRAND_DARK};line-height:1.3;">
                ${heading}
              </h1>
              <div style="font-size:14px;color:${TEXT_PRIMARY};line-height:1.75;text-align:center;">
                ${body}
              </div>
              ${detailsHtml}
              ${highlightHtml}
              ${ctaHtml}
              ${footerNoteHtml}
            </td>
          </tr>
        </table>

        <!-- Brand Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;margin-top:24px;">
          <tr>
            <td align="center" style="font-size:12px;color:${TEXT_MUTED};line-height:1.6;padding-bottom:20px;">
              <p style="margin:0 0 6px;">&copy; ${new Date().getFullYear()} <strong>Lets Prenup</strong>. All rights reserved.</p>
              <p style="margin:0;font-size:11px;color:#94A3B8;">
                This is an automated notification regarding your prenuptial agreement on Lets Prenup.<br/>
                If you have questions, please reach out to our team at support@letsprenup.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
