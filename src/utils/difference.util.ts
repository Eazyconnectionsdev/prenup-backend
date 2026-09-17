import * as mammoth from 'mammoth';
import { diffArrays, diffWordsWithSpace } from 'diff';

export interface DiffWordPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface DiffParagraph {
  status: 'unchanged' | 'added' | 'removed' | 'modified';
  original?: string;
  updated?: string;
  words?: DiffWordPart[];
}

export async function extractParagraphs(buffer: Buffer): Promise<string[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const matches = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)];
  return matches.map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
}

export function diffParagraphs(
  paragraphsA: string[],
  paragraphsB: string[],
): DiffParagraph[] {
  const paragraphDiff = diffArrays(paragraphsA, paragraphsB);
  const result: DiffParagraph[] = [];

  for (let i = 0; i < paragraphDiff.length; i++) {
    const part = paragraphDiff[i];

    if (!part.added && !part.removed) {
      part.value.forEach((p) => result.push({ status: 'unchanged', original: p }));
      continue;
    }

    if (part.removed && paragraphDiff[i + 1]?.added) {
      const removedParas = part.value;
      const addedParas = paragraphDiff[i + 1].value;
      const len = Math.max(removedParas.length, addedParas.length);

      for (let j = 0; j < len; j++) {
        const oldP = removedParas[j];
        const newP = addedParas[j];
        if (oldP && newP) {
          result.push({
            status: 'modified',
            original: oldP,
            updated: newP,
            words: diffWordsWithSpace(oldP, newP),
          });
        } else if (oldP) {
          result.push({ status: 'removed', original: oldP });
        } else if (newP) {
          result.push({ status: 'added', updated: newP });
        }
      }
      i++;
      continue;
    }

    if (part.added) {
      part.value.forEach((p) => result.push({ status: 'added', updated: p }));
    } else if (part.removed) {
      part.value.forEach((p) => result.push({ status: 'removed', original: p }));
    }
  }

  return result;
}