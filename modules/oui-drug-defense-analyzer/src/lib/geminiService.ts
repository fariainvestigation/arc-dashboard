import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { MASSACHUSETTS_AUTHORITIES } from '../data/maAuthorities';
import { CaseAnalysisResult, CaseData, CaseDocument, ProceduralError, SubstanceInventoryItem } from '../types';
import { verifyQuoteAgainstPages } from './citationGuard';
import { normalizeSubstanceInventoryItems } from './substanceInventoryEngine';

/**
 * All model traffic goes through the ARC AI gateway Worker, which holds the
 * Google key as a Cloudflare Worker secret and applies Access, role checks, a
 * model allowlist, and provider logging. No key is bundled into this app.
 *
 * The SDK keeps its own request shapes; only the base URL changes. The apiKey
 * argument is required by the SDK constructor but is never used, because the
 * gateway injects the real credential server-side.
 */
const ARC_AI_GATEWAY_BASE =
  ((import.meta as any).env?.VITE_ARC_AI_GATEWAY as string) || '/ai/google';

const createGenAIClient = (): GoogleGenAI => {
  return new GoogleGenAI({
    apiKey: 'routed-through-arc-gateway',
    httpOptions: {
      baseUrl: ARC_AI_GATEWAY_BASE,
      headers: { 'x-arc-client': 'oui-drug-analyzer' },
    },
  });
};

/**
 * System Instruction ensuring legal authority fidelity and strict case-related evidence tracing
 */
const MA_LEGAL_SYSTEM_INSTRUCTION = `
You are an expert Massachusetts criminal defense analyst assisting licensed defense counsel in OUI and Drug defense cases.

CRITICAL MANDATES FOR CASE ANALYSIS:
1. CASE-SPECIFIC EVIDENCE TRACING: Every procedural error detection, timeline entry, and defense pillar MUST be directly derived from and explicitly cite the provided 'currentCase' evidence documents. Generic or templated statements are STRICTLY PROHIBITED.
2. MANDATORY DOCUMENT IDs & TIMESTAMPS: For EVERY procedural error or finding identified, you MUST explicitly provide:
   - The specific document ID (e.g. "doc_123") and Document Name (e.g. "Boston Police Offense Report", "Notice of Suspension", "Statutory Rights and Consent Form").
   - Exact timestamps mentioned in the evidence (e.g. "22:08", "23:07:03", "23:17:43", "23:30") or document header date/times.
   - The exact page number and paragraph number.
   - An exact verbatim quote from the discovery text.
3. DETAILED FINDINGS & CONTRADICTIONS: Look specifically for:
   - Time contradictions (e.g., booking time vs. breath sequence time vs. consent form time).
   - Refusal vs. completed test discrepancies (e.g. narrative stating 0.214% BAC while machine output or forms state REFUSAL or No Breathalyzer Used).
   - Missing 15-minute observation window documentation or interrupted observation.
   - Instrument calibration, dry gas lot, or dual-channel (IR vs EC) divergence anomalies.
   - Form version mismatches (e.g., superseded consent forms lacking mandatory witness signatures).
4. MOTION ISSUE SPOTTING ONLY: In the 'evidentiaryExclusionStrategy' field, identify the potential suppression, exclusion, discovery, or impeachment issue for attorney review. Do NOT draft filing-ready motion language. Do NOT state that a violation occurred as a legal conclusion. State the factual basis, the potential defense significance, and which authority in the supplied table may warrant CourtListener verification. Final motion drafting occurs only in ARC Motion & Legal after verified authorities are selected.
5. LEGAL AUTHORITIES FIDELITY: You MAY ONLY cite legal authorities from the following supplied Massachusetts Authorities Table:

${JSON.stringify(MASSACHUSETTS_AUTHORITIES, null, 2)}

5. RULES FOR CITATION:
   - If no authority in the supplied table directly supports a proposition or finding, state so explicitly and cite nothing.
   - NEVER generate, invent, or hallucinate a case name, reporter volume, page number, statute number, or decision year that is not present in the table above.
   - Output must strictly conform to the requested JSON schema.
   - Do not use em dashes anywhere in your response.
`;

/**
 * Schema for Case Analysis Result
 */
const caseAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    caseSummary: {
      type: Type.STRING,
      description: 'Case-specific executive summary referencing client name, docket number, and concrete evidence findings.'
    },
    clientBackground: {
      type: Type.STRING,
      description: 'Case-specific client background and arrest context derived strictly from discovery.'
    },
    proceduralErrors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: {
            type: Type.STRING,
            description: 'One of: Observation Window, Exit Order, SFST Administration, Cannabis Impairment, Refusal Characterization, Draeger Calibration, Chain of Custody, Statutory Rights, Timeline Contradiction, Other'
          },
          severity: {
            type: Type.STRING,
            description: 'CRITICAL, HIGH, MEDIUM, or LOW'
          },
          title: { type: Type.STRING },
          description: { type: Type.STRING, description: 'Detailed case-related explanation referencing specific document ID and timestamps.' },
          verbatimQuote: { type: Type.STRING, description: 'Exact quote from the discovery text' },
          pageParagraphRef: {
            type: Type.OBJECT,
            properties: {
              pageNumber: { type: Type.INTEGER, description: '1-indexed page number in the discovery document' },
              paragraphNumber: { type: Type.INTEGER, description: '1-indexed paragraph number on that page' },
              documentId: { type: Type.STRING, description: 'Exact document ID from the case documents (e.g., doc_1)' },
              documentName: { type: Type.STRING, description: 'Full title or exhibit name of the document' },
              timestamp: { type: Type.STRING, description: 'Specific timestamp quoted from discovery (e.g. 23:17:43)' }
            },
            required: ['pageNumber', 'paragraphNumber', 'documentId']
          },
          standardViolated: { type: Type.STRING, description: 'Specific authority from the MA table violated' },
          evidentiaryExclusionStrategy: { type: Type.STRING, description: 'Potential defense issue and factual basis for attorney review; not filing-ready motion language' }
        },
        required: [
          'id',
          'category',
          'severity',
          'title',
          'description',
          'verbatimQuote',
          'pageParagraphRef',
          'standardViolated',
          'evidentiaryExclusionStrategy'
        ]
      }
    },
    timelineEvents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING, description: 'Exact timestamp or chronological order (e.g. 22:08 or 23:17)' },
          event: { type: Type.STRING, description: 'Case event description with document reference' },
          documentRef: { type: Type.STRING, description: 'Document name or Document ID' }
        },
        required: ['time', 'event', 'documentRef']
      }
    },
    defensePillars: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pillar: { type: Type.STRING },
          score: { type: Type.NUMBER },
          rationale: { type: Type.STRING, description: 'Case-specific rationale citing evidence documents' }
        },
        required: ['pillar', 'score', 'rationale']
      }
    },
    estimatedBACAtOperation: {
      type: Type.OBJECT,
      properties: {
        min: { type: Type.NUMBER },
        max: { type: Type.NUMBER },
        calculationNotes: { type: Type.STRING, description: 'Case-specific BAC calculation notes citing evidence' }
      },
      required: ['min', 'max', 'calculationNotes']
    }
  },
  required: ['caseSummary', 'clientBackground', 'proceduralErrors', 'timelineEvents', 'defensePillars', 'estimatedBACAtOperation']
};

const proceduralErrorSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    violationsFound: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description: 'e.g., 15-Minute Observation, Breathalyzer Calibration, Mirandizing'
          },
          severity: {
            type: Type.STRING,
            enum: ['HIGH', 'MEDIUM', 'LOW']
          },
          citation: {
            type: Type.STRING,
            description: 'Relevant Massachusetts statute, regulation, or case law, e.g. 501 CMR 2.00'
          },
          description: { type: Type.STRING },
          defenseImpact: { type: Type.STRING }
        },
        required: ['category', 'severity', 'citation', 'description', 'defenseImpact']
      }
    }
  },
  required: ['violationsFound']
};

export interface ProceduralViolationSummary {
  category: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  citation: string;
  description: string;
  defenseImpact: string;
}

export interface ProceduralViolationAnalysis {
  violationsFound: ProceduralViolationSummary[];
}

/**
 * Layer B Model Analysis: Analyzes case documents using gemini-3.6-flash
 */
