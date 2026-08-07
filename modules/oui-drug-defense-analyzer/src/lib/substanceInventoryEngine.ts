import { CaseData, CaseDocument, LabResultData, SubstanceInventoryItem } from '../types';

const EMPTY_FIELD = 'Not stated in extracted record';

const drugTerms = [
  'heroin',
  'fentanyl',
  'cocaine',
  'crack',
  'marijuana',
  'marihuana',
  'cannabis',
  'thc',
  'methamphetamine',
  'amphetamine',
  'alprazolam',
  'xanax',
  'oxycodone',
  'percocet',
  'suboxone',
  'buprenorphine',
  'ketamine',
  'mdma',
  'ecstasy',
  'pcp',
  'lsd',
  'psilocybin',
  'mushroom',
  'pill',
  'tablet',
  'capsule',
  'powder',
  'residue',
  'rock',
  'green leafy'
];

const packagingTerms = [
  'bag',
  'baggie',
  'glassine',
  'fold',
  'envelope',
  'vial',
  'wrapper',
  'wrap',
  'container',
  'jar',
  'sachet',
  'corner',
  'knot',
  'foil',
  'zip',
  'heat sealed',
  'vacuum sealed',
  'stamp'
];

const fieldTestTerms = [
  'nark',
  'nik',
  'marquis',
  'duquenois',
  'cobalt thiocyanate',
  'scott',
  'dille-koppanyi',
  'mandelin',
  'mecke',
  'simon',
  'field test',
  'color test',
  'reagent'
];

const labTerms = [
  'laboratory',
  'lab report',
  'certificate',
  'certificate of analysis',
  'gc-ms',
  'gc/ms',
  'lc-ms',
  'lc/ms',
  'ftir',
  'raman',
  'mass spectrometry',
  'confirmed',
  'positive for',
  'tested positive',
  'analysis determined',
  'identified as'
];

export function createEmptyLabData(currentCase: CaseData): LabResultData {
  return {
    labCertificateId: 'No laboratory certificate entered',
    labName: 'Not specified',
    analystName: 'Not specified',
    sampleType: 'Seized Evidence',
    collectionTimestamp: currentCase.incidentDate || 'Not specified',
    labReceivedTimestamp: 'Not specified',
    analysisTimestamp: 'Not specified',
    chainOfCustodyDelayDays: 0,
    components: [],
    chainOfCustodyGaps: [],
    qcBatchNumber: 'Not specified',
    isSeizedDrugCase: true
  };
}

export function normalizeSubstanceInventoryItems(
  rawItems: Array<Partial<SubstanceInventoryItem>>
): SubstanceInventoryItem[] {
  return rawItems
    .filter((item) => hasText(item.reportedDrugName) || hasText(item.exactOfficerWording))
    .map((item, index) => normalizeSubstanceInventoryItem(item, index));
}

export function normalizeSubstanceInventoryItem(
  item: Partial<SubstanceInventoryItem>,
  index = 0
): SubstanceInventoryItem {
  const identificationBasis = normalizeBasis(item.identificationBasis);
  const labReportReference = clean(item.labReportReference);
  const unsupported = item.isUnsupportedIssue ?? isUnsupportedIdentification(identificationBasis, labReportReference);

  const normalized: SubstanceInventoryItem = {
    id: item.id || `sub_${Date.now()}_${index}`,
    substanceStatus: normalizeStatus(item.substanceStatus),
    reportedDrugName: clean(item.reportedDrugName, 'Unknown substance'),
    exactOfficerWording: clean(item.exactOfficerWording),
    identificationBasis,
    fieldTestBrandOrMethod: clean(item.fieldTestBrandOrMethod, 'None stated'),
    labReportReference,
    weightOrQuantity: clean(item.weightOrQuantity),
    packagingDescription: clean(item.packagingDescription),
    evidenceItemNumber: clean(item.evidenceItemNumber, 'Unassigned'),
    citationPageAndParagraph: clean(item.citationPageAndParagraph, 'Citation missing'),
    isUnsupportedIssue: unsupported,
    unsupportedIssueReason: unsupported
      ? clean(item.unsupportedIssueReason, buildUnsupportedIssueReason(identificationBasis, labReportReference))
      : undefined,
    sourceDocumentId: item.sourceDocumentId,
    sourceDocumentName: item.sourceDocumentName,
    pageNumber: item.pageNumber,
    paragraphNumber: item.paragraphNumber,
    extractionConfidence: item.extractionConfidence
  };

  return normalized;
}

