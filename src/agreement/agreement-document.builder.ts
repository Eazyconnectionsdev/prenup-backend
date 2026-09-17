import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import JSZip from 'jszip';


export interface AgreementDocumentData {
  caseId: string;
  myInformation?: Record<string, any>;
  partnerInformation?: Record<string, any>;
  jointInformation?: Record<string, any>;
}

export const THEME = {
  headingFont: 'Cambria',
  bodyFont: 'Calibri',
  navy: '1F3864',
  slate: '2E5395',
  text: '2D2D2D',
  titleSize: 44,
  heading1Size: 32,
  heading2Size: 26,
  bodySize: 22,
};


export async function buildAgreementDocxBuffer(
  data: AgreementDocumentData,
): Promise<Buffer> {
  const sections: Paragraph[] = [];

  sections.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun('Prenuptial Agreement — Financial Disclosure Summary'),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `Case ID: ${data.caseId}`, color: '666666', size: 18 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Generated: ${new Date().toLocaleString('en-GB')}`,
          color: '666666',
          size: 18,
        }),
      ],
      spacing: { after: 300 },
    }),
  );

  sections.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Party 1 (Owner) Information')] }),
  );
  addFieldGroupsToDoc(sections, [
    ['Personal Information', data.myInformation?.personalInformation],
    ['Legal Declaration', data.myInformation?.legalDeclaration],
    ['Family & Dependents', data.myInformation?.familyAndDependents],
    ['Individual Assets', data.myInformation?.individualAssets],
    ['Income & Revenue', data.myInformation?.incomeAndRevenue],
    ['Liabilities & Debts', data.myInformation?.liabilitiesAndDebts],
  ]);

  sections.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Party 2 (Partner) Information')] }),
  );
  addFieldGroupsToDoc(sections, [
    ['Personal Information', data.partnerInformation?.personalInformation],
    ['Legal Declaration', data.partnerInformation?.legalDeclaration],
    ['Family & Dependents', data.partnerInformation?.familyAndDependents],
    ['Individual Assets', data.partnerInformation?.individualAssets],
    ['Income & Revenue', data.partnerInformation?.incomeAndRevenue],
    ['Liabilities & Debts', data.partnerInformation?.liabilitiesAndDebts],
  ]);

  sections.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Joint Information')] }),
  );
  addFieldGroupsToDoc(sections, [
    ['Joint Assets', data.jointInformation?.jointAssets],
    ['Joint Income & Revenue', data.jointInformation?.jointIncomeAndRevenue],
    ['Joint Liabilities & Debts', data.jointInformation?.jointLiabilitiesAndDebts],
  ]);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: THEME.bodyFont, size: THEME.bodySize, color: THEME.text },
          paragraph: { spacing: { line: 276 } }, // ~1.15 line spacing
        },
      },
      paragraphStyles: [
        {
          id: 'Title',
          name: 'Title',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: THEME.headingFont, size: THEME.titleSize, bold: true, color: THEME.navy },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 120 } },
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: THEME.headingFont, size: THEME.heading1Size, bold: true, color: THEME.navy },
          paragraph: {
            spacing: { before: 360, after: 200 },
            border: {
              bottom: { color: THEME.navy, space: 4, style: BorderStyle.SINGLE, size: 8 },
            },
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: THEME.headingFont, size: THEME.heading2Size, bold: true, color: THEME.slate },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      ],
    },
    sections: [{ children: sections }],
  });

  const rawBuffer = await Packer.toBuffer(doc);
  return enableTrackChangesByDefault(rawBuffer);
}


function addFieldGroupsToDoc(
  sections: Paragraph[],
  groups: [string, Record<string, any> | undefined][],
): void {
  for (const [groupLabel, data] of groups) {
    sections.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(groupLabel)] }),
    );

    if (!data || Object.keys(data).length === 0) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: 'No data provided.', italics: true, color: '888888' })],
          spacing: { after: 160 },
        }),
      );
      continue;
    }

    for (const [key, value] of Object.entries(data)) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${formatFieldLabel(key)}: `, bold: true, color: THEME.navy }),
            new TextRun({ text: formatFieldValue(value) }),
          ],
          spacing: { after: 80 },
        }),
      );
    }

    sections.push(new Paragraph({ text: '', spacing: { after: 120 } }));
  }
}

function formatFieldLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'N/A';
  if (value instanceof Date) return value.toLocaleDateString('en-GB');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function enableTrackChangesByDefault(docxBuffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const settingsPath = 'word/settings.xml';
  const settingsFile = zip.file(settingsPath);

  if (!settingsFile) {
    throw new Error(
      `Expected ${settingsPath} in the generated docx but it was missing — ` +
        'cannot enable track-changes-by-default. (This part is normally ' +
        'always emitted by the docx package; if you hit this, something ' +
        'upstream changed.)',
    );
  }

  let xml = await settingsFile.async('string');

  if (!xml.includes('<w:trackRevisions')) {
    xml = xml.replace(/(<w:settings[^>]*>)/, `$1<w:trackRevisions/>`);
  }

  zip.file(settingsPath, xml);

  return zip.generateAsync({ type: 'nodebuffer' });
}