export async function analyzeCaseDocumentsWithAI(
  documents: CaseDocument[],
  caseContext?: Partial<CaseData>
): Promise<Partial<CaseAnalysisResult>> {
  const ai = createGenAIClient();

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  const contextHeader = caseContext
    ? `=== CURRENT CASE PROFILE ===
Client Name: ${caseContext.clientName || 'Unknown Client'}
Docket Number: ${caseContext.caseNumber || 'Unassigned'}
Court Venue: ${caseContext.court || 'District Court'}
Primary Charge: ${caseContext.charge || 'OUI-Liquor'}
Incident Date: ${caseContext.incidentDate || 'Unknown Date'}
Arresting Agency: ${caseContext.arrestingAgency || 'Police Department'}
Total Discovery Documents: ${documents.length}\n\n`
    : '';

  let docIndexText = `=== DISCOVERY EVIDENCE DOCUMENTS ===\n`;
  for (const doc of documents) {
    docIndexText += `\nDOCUMENT ID: "${doc.id}" | TITLE: "${doc.name}" | TYPE: ${doc.type}\n`;
    if (doc.pages && doc.pages.length > 0) {
      docIndexText += doc.pages
        .map(
          (p) =>
            `[DOCUMENT ID: ${doc.id} | Title: ${doc.name} | Page ${p.pageNumber}]\n` +
            p.paragraphs.map((pr) => `[¶${pr.paragraphNumber}] ${pr.text}`).join('\n')
        )
        .join('\n\n');
    } else if (doc.parsedText) {
      docIndexText += `[DOCUMENT ID: ${doc.id} | Title: ${doc.name} | Full Text]:\n${doc.parsedText}\n`;
    } else {
      docIndexText += `[DOCUMENT ID: ${doc.id} | Title: ${doc.name}]: No extracted text available.\n`;
    }
  }

  parts.push({
    text: `${contextHeader}${docIndexText}

INSTRUCTIONS FOR DISCOVERY ANALYSIS:
Conduct an exhaustive forensic discovery analysis for this specific case.
1. Every procedural error identified MUST include the exact Document ID ("${documents[0]?.id || 'doc_id'}"), document name, exact page/paragraph reference, timestamp (if available in text), and verbatim quote from the text above.
2. Cross-examine timestamps and statements across documents to flag timeline contradictions (e.g., stop time, arrest time, observation start, breath test start/stop, booking time, refusal form execution time).
3. Do not include any generic or boilerplate findings. Every output item must be 100% case-specific and grounded in the evidence provided.
`
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: { parts },
      config: {
        systemInstruction: MA_LEGAL_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: caseAnalysisSchema,
      }
    });

    const jsonText = response.text?.trim() || '';
    if (!jsonText) {
      throw new Error('Gemini model returned empty response text.');
    }

    const parsed = JSON.parse(jsonText) as CaseAnalysisResult;

    // Post-process & verify all model-extracted quotes via citationGuard
    const verifiedErrors: ProceduralError[] = (parsed.proceduralErrors || []).map((err, idx) => {
      const targetDoc =
        documents.find((d) => d.id === err.pageParagraphRef?.documentId) ||
        documents.find((d) => d.name?.toLowerCase().includes(err.pageParagraphRef?.documentName?.toLowerCase() || '')) ||
        documents[0];

      const guardRes = verifyQuoteAgainstPages(
        err.verbatimQuote || '',
        {
          pageNumber: err.pageParagraphRef?.pageNumber || 1,
          paragraphNumber: err.pageParagraphRef?.paragraphNumber || 1
        },
        targetDoc?.pages
      );

      return {
        ...err,
        id: `ai_layerB_${idx}_${Date.now()}`,
        sourceLayer: 'AI_MODEL',
        verifiedQuote: guardRes.verified,
        verificationStatus: guardRes.verificationStatus,
        matchingSnippet: guardRes.matchingSnippet,
        pageParagraphRef: {
          pageNumber: err.pageParagraphRef?.pageNumber || 1,
          paragraphNumber: err.pageParagraphRef?.paragraphNumber || 1,
          documentId: targetDoc?.id || documents[0]?.id || 'doc_unknown',
          documentName: targetDoc?.name || documents[0]?.name || 'Discovery File',
          timestamp: err.pageParagraphRef?.timestamp || undefined
        }
      };
    });

    return {
      caseSummary: parsed.caseSummary,
      clientBackground: parsed.clientBackground,
      proceduralErrors: verifiedErrors,
      timelineEvents: parsed.timelineEvents || [],
      defensePillars: parsed.defensePillars || [],
      estimatedBACAtOperation: parsed.estimatedBACAtOperation
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown AI analysis failure';
    console.error('Gemini Case Analysis Error:', errorMessage);
    throw new Error(`AI Case Analysis Request Failed: ${errorMessage}`);
  }
}

/**
 * Direct Citation Lookup via Gemini (gemini-3.6-flash)
 */