export function extractSubstanceInventoryFromCase(currentCase: CaseData): SubstanceInventoryItem[] {
  const documentItems = extractSubstanceMentionsFromDocuments(currentCase.documents);
  const labItems = extractSubstancesFromLabData(currentCase.labResultData);
  return dedupeInventory([...documentItems, ...labItems]);
}

function extractSubstanceMentionsFromDocuments(documents: CaseDocument[]): SubstanceInventoryItem[] {
  const items: SubstanceInventoryItem[] = [];

  documents.forEach((doc) => {
    const refs = doc.pages?.length
      ? doc.pages.flatMap((page) =>
          page.paragraphs.map((paragraph) => ({
            pageNumber: page.pageNumber,
            paragraphNumber: paragraph.paragraphNumber,
            text: paragraph.text
          }))
        )
      : splitParsedTextIntoParagraphs(doc.parsedText);

    refs.forEach((ref, refIndex) => {
      const text = ref.text.trim();
      if (!looksDrugRelated(text)) return;

      const basis = inferIdentificationBasis(text, doc);
      const item = normalizeSubstanceInventoryItem(
        {
          id: `sub_doc_${doc.id}_${ref.pageNumber}_${ref.paragraphNumber}_${refIndex}`,
          substanceStatus: inferSubstanceStatus(text, basis),
          reportedDrugName: inferReportedDrugName(text),
          exactOfficerWording: quoteText(text),
          identificationBasis: basis,
          fieldTestBrandOrMethod: inferFieldTestMethod(text),
          labReportReference: inferLabReference(text, doc, basis),
          weightOrQuantity: inferWeightOrQuantity(text),
          packagingDescription: inferPackaging(text),
          evidenceItemNumber: inferEvidenceItemNumber(text),
          citationPageAndParagraph: `${doc.name}, p. ${ref.pageNumber}, paragraph ${ref.paragraphNumber}`,
          sourceDocumentId: doc.id,
          sourceDocumentName: doc.name,
          pageNumber: ref.pageNumber,
          paragraphNumber: ref.paragraphNumber,
          extractionConfidence: basis === 'Laboratory Confirmed' ? 'High' : 'Medium'
        },
        items.length
      );

      items.push(item);
    });
  });

  return items;
}

function extractSubstancesFromLabData(labData?: LabResultData): SubstanceInventoryItem[] {
  if (!labData) return [];

  const items: SubstanceInventoryItem[] = [];

  labData.components?.forEach((component, index) => {
    items.push(
      normalizeSubstanceInventoryItem(
        {
          id: `sub_lab_component_${index}`,
          substanceStatus: 'Laboratory-Tested',
          reportedDrugName: component.substance,
          exactOfficerWording: `"${component.substance}" reported at ${component.detectedValue} ${component.unit}`,
          identificationBasis: 'Laboratory Confirmed',
          fieldTestBrandOrMethod: 'Not applicable to laboratory toxicology component',
          labReportReference: labData.labCertificateId || 'Laboratory certificate number not stated',
          weightOrQuantity: `${component.detectedValue} ${component.unit}`,
          packagingDescription: labData.sampleType || EMPTY_FIELD,
          evidenceItemNumber: labData.labCertificateId || 'Lab component',
          citationPageAndParagraph: `${labData.labCertificateId || 'Lab result'}, laboratory component table`,
          extractionConfidence: 'High'
        },
        index
      )
    );
  });

  labData.drugSeizureItems?.forEach((item, index) => {
    const untestedCount = Math.max(item.totalItemCount - item.testedItemCount, 0);

    items.push(
      normalizeSubstanceInventoryItem(
        {
          id: `sub_lab_seized_${index}`,
          substanceStatus: item.confirmatoryGCMSDone ? 'Laboratory-Tested' : 'Field-Tested',
          reportedDrugName: item.itemDescription,
          exactOfficerWording: `"${item.itemDescription}"`,
          identificationBasis: item.confirmatoryGCMSDone ? 'Laboratory Confirmed' : 'Field-Test Based',
          fieldTestBrandOrMethod: item.colorTestDetails || item.primaryMethod,
          labReportReference: labData.labCertificateId || 'Laboratory certificate number not stated',
          weightOrQuantity: `${item.reportedNetWeightGrams} g net weight; ${item.testedItemCount} of ${item.totalItemCount} units tested`,
          packagingDescription: item.itemDescription,
          evidenceItemNumber: item.id,
          citationPageAndParagraph: `${labData.labCertificateId || 'Lab result'}, seized drug item worksheet`,
          unsupportedIssueReason:
            untestedCount > 0
              ? `${untestedCount} units were not chemically confirmed. Do not treat sample or visual similarity as laboratory confirmation for the entire population.`
              : undefined,
          isUnsupportedIssue: !item.confirmatoryGCMSDone || untestedCount > 0,
          extractionConfidence: item.confirmatoryGCMSDone ? 'High' : 'Medium'
        },
        index
      )
    );
  });

  return items;
}

