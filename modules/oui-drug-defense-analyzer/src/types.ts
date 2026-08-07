/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ParagraphContent {
  paragraphNumber: number;
  text: string;
}

export interface ExtractedPage {
  pageNumber: number;
  paragraphs: ParagraphContent[];
}

export interface PageParagraphRef {
  pageNumber?: number;
  paragraphNumber?: number;
  documentId?: string;
  documentName?: string;
  timestamp?: string;
}

export type DocumentClassificationCategory =
  | 'police_narrative'
  | 'complaint'
  | 'drug_certificate'
  | 'chain_record'
  | 'lims_record'
  | 'bench_worksheet'
  | 'instrument_data'
  | 'sampling_worksheet'
  | 'balance_record'
  | 'sop_policy'
  | 'unknown';

export interface ExtendedDocumentClassification {
  category: DocumentClassificationCategory;
  categoryLabel: string;
  confidence: 'High' | 'Medium' | 'Low';
  requiresVerification: boolean;
  classificationNote?: string;
}

export type DocumentType =
  | 'police_report'
  | 'draeger_ticket'
  | 'booking_video_log'
  | 'lab_certificate'
  | 'medical_record'
  | 'police_narrative'
  | 'complaint'
  | 'drug_certificate'
  | 'chain_record'
  | 'lims_record'
  | 'bench_worksheet'
  | 'instrument_data'
  | 'sampling_worksheet'
  | 'balance_record'
  | 'sop_policy'
  | 'other';

export interface CaseDocument {
  id: string;
  name: string;
  type: DocumentType;
  classification?: ExtendedDocumentClassification;
  uploadDate: string;
  parsedText: string;
  pages?: ExtractedPage[];
  status: 'pending' | 'parsed' | 'error';
  errorMessage?: string;
  mimeType?: string;
}

export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ErrorCategory =
  | 'Observation Window'
  | 'Exit Order'
  | 'SFST Administration'
  | 'Cannabis Impairment'
  | 'Refusal Characterization'
  | 'Draeger Calibration'
  | 'Chain of Custody'
  | 'Statutory Rights'
  | 'Timeline Contradiction'
  | 'Lab Analysis'
  | 'Other';

export interface ProceduralError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  title: string;
  description: string;
  verbatimQuote: string;
  pageParagraphRef: PageParagraphRef;
  standardViolated: string;
  evidentiaryExclusionStrategy: string;
  sourceLayer: 'RULE_ENGINE' | 'AI_MODEL';
  verifiedQuote: boolean;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED_QUOTE' | 'DERIVED_FINDING';
  matchingSnippet?: string;
}

export interface MotionWinScore {
  motionType: string;
  score: number;
  contributingRuleIds: string[];
  rationale: string;
}

export interface DefensePillar {
  pillar:
    | 'Observation & Timeline'
    | 'Exit Order Basis'
    | 'SFST Compliance'
    | 'Chemical Test Integrity'
    | 'Constitutional & Statutory Rights';
  score: number;
  rationale: string;
}

export interface TimelineEvent {
  time: string;
  event: string;
  documentRef: string;
  pageParagraphRef?: PageParagraphRef;
  sourceDocumentId?: string;
}

export interface EstimatedBAC {
  min: number;
  max: number;
  calculationNotes: string;
}

export interface CaseAnalysisResult {
  caseSummary: string;
  clientBackground: string;
  proceduralErrors: ProceduralError[];
  timelineEvents: TimelineEvent[];
  defensePillars: DefensePillar[];
  motionWinScores: MotionWinScore[];
  estimatedBACAtOperation: EstimatedBAC;
}

export interface WorkspaceNote {
  id: string;
  authorRole: 'Lead Attorney' | 'Associate' | 'Investigator' | 'Paralegal';
  content: string;
  timestamp: string;
  resolved: boolean;
  pinnedRef?: {
    documentId: string;
    documentName: string;
    pageNumber: number;
    paragraphNumber: number;
    quoteSnippet: string;
  };
}

export interface ExtractedImage {
  id: string;
  name: string;
  dataUrl: string;
  sourceDocumentName: string;
  pageNumber?: number;
  caption: string;
  category: 'PHOTO_EVIDENCE' | 'DOCUMENT_SCAN' | 'LAB_CERTIFICATE' | 'MUGSHOT' | 'SCENE_PHOTO';
  selectedForReport: boolean;
  timestamp?: string;
}