export async function queryCitationWithAI(_query: string): Promise<{
  title: string;
  citation: string;
  type: string;
  summary: string;
  keyHoldings: string[];
}> {
  throw new Error(
    'Legal authority lookup is disabled in Gemini. Use ARC Motion & Legal > CourtListener Research to locate and verify authority before drafting.'
  );
}

/**
 * Direct Collaborative Chat Assistant via Gemini (gemini-3.6-flash)
 */
export async function chatDefenseAssistantWithAI(
  userQuery: string,
  history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
): Promise<string> {
  const ai = createGenAIClient();

  try {
    const chat = ai.chats.create({
      model: 'gemini-3.6-flash',
      config: {
        systemInstruction: `${MA_LEGAL_SYSTEM_INSTRUCTION}
You are an interactive legal defense assistant.
Answer defense counsel questions clearly and concisely.
If no authority in the supplied table supports a legal conclusion, explicitly state that no local table entry supports it and refrain from declaring an ungrounded conclusion.
Do not use em dashes.`
      },
      history
    });

    const response = await chat.sendMessage({ message: userQuery });
    const reply = response.text;
    if (!reply) throw new Error('Empty chat response');
    return reply;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chat assistant request failed';
    throw new Error(`AI Defense Assistant Request Failed: ${msg}`);
  }
}

export async function analyzeProceduralErrors(policeReportText: string): Promise<ProceduralViolationAnalysis> {
  const ai = createGenAIClient();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze this police report for procedural errors under Massachusetts OUI laws.

Do not invent facts. Ground each violation in the report text. If a citation is uncertain, say "Citation requires attorney verification."

Police report:
${policeReportText}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: proceduralErrorSchema,
      }
    });

    const text = response.text?.trim();
    if (!text) throw new Error('Empty procedural error analysis response.');
    return JSON.parse(text) as ProceduralViolationAnalysis;
  } catch (error) {
    console.error('Procedural Error Analysis Failed:', error);
    throw error;
  }
}

export async function* streamMotionToSuppress(_caseData: Record<string, unknown>): AsyncGenerator<string> {
  yield 'Motion drafting is intentionally handled by ARC Motion & Legal. Verify authorities in CourtListener, select approved facts, then open Motion & Legal for Claude drafting and attorney approval.';
}

export async function analyzeBreathalyzerTicket(mimeType: string, base64Data: string): Promise<string> {
  const ai = createGenAIClient();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        },
        {
          text:
            'Extract the BAC values, machine serial number, operator, subject name if visible, and sequence timestamps from this breathalyzer ticket. Flag immediately if calibration blank tests are not exactly 0.000. Return concise findings with any missing fields noted.'
        }
      ]
    });

    return response.text?.trim() || '';
  } catch (error) {
    console.error('Breathalyzer Analysis Failed:', error);
    throw error;
  }
}

/**
 * Drug substance inventory extraction for forensic discovery review.
 */