function splitParsedTextIntoParagraphs(parsedText: string) {
  if (!parsedText?.trim()) return [];
  let pageNumber = 1;
  let paragraphNumber = 0;

  return parsedText
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((text) => {
      const pageMatch = text.match(/\[page\s+(\d+)\]/i);
      if (pageMatch) {
        pageNumber = Number(pageMatch[1]);
        paragraphNumber = 0;
      }
      paragraphNumber += 1;
      return {
        pageNumber,
        paragraphNumber,
        text: text.replace(/\[page\s+\d+\]\s*/i, '').replace(/^paragraph\s+\d+:\s*/i, '')
      };
    });
}

function looksDrugRelated(text: string): boolean {
  const lower = text.toLowerCase();
  const hasDrugTerm = drugTerms.some((term) => lower.includes(term));
  const hasEvidenceVerb = /(alleg|suspect|believ|recover|seiz|field|test|lab|certificate|submit|destroy|package|found|contain|positive|residue)/i.test(text);
  return hasDrugTerm && hasEvidenceVerb;
}

function inferIdentificationBasis(text: string, doc: CaseDocument): SubstanceInventoryItem['identificationBasis'] {
  const lower = `${doc.name} ${text}`.toLowerCase();
  if (labTerms.some((term) => lower.includes(term))) return 'Laboratory Confirmed';
  if (fieldTestTerms.some((term) => lower.includes(term))) return 'Field-Test Based';
  if (/(consistent with|odor|appearance|visual|training and experience|green leafy|rock-like|powdery)/i.test(text)) return 'Visual';
  return 'Assumed';
}

function inferSubstanceStatus(
  text: string,
  basis: SubstanceInventoryItem['identificationBasis']
): SubstanceInventoryItem['substanceStatus'] {
  if (/destroy|consum|discard|disposal/i.test(text)) return 'Destroyed';
  if (/submit|sent to|transmit|delivered to.*lab/i.test(text)) return 'Submitted';
  if (/recover|seiz|found|located/i.test(text)) return 'Recovered';
  if (/packag|bag|glassine|vial|container|wrapped/i.test(text)) return 'Packaged';
  if (basis === 'Laboratory Confirmed') return 'Laboratory-Tested';
  if (basis === 'Field-Test Based') return 'Field-Tested';
  if (basis === 'Visual') return 'Visual';
  if (/suspect/i.test(text)) return 'Suspected';
  if (/alleg/i.test(text)) return 'Alleged';
  return 'Assumed';
}

function inferReportedDrugName(text: string): string {
  const lower = text.toLowerCase();
  const matched = drugTerms.filter((term) => lower.includes(term));
  if (matched.length === 0) return 'Unknown controlled substance';

  const preferred = matched
    .filter((term) => !['powder', 'residue', 'rock', 'pill', 'tablet', 'capsule', 'green leafy'].includes(term))
    .slice(0, 3);

  return titleCase((preferred.length ? preferred : matched.slice(0, 3)).join(' / '));
}

function inferFieldTestMethod(text: string): string {
  const sentence = findClauseWithTerms(text, fieldTestTerms);
  return sentence || 'None stated';
}