export interface LabTestComponent {
  substance: string;
  detectedValue: number;
  unit: string;
  cutoffLevel: number;
  therapeuticMin?: number;
  toxicMin?: number;
  uncertaintyRange: number; // +/- percentage or absolute
  testingMethod: 'GC-MS' | 'LC-MS/MS' | 'GC-FID (Infrared)' | 'Immunoassay';
  qcBatchPassed: boolean;
}

export interface SeizedDrugItem {
  id: string;
  itemDescription: string;
  totalItemCount: number;
  testedItemCount: number;
  samplingPlanUsed: 'Hypergeometric (k=0.7)' | 'Hypergeometric (k=0.9)' | 'Threshold' | 'Administrative';
  reportedNetWeightGrams: number;
  weightUncertaintyGrams: number;
  homogeneityVerified: boolean;
  colorTestIdentical: boolean;
  colorTestDetails?: string;
  primaryMethod: 'FTIR' | 'GC-MS' | 'LC-MS/MS' | 'Color Test Only' | 'Pharmaceutical Identifier';
  confirmatoryGCMSDone: boolean;
  isStreetDrugMixture?: boolean;
  suspectedOpticalIsomers?: boolean;
  statutoryThresholdGrams?: number;
}

export interface DrugPolicyAuditData {
  containsSyringe?: boolean;
  syringeHasHomicideApproval?: boolean;
  drugPackagingDNAOrPrintRequested?: boolean;
  isPossessionOnlyCharge?: boolean;
  isInteriorPackagingProcessed?: boolean;
  interiorPackagingApprovedByDirector?: boolean;
  isFoundItemOrCIBuy?: boolean;
  analystReceivedSuspectContext?: boolean;
}

export interface OUIToxAuditData {
  isOUIBloodDraw?: boolean;
  testedEthanol?: boolean;
  testedDrugs?: boolean;
  issuedDualSupplementalReport?: boolean;
  isUrineSampleForOUI?: boolean;
  attemptedUrineEthanol?: boolean;
}

export interface SubstanceInventoryItem {
  id: string;
  substanceStatus: 'Alleged' | 'Suspected' | 'Field-Tested' | 'Laboratory-Tested' | 'Packaged' | 'Recovered' | 'Submitted' | 'Destroyed' | 'Assumed' | 'Visual';
  reportedDrugName: string;
  exactOfficerWording: string;
  identificationBasis: 'Visual' | 'Field-Test Based' | 'Laboratory Confirmed' | 'Assumed';
  fieldTestBrandOrMethod: string;
  labReportReference: string;
  weightOrQuantity: string;
  packagingDescription: string;
  evidenceItemNumber: string;
  citationPageAndParagraph: string;
  isUnsupportedIssue: boolean;
  unsupportedIssueReason?: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  pageNumber?: number;
  paragraphNumber?: number;
  extractionConfidence?: 'High' | 'Medium' | 'Low';
}

export interface LabResultData {
  labCertificateId: string;
  labName: string;
  analystName: string;
  sampleType: 'Blood' | 'Breath' | 'Urine' | 'Oral Fluid' | 'Seized Evidence';
  collectionTimestamp: string;
  labReceivedTimestamp: string;
  analysisTimestamp: string;
  chainOfCustodyDelayDays: number;
  components: LabTestComponent[];
  chainOfCustodyGaps: string[];
  qcBatchNumber: string;
  qcDeviationNotes?: string;
  isSeizedDrugCase?: boolean;
  drugSeizureItems?: SeizedDrugItem[];
  substanceInventory?: SubstanceInventoryItem[];
  drugPolicyAudits?: DrugPolicyAuditData;
  ouiToxicologyAudits?: OUIToxAuditData;
}

export interface MotionTemplateType {
  id: string;
  category: 'MOTION' | 'FOIA_REQUEST' | 'AFFIDAVIT' | 'MEMORANDUM';
  title: string;
  maAuthority: string;
  description: string;
  defaultGrounds: string[];
}

