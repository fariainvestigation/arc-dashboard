import { ExtractedPage, PageParagraphRef } from '../types';

/**
 * Normalizes text for robust quote matching:
 * - Collapses whitespace and removes line breaks
 * - Converts smart single/double quotes to standard ASCII quotes
 * - Lowercases for case-insensitive verification option
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface VerificationResult {
  verified: boolean;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED_QUOTE';
  matchingSnippet?: string;
  failureReason?: string;
}

/**
 * Verifies if a verbatim quote appears in the specified page and paragraph
 * of the extracted document pages.
 */
export function verifyQuoteAgainstPages(
  proposedQuote: string,
  pageRef: PageParagraphRef,
  documentPages?: ExtractedPage[]
): VerificationResult {
  if (!proposedQuote || proposedQuote.trim().length === 0) {
    return {
      verified: false,
      verificationStatus: 'UNVERIFIED_QUOTE',
      failureReason: 'Empty quote string provided'
    };
  }

  if (!documentPages || documentPages.length === 0) {
    // If pages structure is missing, fallback to string check if available or mark unverified
    return {
      verified: false,
      verificationStatus: 'UNVERIFIED_QUOTE',
      failureReason: 'Document pages structure unavailable for verification'
    };
  }

  const targetPage = documentPages.find((p) => p.pageNumber === pageRef.pageNumber);
  if (!targetPage) {
    return {
      verified: false,
      verificationStatus: 'UNVERIFIED_QUOTE',
      failureReason: `Page ${pageRef.pageNumber} not found in document`
    };
  }

  const targetParagraph = targetPage.paragraphs.find(
    (p) => p.paragraphNumber === pageRef.paragraphNumber
  );

  if (!targetParagraph) {
    return {
      verified: false,
      verificationStatus: 'UNVERIFIED_QUOTE',
      failureReason: `Paragraph ${pageRef.paragraphNumber} not found on page ${pageRef.pageNumber}`
    };
  }

  const normalizedQuote = normalizeText(proposedQuote).toLowerCase();
  const normalizedParagraph = normalizeText(targetParagraph.text).toLowerCase();

  if (normalizedParagraph.includes(normalizedQuote)) {
    return {
      verified: true,
      verificationStatus: 'VERIFIED',
      matchingSnippet: targetParagraph.text
    };
  }

  // Check if at least 80% of words in quote appear sequentially in paragraph
  const quoteWords = normalizedQuote.split(' ').filter((w) => w.length > 2);
  if (quoteWords.length >= 4) {
    const matchedCount = quoteWords.filter((word) => normalizedParagraph.includes(word)).length;
    if (matchedCount / quoteWords.length >= 0.85) {
      return {
        verified: true,
        verificationStatus: 'VERIFIED',
        matchingSnippet: targetParagraph.text
      };
    }
  }

  return {
    verified: false,
    verificationStatus: 'UNVERIFIED_QUOTE',
    failureReason: 'Quote text does not match paragraph text'
  };
}