function inferLabReference(
  text: string,
  doc: CaseDocument,
  basis: SubstanceInventoryItem['identificationBasis']
): string {
  if (basis !== 'Laboratory Confirmed') return 'No laboratory confirmation cited in extracted wording';
  const certificate = text.match(/(?:certificate|cert\.?|lab(?:oratory)? report|lims|case)\s*(?:no\.?|#|number|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_/]{3,})/i);
  if (certificate) return `${doc.name}; ${certificate[0]}`;
  return `${doc.name}; laboratory confirmation wording extracted`;
}

function inferWeightOrQuantity(text: string): string {
  const matches = text.match(/\b(?:approximately|approx\.?|about)?\s*\d+(?:\.\d+)?\s*(?:grams?|g\b|mg\b|kg\b|ounces?|oz\b|pounds?|lbs?\b|bags?|baggies|glassines?|bindles?|folds?|vials?|pills?|tablets?|capsules?|rocks?|packets?)\b/gi);
  return matches?.join('; ') || EMPTY_FIELD;
}

function inferPackaging(text: string): string {
  const clause = findClauseWithTerms(text, packagingTerms);
  return clause || EMPTY_FIELD;
}

function inferEvidenceItemNumber(text: string): string {
  const match = text.match(/\b(?:item|evidence|property|exhibit|tag)\s*(?:no\.?|#|number)?\s*[:\-]?\s*([A-Z]?\d+[A-Z]?(?:[-.][A-Z0-9]+)?)/i);
  return match ? match[0] : 'Unassigned';
}

function findClauseWithTerms(text: string, terms: string[]): string {
  const pieces = text.split(/(?<=[.;])\s+|\n+/).map((piece) => piece.trim()).filter(Boolean);
  return pieces.find((piece) => terms.some((term) => piece.toLowerCase().includes(term))) || '';
}

function isUnsupportedIdentification(
  basis: SubstanceInventoryItem['identificationBasis'],
  labReportReference: string
): boolean {
  if (basis !== 'Laboratory Confirmed') return true;
  return /(no laboratory|not produced|missing|omitted|none|not stated|uncited)/i.test(labReportReference);
}

function buildUnsupportedIssueReason(
  basis: SubstanceInventoryItem['identificationBasis'],
  labReportReference: string
): string {
  if (basis === 'Visual') {
    return 'Unsupported drug identification: visual appearance, odor, packaging, or training-and-experience language is not laboratory chemical confirmation.';
  }
  if (basis === 'Field-Test Based') {
    return 'Unsupported drug identification: roadside or preliminary field tests are presumptive only and must not be treated as laboratory confirmation.';
  }
  if (basis === 'Assumed') {
    return 'Unsupported drug identification: the record assumes identity without chemical testing or a cited laboratory certificate.';
  }
  return `Laboratory confirmation is incomplete or uncited: ${labReportReference || 'no laboratory reference supplied'}.`;
}

function dedupeInventory(items: SubstanceInventoryItem[]): SubstanceInventoryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [
      item.reportedDrugName.toLowerCase(),
      item.exactOfficerWording.toLowerCase(),
      item.evidenceItemNumber.toLowerCase(),
      item.citationPageAndParagraph.toLowerCase()
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeStatus(status?: SubstanceInventoryItem['substanceStatus']): SubstanceInventoryItem['substanceStatus'] {
  const allowed: SubstanceInventoryItem['substanceStatus'][] = [
    'Alleged',
    'Suspected',
    'Field-Tested',
    'Laboratory-Tested',
    'Packaged',
    'Recovered',
    'Submitted',
    'Destroyed',
    'Assumed',
    'Visual'
  ];
  return status && allowed.includes(status) ? status : 'Assumed';
}

function normalizeBasis(basis?: SubstanceInventoryItem['identificationBasis']): SubstanceInventoryItem['identificationBasis'] {
  if (basis === 'Laboratory Confirmed' || basis === 'Field-Test Based' || basis === 'Visual' || basis === 'Assumed') {
    return basis;
  }
  return 'Assumed';
}

function quoteText(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
}

function clean(value?: string, fallback = EMPTY_FIELD): string {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed || fallback;
}

function hasText(value?: string): boolean {
  return Boolean(value && value.trim().length > 0);
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