export interface AttorneyInfo {
  attorneyName: string;
  bboNumber: string;
  firmName: string;
  address: string;
  phone: string;
  email: string;
  signatureDataUrl?: string;
}

export interface CourtPleadingDraft {
  id: string;
  type: 'MOTION' | 'FOIA_REQUEST' | 'AFFIDAVIT' | 'MEMORANDUM';
  title: string;
  courtName: string;
  docketNumber: string;
  clientName: string;
  defendantName: string;
  prosecutorAgency: string;
  presidingJudge?: string;
  date: string;
  reliefRequested: string;
  statementOfFacts: string;
  legalArgument: string;
  conclusion: string;
  statutoryCitations: string[];
  signatureBlock: AttorneyInfo;
}

export interface CaseData {
  id: string;
  clientName: string;
  caseNumber: string;
  court: string;
  charge: string;
  incidentDate: string;
  arrestingAgency: string;
  documents: CaseDocument[];
  extractedImages?: ExtractedImage[];
  labResultData?: LabResultData;
  pleadingDrafts?: CourtPleadingDraft[];
  analysisResult?: CaseAnalysisResult;
  lastUpdated: string;
  notes?: WorkspaceNote[];
}

export interface MAAuthority {
  id: string;
  title: string;
  citation: string;
  type: 'Statute' | 'CMR' | 'Constitutional' | 'Case Law' | 'SOP/Manual';
  summary: string;
  keyHoldings: string[];
  verificationNote: string;
}

export interface AnalysisRunHistory {
  id: string;
  timestamp: string;
  defectCount: number;
  riskScore: number;
  motionScores: { motionType: string; score: number }[];
}

export interface StructuredFactExtraction {
  policeDescribedSubstance: string;
  fieldTestResult: string;
  complaintAllegation: string;
  labConfirmedSubstance: string;
  policeWeight: string;
  labIntakeWeight: string;
  certificateWeight: string;
  weightClassification: string;
  netWeight: string;
  expandedUncertainty: string;
  lowerBoundAnalysisText: string;
}

export interface ItemReconciliationNode {
  stage: 'seizure' | 'police_packaging' | 'evidence_tag' | 'submission' | 'lims_item' | 'analyst_worksheet' | 'instrument_run' | 'certificate';
  label: string;
  itemNumber: string;
  description: string;
  packaging: string;
  weightText: string;
  handler: string;
  date: string;
  sealStatus: 'Intact' | 'Broken' | 'Unspecified';
  sourceDocRef?: string;
}

export interface ItemReconciliationFlag {
  id: string;
  flagType:
    | 'ITEM_NUMBER_CHANGE'
    | 'DESCRIPTION_CHANGE'
    | 'PACKAGING_DIFFERENCE'
    | 'SEAL_DISCREPANCY'
    | 'UNEXPLAINED_WEIGHT_CHANGE'
    | 'MISSING_HANDLER'
    | 'MISSING_DATE_SIGNATURE'
    | 'MULTIPLE_ITEMS_COMBINED'
    | 'UNCONNECTED_TESTED_ITEM';
  title: string;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  nodesInvolved: string[];
}

export interface EvidenceItemMap {
  seizureId: string;
  nodes: ItemReconciliationNode[];
  flags: ItemReconciliationFlag[];
}

export interface StructuredIssueCard {
  id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'Weight / threshold' | 'Sampling limitation' | 'Substance identity' | 'Chain & item identity' | 'Raw data & controls' | 'SOP / policy requirement';
  sourceFact: string;
  weightType: string;
  expandedUncertainty: string;
  policyQuestion: string;
  problem: string;
  defenseSignificance: string;
  neededDiscovery: string[];
  motionUse: string;
  crossTarget: string;
  confidence: 'High' | 'Medium' | 'Low';
  confidenceNote?: string;
  status: 'ACCEPT' | 'REJECT' | 'EDITED';
  attorneyNotes?: string;
}

export interface DiscoveryCompletenessItem {
  category: 'Certificate' | 'Chain' | 'Bench notes' | 'Sampling' | 'Raw instrument data' | 'Controls' | 'Weight and uncertainty' | 'Review records' | 'SOPs';
  status: 'Produced' | 'Partial' | 'Missing' | 'Unclear' | 'Not applicable';
  notes: string;
}