export async function extractSubstanceInventoryWithAI(
  documents: CaseDocument[],
  caseContext?: Partial<CaseData>
): Promise<SubstanceInventoryItem[]> {
  const ai = createGenAIClient();

  let docIndexText = `=== DISCOVERY EVIDENCE DOCUMENTS ===\n`;
  for (const doc of documents) {
    docIndexText += `\nDOCUMENT ID: "${doc.id}" | TITLE: "${doc.name}" | TYPE: ${doc.type}\n`;
    if (doc.pages && doc.pages.length > 0) {
      docIndexText += doc.pages
        .map(
          (p) =>
            `[DOCUMENT ID: ${doc.id} | Title: ${doc.name} | Page ${p.pageNumber}]\n` +
            p.paragraphs.map((pr) => `[Paragraph ${pr.paragraphNumber}] ${pr.text}`).join('\n')
        )
        .join('\n\n');
    } else if (doc.parsedText) {
      docIndexText += `[DOCUMENT ID: ${doc.id} | Title: ${doc.name} | Full Text]:\n${doc.parsedText}\n`;
    } else {
      docIndexText += `[DOCUMENT ID: ${doc.id} | Title: ${doc.name}]: No extracted text available.\n`;
    }
  }

  const prompt = `Case: ${caseContext?.clientName || 'Unknown'} | Docket: ${caseContext?.caseNumber || 'Unassigned'}

Identify every substance alleged, suspected, field-tested, laboratory-tested, packaged, recovered, submitted, or destroyed in the discovery text.

For each substance mention, extract:
- reportedDrugName
- exactOfficerWording: exact wording from the source paragraph. Do not paraphrase.
- substanceStatus: one of Alleged, Suspected, Field-Tested, Laboratory-Tested, Packaged, Recovered, Submitted, Destroyed, Assumed, Visual
- identificationBasis: one of Visual, Field-Test Based, Laboratory Confirmed, Assumed
- fieldTestBrandOrMethod
- labReportReference
- weightOrQuantity
- packagingDescription
- evidenceItemNumber
- citationPageAndParagraph
- sourceDocumentId
- sourceDocumentName
- pageNumber
- paragraphNumber
- extractionConfidence: High, Medium, or Low
- isUnsupportedIssue
- unsupportedIssueReason

Mandatory rules:
1. Do not treat an officer visual identification, odor statement, packaging similarity, or training-and-experience language as laboratory confirmation.
2. Do not treat a roadside field/color test as laboratory confirmation.
3. Mark unsupported drug identification as an issue whenever identificationBasis is Visual, Field-Test Based, or Assumed, or when a laboratory reference is missing.
4. Never merge conflicting facts. If one document says suspected cocaine and another says lab confirmed fentanyl, return separate records with separate citations.
5. Every record must include a page and paragraph citation. If page or paragraph is unavailable, state the best available source location and set extractionConfidence to Low.

${docIndexText}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              substanceStatus: { type: Type.STRING },
              reportedDrugName: { type: Type.STRING },
              exactOfficerWording: { type: Type.STRING },
              identificationBasis: { type: Type.STRING },
              fieldTestBrandOrMethod: { type: Type.STRING },
              labReportReference: { type: Type.STRING },
              weightOrQuantity: { type: Type.STRING },
              packagingDescription: { type: Type.STRING },
              evidenceItemNumber: { type: Type.STRING },
              citationPageAndParagraph: { type: Type.STRING },
              isUnsupportedIssue: { type: Type.BOOLEAN },
              unsupportedIssueReason: { type: Type.STRING },
              sourceDocumentId: { type: Type.STRING },
              sourceDocumentName: { type: Type.STRING },
              pageNumber: { type: Type.INTEGER },
              paragraphNumber: { type: Type.INTEGER },
              extractionConfidence: { type: Type.STRING }
            },
            required: [
              'substanceStatus',
              'reportedDrugName',
              'exactOfficerWording',
              'identificationBasis',
              'fieldTestBrandOrMethod',
              'labReportReference',
              'weightOrQuantity',
              'packagingDescription',
              'evidenceItemNumber',
              'citationPageAndParagraph',
              'isUnsupportedIssue'
            ]
          }
        },
      }
    });

    const text = response.text?.trim() || '[]';
    const parsed = JSON.parse(text) as Array<Partial<SubstanceInventoryItem>>;
    return normalizeSubstanceInventoryItems(parsed);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Substance inventory extraction error';
    throw new Error(`Drug substance inventory extraction failed: ${errorMsg}`);
  }
}

/**
 * Multimodal document extraction helper for PDF/images
 */
export async function extractDocumentContentWithAI(
  fileBase64: string,
  mimeType: string,
  fileName: string
): Promise<{ parsedText: string; pages: Array<{ pageNumber: number; paragraphs: Array<{ paragraphNumber: number; text: string }> }> }> {
  const ai = createGenAIClient();

  const prompt = `Extract text from this discovery document file "${fileName}".
Group output into pages and numbered paragraphs.
Return JSON strictly formatted with pages array:
[
  {
    "pageNumber": 1,
    "paragraphs": [
      { "paragraphNumber": 1, "text": "exact paragraph text..." }
    ]
  }
]`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: fileBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              pageNumber: { type: Type.INTEGER },
              paragraphs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    paragraphNumber: { type: Type.INTEGER },
                    text: { type: Type.STRING }
                  },
                  required: ['paragraphNumber', 'text']
                }
              }
            },
            required: ['pageNumber', 'paragraphs']
          }
        }
      }
    });

    const text = response.text?.trim() || '[]';
    const pages = JSON.parse(text);

    // Flatten pages to concatenated text for backward compatibility
    const parsedText = pages
      .map(
        (p: { pageNumber: number; paragraphs: Array<{ text: string }> }) =>
          `[Page ${p.pageNumber}]\n` + p.paragraphs.map((pr) => pr.text).join('\n\n')
      )
      .join('\n\n');

    return { parsedText, pages };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Multimodal document extraction error';
    throw new Error(`Document extraction failed for ${fileName}: ${errorMsg}`);
  }
}
