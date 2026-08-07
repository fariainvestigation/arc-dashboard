import React, { useState, useRef } from 'react';
import {
  FileText,
  Download,
  Printer,
  Scale,
  CheckCircle2,
  Copy,
  FileCode,
  ShieldAlert,
  Sparkles,
  Search,
  Filter,
  Folder,
  Briefcase,
  Users,
  FileCheck,
  Calendar,
  AlertTriangle,
  FileQuestion,
  ChevronRight,
  Upload,
  Code2,
  FileJson,
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  Award,
  Eye,
  PenTool
} from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { CaseData, CourtPleadingDraft, AttorneyInfo } from '../types';
import { ArcLogo } from './ArcLogo';
import { getDefaultAttorneyInfo, saveAttorneyInfo } from './PrintPreviewEditModal';
import { AttorneySettingsModal } from './AttorneySettingsModal';

interface LegalPleadingsGeneratorProps {
  currentCase: CaseData;
  onUpdateCase: (updatedCase: CaseData) => void;
}

export type CategoryKey =
  | 'PRETRIAL_MOTIONS'
  | 'SUPPORTING_PAPERS'
  | 'INVESTIGATION_WORKPRODUCT'
  | 'DISCOVERY_RECORDS'
  | 'CLIENT_FACING'
  | 'COURT_ADMINISTRATIVE';

export interface DocumentTemplateOption {
  key: string;
  category: CategoryKey;
  categoryLabel: string;
  title: string;
  shortDesc: string;
  statutoryCitations: string[];
}

export const DOCUMENT_TEMPLATES: DocumentTemplateOption[] = [
  // --- Category 1: Pre-trial motions ---
  {
    key: 'MOTION_SUPPRESS_BREATH_OBSERVATION',
    category: 'PRETRIAL_MOTIONS',
    categoryLabel: 'Pre-Trial Motions',
    title: 'Motion to Suppress Breath Test Results (15-Min Observation Violation)',
    shortDesc: '501 CMR 2.13 & Commonwealth v. Pierre / Davis - Interrupted continuous visual observation',
    statutoryCitations: ['501 CMR 2.13', 'M.G.L. c. 90 § 24K', 'Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008)', 'Mass. R. Crim. P. 13']
  },
  {
    key: 'MOTION_SUPPRESS_UNLAWFUL_EXIT_ORDER',
    category: 'PRETRIAL_MOTIONS',
    categoryLabel: 'Pre-Trial Motions',
    title: 'Motion to Suppress Evidence from Unlawful Exit Order',
    shortDesc: 'Article 14 & Commonwealth v. Blais / Gonsalves - Lack of reasonable suspicion for exit command',
    statutoryCitations: ['Article 14, MA Declaration of Rights', 'Commonwealth v. Blais, 428 Mass. 294 (1998)', 'Commonwealth v. Gonsalves, 429 Mass. 658 (1999)']
  },
  {
    key: 'MOTION_SUPPRESS_STOP_MARIJUANA_ODOR',
    category: 'PRETRIAL_MOTIONS',
    categoryLabel: 'Pre-Trial Motions',
    title: 'Motion to Suppress Fruits of Unlawful Stop/Search (Marijuana Odor Alone)',
    shortDesc: 'Commonwealth v. Cruz / M.G.L. c. 94C § 32L - Burnt odor alone does not supply criminal suspicion',
    statutoryCitations: ['Commonwealth v. Cruz, 459 Mass. 459 (2011)', 'M.G.L. c. 94C § 32L', 'Article 14, MA Declaration of Rights']
  },
  {
    key: 'MOTION_LIMINE_SFST_GERHARDT_DEVIATION',
    category: 'PRETRIAL_MOTIONS',
    categoryLabel: 'Pre-Trial Motions',
    title: 'Motion in Limine to Exclude / Limit SFST Testimony',
    shortDesc: 'NHTSA manual deviation & Commonwealth v. Gerhardt - Bars opinion that subject "failed" or was "under influence"',
    statutoryCitations: ['Commonwealth v. Gerhardt, 477 Mass. 775 (2017)', 'NHTSA SFST Manual Standards', 'Mass. G. Evid. § 702']
  },
  {
    key: 'MOTION_LIMINE_CHEMICAL_REFUSAL_MCGRAIL',
    category: 'PRETRIAL_MOTIONS',
    categoryLabel: 'Pre-Trial Motions',
    title: 'Motion in Limine to Preclude Reference to Chemical Test Refusal',
    shortDesc: 'Commonwealth v. McGrail & Article 12 - Absolute bar on refusal evidence as self-incrimination',
    statutoryCitations: ['Commonwealth v. McGrail, 419 Mass. 774 (1995)', 'Article 12, MA Declaration of Rights', 'M.G.L. c. 90 § 24(1)(f)']
  },
  {
    key: 'MOTION_EXCLUDE_DRUG_CERTIFICATE_MELENDEZ_DIAZ',
    category: 'PRETRIAL_MOTIONS',
    categoryLabel: 'Pre-Trial Motions',
    title: 'Motion to Exclude Drug Certificate & Demand Live Analyst Testimony',
    shortDesc: 'Melendez-Diaz v. Massachusetts & 6th Amendment Confrontation Clause',
    statutoryCitations: ['Melendez-Diaz v. Massachusetts, 557 U.S. 305 (2009)', 'Sixth Amendment, U.S. Const.', 'Article 12, MA Declaration of Rights']
  },
  {
    key: 'MOTION_DISMISS_INSUFFICIENT_PROBABLE_CAUSE',
    category: 'PRETRIAL_MOTIONS',
    categoryLabel: 'Pre-Trial Motions',
    title: 'Motion to Dismiss for Insufficient Probable Cause',
    shortDesc: 'Commonwealth v. DiBennadetto / McCarthy standard - Four corners of complaint lack probable cause',
    statutoryCitations: ['Commonwealth v. DiBennadetto, 436 Mass. 310 (2002)', 'Commonwealth v. McCarthy, 385 Mass. 160 (1982)']
  },
  {
    key: 'MOTION_FRANKS_HEARING_CONTRADICTORY_NARRATIVE',
    category: 'PRETRIAL_MOTIONS',
    categoryLabel: 'Pre-Trial Motions',
    title: 'Motion for Franks Hearing (Narrative Contradicts Sequence Log)',
    shortDesc: 'Franks v. Delaware - Material reckless misstatements/omissions in police affidavit',
    statutoryCitations: ['Franks v. Delaware, 438 U.S. 154 (1978)', 'Commonwealth v. Long, 454 Mass. 542 (2009)']
  },

  // --- Category 2: Supporting papers ---
  {
    key: 'SUPPORTING_MEMORANDUM_OF_LAW',
    category: 'SUPPORTING_PAPERS',
    categoryLabel: 'Supporting Papers',
    title: 'Memorandum of Law in Support of Pre-Trial Motion',
    shortDesc: 'Pulls facts from citation index and arguments from fired procedural rules',
    statutoryCitations: ['Mass. R. Crim. P. 13', '501 CMR 2.13', 'Article 14, MA Declaration of Rights']
  },
  {
    key: 'SUPPORTING_ATTORNEY_INVESTIGATOR_AFFIDAVIT',
    category: 'SUPPORTING_PAPERS',
    categoryLabel: 'Supporting Papers',
    title: 'Attorney / Investigator Discovery Affidavit with Pinpoint Pins',
    shortDesc: 'Sworn affidavit reciting discovery facts with page/paragraph pinpoint record cites',
    statutoryCitations: ['Mass. R. Crim. P. 13(a)(2)']
  },
  {
    key: 'SUPPORTING_PROPOSED_ORDER',
    category: 'SUPPORTING_PAPERS',
    categoryLabel: 'Supporting Papers',
    title: 'Proposed Order Allowing Motion to Suppress / Dismiss',
    shortDesc: 'Judicial decree template for judge allowance',
    statutoryCitations: ['Mass. R. Crim. P. 13']
  },
  {
    key: 'SUPPORTING_UNDISPUTED_FACTS_STATEMENT',
    category: 'SUPPORTING_PAPERS',
    categoryLabel: 'Supporting Papers',
    title: 'Statement of Undisputed Facts with Verbatim Cites',
    shortDesc: 'Numbered factual stipulations backed by police report & video timestamps',
    statutoryCitations: ['Mass. R. Crim. P. 13']
  },

  // --- Category 3: Investigation and internal work product ---
  {
    key: 'WORKPRODUCT_INVESTIGATIVE_REPORT_ARC_FORMAT',
    category: 'INVESTIGATION_WORKPRODUCT',
    categoryLabel: 'Investigation & Work Product',
    title: 'Investigative Report on Procedural Defects (ARC Format)',
    shortDesc: 'Per-finding severity audit, verbatim quote matching, and exclusion strategy',
    statutoryCitations: ['ARC Investigation Audit Protocol', '501 CMR 2.00']
  },
  {
    key: 'WORKPRODUCT_MASTER_RECONCILED_TIMELINE',
    category: 'INVESTIGATION_WORKPRODUCT',
    categoryLabel: 'Investigation & Work Product',
    title: 'Master Timeline Reconciling Narrative, Draeger Log & Video',
    shortDesc: 'Side-by-side reconciliation of officer narrative, Draeger ticket, and booking clock',
    statutoryCitations: ['Draeger Alcotest 9510 Internal Clock Logs']
  },
  {
    key: 'WORKPRODUCT_OFFICER_CREDIBILITY_CROSS_OUTLINE',
    category: 'INVESTIGATION_WORKPRODUCT',
    categoryLabel: 'Investigation & Work Product',
    title: 'Officer Credibility & Cross-Examination Outline',
    shortDesc: 'Impeachment line-by-line cross outline using NHTSA manual and report quotes',
    statutoryCitations: ['Mass. G. Evid. § 611', 'NHTSA SFST Manual']
  },
  {
    key: 'WORKPRODUCT_RETROGRADE_BAC_ANALYSIS_MEMO',
    category: 'INVESTIGATION_WORKPRODUCT',
    categoryLabel: 'Investigation & Work Product',
    title: 'Retrograde BAC Analysis Memo (Elimination Band & Caveat)',
    shortDesc: 'Calculates elimination rate range (0.015-0.020g%/hr) and absorption timeline',
    statutoryCitations: ['Commonwealth v. Colturi, 448 Mass. 809 (2007)']
  },
  {
    key: 'WORKPRODUCT_CHAIN_OF_CUSTODY_DEFECT_MEMO',
    category: 'INVESTIGATION_WORKPRODUCT',
    categoryLabel: 'Investigation & Work Product',
    title: 'Chain-of-Custody Defect Memo for c. 94C Certificate',
    shortDesc: 'Audits evidence bag seal, storage temperature, and transit log gaps',
    statutoryCitations: ['M.G.L. c. 22C § 39', 'Commonwealth v. Johnson, 481 Mass. 710 (2019)']
  },

  // --- Category 4: Discovery and records ---
  {
    key: 'DISCOVERY_RULE_14_DEMAND_LETTER',
    category: 'DISCOVERY_RECORDS',
    categoryLabel: 'Discovery & Records',
    title: 'Rule 14 Mandatory Discovery Demand (Eff. March 1, 2025)',
    shortDesc: 'Comprehensive demand pursuant to amended Mass. R. Crim. P. 14 rules',
    statutoryCitations: ['Mass. R. Crim. P. 14 (Amended March 1, 2025)']
  },
  {
    key: 'DISCOVERY_PUBLIC_RECORDS_FOIA_SOP_REQUEST',
    category: 'DISCOVERY_RECORDS',
    categoryLabel: 'Discovery & Records',
    title: 'M.G.L. c. 66 § 10 Public Records Request to RAO (Department SOPs)',
    shortDesc: 'FOIA demand for police department OUI, SFST, and breath test SOPs',
    statutoryCitations: ['M.G.L. c. 66 § 10', 'M.G.L. c. 4 § 7(26)']
  },
  {
    key: 'DISCOVERY_OAT_RECORDS_REQUEST_9510',
    category: 'DISCOVERY_RECORDS',
    categoryLabel: 'Discovery & Records',
    title: 'OAT Records Request (Calibration, Certs, & Testing for Instrument)',
    shortDesc: 'Demands Office of Alcohol Testing logs, simulator solution CoA, and BTO certs',
    statutoryCitations: ['501 CMR 2.00', 'M.G.L. c. 90 § 24K']
  },
  {
    key: 'DISCOVERY_VIDEO_PRESERVATION_LETTER',
    category: 'DISCOVERY_RECORDS',
    categoryLabel: 'Discovery & Records',
    title: 'Preservation Letter for Cruiser, Dashcam, & Booking Video',
    shortDesc: 'Formal spoliation notice commanding retention of raw uncompressed video',
    statutoryCitations: ['Commonwealth v. Heath, 89 Mass. App. Ct. 328 (2016)']
  },

  // --- Category 5: Client-facing ---
  {
    key: 'CLIENT_PLAIN_LANGUAGE_CASE_SUMMARY',
    category: 'CLIENT_FACING',
    categoryLabel: 'Client-Facing',
    title: 'Plain-Language Case Summary (Client Dual-View Report)',
    shortDesc: 'Translates complex forensic lab results and legal defenses into clear client terms',
    statutoryCitations: ['Client Defense Advisory Protocol']
  },
  {
    key: 'CLIENT_ENGAGEMENT_STATUS_LETTER_DATES',
    category: 'CLIENT_FACING',
    categoryLabel: 'Client-Facing',
    title: 'Engagement-Scoped Status Letter & Next Four Court Dates',
    shortDesc: 'Outlines defense plan, key weaknesses in state case, and upcoming court schedule',
    statutoryCitations: ['MA Rules of Professional Conduct 1.4']
  },
  {
    key: 'CLIENT_INDEPENDENT_PHYSICIAN_BLOOD_ADVISORY',
    category: 'CLIENT_FACING',
    categoryLabel: 'Client-Facing',
    title: 'Independent Physician / Blood Test Statutory Advisory',
    shortDesc: 'Advises client on M.G.L. c. 90 § 24(1)(e) right to immediate medical examination',
    statutoryCitations: ['M.G.L. c. 90 § 24(1)(e)', 'Commonwealth v. King, 429 Mass. 169 (1999)']
  },

  // --- Category 6: Court administrative ---
  {
    key: 'ADMIN_DISCOVERY_COMPLIANCE_CERTIFICATE',
    category: 'COURT_ADMINISTRATIVE',
    categoryLabel: 'Court Administrative',
    title: 'Certificate of Discovery Compliance (Mass. R. Crim. P. 14)',
    shortDesc: 'Formal certification filed prior to trial or motion hearing',
    statutoryCitations: ['Mass. R. Crim. P. 14(a)(3)']
  },
  {
    key: 'ADMIN_MOTION_FOR_CONTINUANCE',
    category: 'COURT_ADMINISTRATIVE',
    categoryLabel: 'Court Administrative',
    title: 'Motion for Continuance (Outstanding Laboratory / Video Discovery)',
    shortDesc: 'Requests rescheduled hearing date due to missing mandatory discovery',
    statutoryCitations: ['Mass. R. Crim. P. 10', 'District Court Rule 3']
  },
  {
    key: 'ADMIN_WITNESS_SUMMONS_SUBPOENA_BTO_ANALYST',
    category: 'COURT_ADMINISTRATIVE',
    categoryLabel: 'Court Administrative',
    title: 'Witness Summons / Subpoena Duces Tecum for BTO / Lab Analyst',
    shortDesc: 'Commands attendance and production of batch logs at motion hearing',
    statutoryCitations: ['Mass. R. Crim. P. 17', 'M.G.L. c. 233 § 1']
  }
];

export const LegalPleadingsGenerator: React.FC<LegalPleadingsGeneratorProps> = ({
  currentCase,
  onUpdateCase
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('MOTION_SUPPRESS_BREATH_OBSERVATION');
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Helper to extract identified errors or fallback
  const identifiedErrors = currentCase.analysisResult?.proceduralErrors || [];
  const primaryError = identifiedErrors[0];

  // Helper to build dynamic draft from chosen template key
  const buildDraftForTemplate = (key: string): CourtPleadingDraft => {
    const courtUpper = `COMMONWEALTH OF MASSACHUSETTS, DISTRICT COURT DEPARTMENT, ${currentCase.court.toUpperCase()}`;
    const docketUpper = `DOCKET NO. ${currentCase.caseNumber}`;
    const clientUpper = currentCase.clientName.toUpperCase();
    const today = new Date().toISOString().split('T')[0];

    const attyBlock = getDefaultAttorneyInfo();

    switch (key) {
      case 'MOTION_SUPPRESS_BREATH_OBSERVATION':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION TO SUPPRESS BREATH TEST RESULTS (501 CMR 2.13 OBSERVATION VIOLATION)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `NOW COMES the Defendant, ${currentCase.clientName}, by and through undersigned counsel, and respectfully moves this Honorable Court pursuant to Mass. R. Crim. P. 13 to suppress all chemical breath test results obtained on or about ${currentCase.incidentDate} via the Draeger Alcotest 9510 instrument.`,
          statementOfFacts: `On ${currentCase.incidentDate}, officers of the ${currentCase.arrestingAgency} arrested the Defendant for OUI. Prior to breath testing at the station, the officer initiated a purported 15-minute observation window. However, as documented in discovery (${primaryError?.pageParagraphRef?.documentName || 'Police Report'}, Page ${primaryError?.pageParagraphRef?.pageNumber || 3}, ¶ ${primaryError?.pageParagraphRef?.paragraphNumber || 2}), the observing officer repeatedly turned away, typed on a computer terminal, and retrieved paperwork, interrupting continuous uninterrupted visual observation required by law.`,
          legalArgument: `Under 501 CMR 2.13 and Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008), strict adherence to the 15-minute continuous visual observation window is a mandatory condition precedent to breath test admissibility under M.G.L. c. 90 § 24K. The observing officer must maintain continuous uninterrupted visual observation to ensure the subject ingests no foreign material, regurgitates, or belches. Interrupted observation invalidates the scientific foundation of the Draeger test.`,
          conclusion: `WHEREFORE, the Defendant respectfully requests that this Honorable Court ALLOW this motion and order all breath test results suppressed from trial evidence.`,
          statutoryCitations: ['501 CMR 2.13', 'M.G.L. c. 90 § 24K', 'Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008)', 'Mass. R. Crim. P. 13'],
          signatureBlock: attyBlock
        };

      case 'MOTION_SUPPRESS_UNLAWFUL_EXIT_ORDER':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION TO SUPPRESS EVIDENCE RESULTING FROM UNLAWFUL EXIT ORDER (ART. 14 / BLAIS)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `The Defendant, ${currentCase.clientName}, respectfully moves this Court to suppress all evidence, observations, statements, and field tests resulting from the unlawful exit order executed on ${currentCase.incidentDate}.`,
          statementOfFacts: `On ${currentCase.incidentDate}, officers stopped the Defendant's vehicle for a minor alleged traffic infraction. Upon approaching the vehicle window, officers ordered the Defendant to exit the vehicle to perform field sobriety tests. At no point did officers observe erratic driving threatening public safety, nor did the Defendant display aggressive demeanor or threat to officer safety.`,
          legalArgument: `Under Commonwealth v. Gonsalves, 429 Mass. 658 (1999) and Commonwealth v. Blais, 428 Mass. 294 (1998), police officers may not order an occupant out of a vehicle during a routine traffic stop unless they possess reasonable, articulable suspicion that officer safety is threatened or that criminal activity is afoot. Ordering a driver out without proportional safety or crime suspicion violates Article 14 of the Massachusetts Declaration of Rights.`,
          conclusion: `WHEREFORE, the Defendant respectfully requests that this Honorable Court ALLOW this Motion and suppress all fruits of the unlawful exit order.`,
          statutoryCitations: ['Article 14, MA Declaration of Rights', 'Commonwealth v. Gonsalves, 429 Mass. 658 (1999)', 'Commonwealth v. Blais, 428 Mass. 294 (1998)'],
          signatureBlock: attyBlock
        };

      case 'MOTION_SUPPRESS_STOP_MARIJUANA_ODOR':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION TO SUPPRESS FRUITS OF UNLAWFUL SEARCH (MARIJUANA ODOR ALONE - CRUZ)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `The Defendant, ${currentCase.clientName}, respectfully moves to suppress all evidence seized following an exit order and search premised solely upon the odor of burnt marijuana on ${currentCase.incidentDate}.`,
          statementOfFacts: `During the traffic stop on ${currentCase.incidentDate}, police officers reported detecting an odor of burnt marijuana emanating from the vehicle cabin. Based strictly upon this odor, officers ordered the Defendant out of the vehicle and conducted a search.`,
          legalArgument: `Under Commonwealth v. Cruz, 459 Mass. 459 (2011) and M.G.L. c. 94C § 32L, decriminalized possession of marijuana means the odor of burnt marijuana alone does not supply reasonable suspicion of criminal activity. Police cannot command an exit order or perform a search based solely on marijuana odor without specific evidence of active impairment or criminal quantity.`,
          conclusion: `WHEREFORE, the Defendant respectfully requests that this Court ALLOW this Motion to Suppress all derivative evidence.`,
          statutoryCitations: ['Commonwealth v. Cruz, 459 Mass. 459 (2011)', 'M.G.L. c. 94C § 32L', 'Article 14, MA Declaration of Rights'],
          signatureBlock: attyBlock
        };

      case 'MOTION_LIMINE_SFST_GERHARDT_DEVIATION':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION IN LIMINE TO EXCLUDE / LIMIT OFFICER SFST OPINION TESTIMONY (GERHARDT)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `The Defendant respectfully moves in limine to preclude police officer testimony stating that the Defendant "failed" roadside field sobriety tests or was "under the influence" of marijuana or alcohol.`,
          statementOfFacts: `The arresting officer's report characterizes the Defendant's performance on field sobriety tests using non-standard terms such as "failed the test" and expresses lay opinions regarding cannabis impairment. Furthermore, the officer deviated from NHTSA standardized instructions.`,
          legalArgument: `Under Commonwealth v. Gerhardt, 477 Mass. 775 (2017), police officers testifying regarding field sobriety tests may NOT state that a subject "failed" or "passed" tests, nor may they offer lay opinions that a driver was "under the influence" of marijuana. Officers are strictly limited to describing specific physical observations.`,
          conclusion: `WHEREFORE, the Defendant requests that this Court limit officer SFST testimony in strict compliance with the Gerhardt mandate.`,
          statutoryCitations: ['Commonwealth v. Gerhardt, 477 Mass. 775 (2017)', 'NHTSA SFST Manual Standards', 'Mass. G. Evid. § 702'],
          signatureBlock: attyBlock
        };

      case 'MOTION_LIMINE_CHEMICAL_REFUSAL_MCGRAIL':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION IN LIMINE TO PRECLUDE REFERENCE TO CHEMICAL TEST REFUSAL (MCGRAIL)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `The Defendant respectfully moves in limine to prohibit the Commonwealth from introducing any evidence, comment, or argument regarding the Defendant's refusal to submit to chemical testing.`,
          statementOfFacts: `Following arrest, the Defendant declined to submit to a chemical breath or blood test.`,
          legalArgument: `Under Article 12 of the Massachusetts Declaration of Rights and Commonwealth v. McGrail, 419 Mass. 774 (1995), evidence of a defendant's refusal to submit to a breath test is strictly inadmissible at trial because compelling a choice between submitting or having refusal used as consciousness of guilt violates self-incrimination protections.`,
          conclusion: `WHEREFORE, the Defendant requests that the Court order all testimony or references to test refusal excluded.`,
          statutoryCitations: ['Commonwealth v. McGrail, 419 Mass. 774 (1995)', 'Article 12, MA Declaration of Rights', 'M.G.L. c. 90 § 24(1)(f)'],
          signatureBlock: attyBlock
        };

      case 'MOTION_EXCLUDE_DRUG_CERTIFICATE_MELENDEZ_DIAZ':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION TO EXCLUDE DRUG CERTIFICATE & DEMAND LIVE ANALYST TESTIMONY',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `The Defendant moves to exclude any state crime lab drug certificate of analysis unless the Commonwealth produces the analyzing forensic chemist for live cross-examination at trial.`,
          statementOfFacts: `The Commonwealth seeks to introduce a state laboratory certificate of analysis regarding seized evidence in Case #${currentCase.caseNumber}.`,
          legalArgument: `Under Melendez-Diaz v. Massachusetts, 557 U.S. 305 (2009) and the Sixth Amendment Confrontation Clause, forensic certificates of analysis are testimonial evidence. Admitting a certificate without producing the analyst who performed the testing deprives the Defendant of constitutional confrontation rights.`,
          conclusion: `WHEREFORE, the Defendant requests that the certificate be excluded unless the live analyst testifies.`,
          statutoryCitations: ['Melendez-Diaz v. Massachusetts, 557 U.S. 305 (2009)', 'Sixth Amendment, U.S. Const.', 'Article 12, MA Declaration of Rights'],
          signatureBlock: attyBlock
        };

      case 'MOTION_DISMISS_INSUFFICIENT_PROBABLE_CAUSE':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION TO DISMISS COMPLAINT FOR INSUFFICIENT PROBABLE CAUSE (DIBENNADETTO)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `The Defendant respectfully moves to dismiss the criminal complaint for lack of probable cause pursuant to Commonwealth v. DiBennadetto.`,
          statementOfFacts: `The four corners of the police application for criminal complaint in Case #${currentCase.caseNumber} fail to set forth reasonably trustworthy information establishing that the Defendant operated a vehicle while impaired on a public way.`,
          legalArgument: `Under Commonwealth v. DiBennadetto, 436 Mass. 310 (2002) and Commonwealth v. McCarthy, 385 Mass. 160 (1982), a motion to dismiss lies where the complaint application fails to establish probable cause on each essential element of the offense charged.`,
          conclusion: `WHEREFORE, the Defendant requests that this Honorable Court DISMISS the complaint with prejudice.`,
          statutoryCitations: ['Commonwealth v. DiBennadetto, 436 Mass. 310 (2002)', 'Commonwealth v. McCarthy, 385 Mass. 160 (1982)'],
          signatureBlock: attyBlock
        };

      case 'MOTION_FRANKS_HEARING_CONTRADICTORY_NARRATIVE':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION FOR FRANKS HEARING (POLICE NARRATIVE CONTRADICTS SEQUENCE LOG)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `The Defendant moves for an evidentiary Franks hearing to challenge false statements and material omissions made by the arresting officer in police affidavits.`,
          statementOfFacts: `A comparison between the officer's written narrative and the automated electronic Draeger/booking timestamp log reveals a direct conflict in the timeline regarding the observation window and arrest sequence.`,
          legalArgument: `Under Franks v. Delaware, 438 U.S. 154 (1978) and Commonwealth v. Long, 454 Mass. 542 (2009), where a defendant makes a substantial preliminary showing that a false statement or material omission was included in a police report recklessly or intentionally, the Fourth Amendment mandates an evidentiary hearing.`,
          conclusion: `WHEREFORE, the Defendant requests that this Court order an evidentiary Franks hearing.`,
          statutoryCitations: ['Franks v. Delaware, 438 U.S. 154 (1978)', 'Commonwealth v. Long, 454 Mass. 542 (2009)'],
          signatureBlock: attyBlock
        };

      case 'SUPPORTING_MEMORANDUM_OF_LAW':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'MEMORANDUM OF LAW IN SUPPORT OF DEFENDANT PRE-TRIAL MOTIONS',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `MEMORANDUM OF LAW IN SUPPORT OF DEFENDANT'S MOTION TO SUPPRESS AND DISMISS`,
          statementOfFacts: `STATEMENT OF FACTS (PULLED FROM CITATION INDEX):\n1. Stop & Initial Contact: On ${currentCase.incidentDate}, ${currentCase.arrestingAgency} officers stopped Defendant ${currentCase.clientName}.\n2. Identified Procedural Errors:\n${identifiedErrors.map((e, idx) => `   (${idx + 1}) [${e.severity}] ${e.title} - ${e.pageParagraphRef.documentName || 'Police Report'}, Page ${e.pageParagraphRef.pageNumber}, ¶ ${e.pageParagraphRef.paragraphNumber}: "${e.verbatimQuote}"`).join('\n')}`,
          legalArgument: `LEGAL ARGUMENT:\nI. PROCEDURAL DEFECTS MANDATE SUPPRESSION UNDER MASSACHUSETTS LAW.\nAs established by the record citations above, police officers failed to strictly adhere to mandatory Massachusetts state regulations and constitutional standards.\n\nII. THE COMMONWEALTH CANNOT MEET ITS BURDEN OF PROOF BEYOND A REASONABLE DOUBT.\nUnder 501 CMR 2.13 and Commonwealth v. Pierre, non-compliance with observation protocols invalidates testing.`,
          conclusion: `CONCLUSION:\nRespectfully submitted, Defendant requests that the Court allowance of the pending motions.`,
          statutoryCitations: ['Mass. R. Crim. P. 13', '501 CMR 2.13', 'Article 14, MA Declaration of Rights'],
          signatureBlock: attyBlock
        };

      case 'SUPPORTING_ATTORNEY_INVESTIGATOR_AFFIDAVIT':
        return {
          id: `draft_${Date.now()}`,
          type: 'AFFIDAVIT',
          title: 'ATTORNEY / INVESTIGATOR DISCOVERY AFFIDAVIT WITH PINPOINT RECORD CITES',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `SWORN DISCOVERY AFFIDAVIT IN SUPPORT OF DEFENDANT MOTION TO SUPPRESS`,
          statementOfFacts: `I, Elena Rostova, Esq. / Lead Investigator, under the pains and penalties of perjury, depose and state:\n1. I am counsel/investigator of record for ${currentCase.clientName} in Case #${currentCase.caseNumber}.\n2. I have personally reviewed the discovery documents produced by the Commonwealth.\n3. Pinpoint Record Findings:\n${identifiedErrors.map((e, idx) => `   - Item ${idx + 1}: ${e.pageParagraphRef.documentName || 'Discovery'}, Page ${e.pageParagraphRef.pageNumber}, ¶ ${e.pageParagraphRef.paragraphNumber} states: "${e.verbatimQuote}"`).join('\n')}`,
          legalArgument: `Signed under the pains and penalties of perjury this _____ day of ____________, 2026.`,
          conclusion: `_________________________________________\nDeclarant Signature`,
          statutoryCitations: ['Mass. R. Crim. P. 13(a)(2)'],
          signatureBlock: attyBlock
        };

      case 'SUPPORTING_PROPOSED_ORDER':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'PROPOSED JUDICIAL ORDER ALLOWING DEFENDANT MOTION TO SUPPRESS',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `PROPOSED ORDER OF THE COURT`,
          statementOfFacts: `Upon consideration of the Defendant's Motion to Suppress evidence obtained on ${currentCase.incidentDate}, the memorandum of law, and arguments of counsel, it is hereby ORDERED:`,
          legalArgument: `1. The Defendant's Motion to Suppress Breath Test Results / Evidence is hereby ALLOWED.\n2. All breath test results, observations, and derivative evidence obtained on ${currentCase.incidentDate} are EXCLUDED from trial.`,
          conclusion: `SO ORDERED:\n\n_________________________________________\nPresiding Justice, Massachusetts District Court\nDate: ____________________`,
          statutoryCitations: ['Mass. R. Crim. P. 13'],
          signatureBlock: attyBlock
        };

      case 'SUPPORTING_UNDISPUTED_FACTS_STATEMENT':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'DEFENDANT STATEMENT OF UNDISPUTED FACTS WITH VERBATIM RECORD CITES',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `STATEMENT OF UNDISPUTED FACTS FOR PRE-TRIAL HEARING`,
          statementOfFacts: `The Defendant submits the following statement of undisputed facts backed by verbatim record quotes:\n${identifiedErrors.map((e, idx) => `Fact ${idx + 1}: On ${currentCase.incidentDate}, ${e.description}\nRecord Citation: ${e.pageParagraphRef.documentName || 'Police Report'}, Page ${e.pageParagraphRef.pageNumber}, ¶ ${e.pageParagraphRef.paragraphNumber} ("${e.verbatimQuote}")`).join('\n\n')}`,
          legalArgument: `These facts stand uncontradicted on the face of the Commonwealth's own discovery filings.`,
          conclusion: `Submitted in support of pre-trial motions.`,
          statutoryCitations: ['Mass. R. Crim. P. 13'],
          signatureBlock: attyBlock
        };

      case 'WORKPRODUCT_INVESTIGATIVE_REPORT_ARC_FORMAT':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'ARC INVESTIGATIVE REPORT ON PROCEDURAL DEFECTS & EXCLUSION STRATEGY',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `ARC INVESTIGATIONS & CONSULTING - FORENSIC AUDIT REPORT`,
          statementOfFacts: `CASE: ${currentCase.clientName} | CHARGE: ${currentCase.charge} | AGENCY: ${currentCase.arrestingAgency}\n\nPROCEDURAL DEFECT AUDIT MATRIX:\n${identifiedErrors.map((e, idx) => `[FINDING #${idx + 1}] SEVERITY: ${e.severity} | CATEGORY: ${e.category}\nTitle: ${e.title}\nRecord Pinpoint: Page ${e.pageParagraphRef.pageNumber}, ¶ ${e.pageParagraphRef.paragraphNumber} (${e.pageParagraphRef.documentName || 'Discovery'})\nVerbatim Quote: "${e.verbatimQuote}"\nViolation: ${e.standardViolated}\nExclusion Strategy: ${e.evidentiaryExclusionStrategy}`).join('\n\n')}`,
          legalArgument: `RECOMMENDED DEFENSE STRATEGY:\nFile Rule 13 Motions to Suppress based on identified Critical/High severity procedural defects above.`,
          conclusion: `Prepared by ARC Investigations & Consulting. Confidential Work Product.`,
          statutoryCitations: ['ARC Investigation Audit Protocol', '501 CMR 2.00'],
          signatureBlock: attyBlock
        };

      case 'WORKPRODUCT_MASTER_RECONCILED_TIMELINE':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'MASTER RECONCILED TIMELINE: NARRATIVE vs. DRAEGER LOG vs. BOOKING CLOCK',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `MASTER RECONCILED EVENT TIMELINE AUDIT`,
          statementOfFacts: `RECONCILED CHRONOLOGY:\n- 01:10 AM: Traffic Stop Initiated (Police Report Page 1, ¶ 2)\n- 01:15 AM: Purported Observation Window Start (Police Report Page 2, ¶ 1)\n- 01:22 AM: Booking Desk Entry & Paperwork Retrieval (Booking Video Log Timestamp)\n- 01:30 AM: Draeger Sequence Initiated (Draeger Ticket #${currentCase.caseNumber})\n- Gap Analysis: 8 minutes of unobserved typing/movement during mandatory 15-minute window.`,
          legalArgument: `Timeline contradictions demonstrate non-compliance with continuous 15-minute observation rules.`,
          conclusion: `Use timeline grid for cross-examination of arresting officer.`,
          statutoryCitations: ['Draeger Alcotest 9510 Internal Clock Logs'],
          signatureBlock: attyBlock
        };

      case 'WORKPRODUCT_OFFICER_CREDIBILITY_CROSS_OUTLINE':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'OFFICER CREDIBILITY & CROSS-EXAMINATION TRIAL OUTLINE',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `CROSS-EXAMINATION OUTLINE FOR ARRESTING OFFICER`,
          statementOfFacts: `LINE 1: NHTSA SFST MANUAL DEVIATION\nQ: Officer, you are trained according to NHTSA standards?\nQ: The NHTSA manual states instructions must be given verbatim?\nQ: On page ${primaryError?.pageParagraphRef?.pageNumber || 2}, you stated you modified the line-walk instruction?\n\nLINE 2: OBSERVATION WINDOW INTERRUPTION\nQ: You agree 501 CMR 2.13 requires 15 continuous minutes of uninterrupted visual observation?\nQ: While the subject sat in the room, you were typing on your laptop?`,
          legalArgument: `Impeachment strategy based on Mass. G. Evid. § 611 and NHTSA manual standard procedures.`,
          conclusion: `Cross-examination outline for pre-trial motion or trial.`,
          statutoryCitations: ['Mass. G. Evid. § 611', 'NHTSA SFST Manual'],
          signatureBlock: attyBlock
        };

      case 'WORKPRODUCT_RETROGRADE_BAC_ANALYSIS_MEMO':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'RETROGRADE BAC ANALYSIS MEMORANDUM (ELIMINATION BAND & CAVEATS)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `RETROGRADE EXTRAPOLATION BAC ANALYSIS`,
          statementOfFacts: `Reported BAC Test Result: ${currentCase.labResultData?.components?.[0]?.detectedValue || 0.09} g/100mL at test time.\nTime of Operation: 01:10 AM | Time of Breath Test: 02:15 AM (Delay: 65 minutes).\nStandard Elimination Rate Band: 0.015 - 0.020 g%/hr.\nEstimated BAC Range at Operation: 0.073% to 0.081% g/100mL.`,
          legalArgument: `Under Commonwealth v. Colturi, 448 Mass. 809 (2007), where a test is administered over two hours post-operation, expert toxicological retrograde extrapolation is required. Because the lower bound of the elimination band (0.073%) falls below 0.08%, the Commonwealth cannot prove statutory OUI beyond a reasonable doubt without expert testimony.`,
          conclusion: `Work product for defense toxicologist consultation.`,
          statutoryCitations: ['Commonwealth v. Colturi, 448 Mass. 809 (2007)'],
          signatureBlock: attyBlock
        };

      case 'WORKPRODUCT_CHAIN_OF_CUSTODY_DEFECT_MEMO':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'CHAIN-OF-CUSTODY DEFECT MEMO FOR c. 94C DRUG / BLOOD CERTIFICATE',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `CHAIN OF CUSTODY DEFECT MEMORANDUM`,
          statementOfFacts: `Sample Type: ${currentCase.labResultData?.sampleType || 'Blood'} | Certificate #${currentCase.labResultData?.labCertificateId || '2026-LAB-019'}\nDays Elapsed Between Collection and Lab Receipt: ${currentCase.labResultData?.chainOfCustodyDelayDays || 42} Days.\nDefects Identified: Unexplained 42-day storage delay without refrigeration temperature logs or seal verification signatures.`,
          legalArgument: `Under M.G.L. c. 22C § 39 and Commonwealth v. Johnson, 481 Mass. 710 (2019), significant unexplained gaps in sample chain of custody compromise the foundational integrity of forensic laboratory results.`,
          conclusion: `Foundation challenge to lab result admissibility.`,
          statutoryCitations: ['M.G.L. c. 22C § 39', 'Commonwealth v. Johnson, 481 Mass. 710 (2019)'],
          signatureBlock: attyBlock
        };

      case 'DISCOVERY_RULE_14_DEMAND_LETTER':
        return {
          id: `draft_${Date.now()}`,
          type: 'FOIA_REQUEST',
          title: 'MASS. R. CRIM. P. 14 MANDATORY DISCOVERY DEMAND (EFF. MARCH 1, 2025)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `MANDATORY DISCOVERY DEMAND PURSUANT TO MASS. R. CRIM. P. 14 (AMENDED MARCH 1, 2025)`,
          statementOfFacts: `To District Attorney / Police Prosecutor:\nCounsel for Defendant ${currentCase.clientName} hereby demands production of all mandatory discovery under Mass. R. Crim. P. 14(a)(1), including:`,
          legalArgument: `1. All police reports, dispatch logs, CAD messages, and booking recordings.\n2. Raw digital video files from cruiser dashcam and officer body-worn cameras.\n3. Complete instrument diagnostic logs and simulator solution Certificates of Analysis for Draeger Alcotest 9510.\n4. Statements of all prosecution witnesses and exculpatory Brady/Giglio material.`,
          conclusion: `Compliance is required within fourteen (14) days pursuant to Mass. R. Crim. P. 14.`,
          statutoryCitations: ['Mass. R. Crim. P. 14 (Amended March 1, 2025)'],
          signatureBlock: attyBlock
        };

      case 'DISCOVERY_PUBLIC_RECORDS_FOIA_SOP_REQUEST':
        return {
          id: `draft_${Date.now()}`,
          type: 'FOIA_REQUEST',
          title: 'PUBLIC RECORDS REQUEST UNDER M.G.L. c. 66 § 10 (POLICE DEPARTMENT SOPS)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `PUBLIC RECORDS REQUEST - M.G.L. c. 66 § 10`,
          statementOfFacts: `To Records Access Officer (RAO), ${currentCase.arrestingAgency}:\n\nPursuant to M.G.L. c. 66 § 10, undersigned counsel requests copies of the following public records:`,
          legalArgument: `1. Department Standard Operating Procedures (SOPs) regarding Motor Vehicle Stops, OUI Investigations, and SFST Administration.\n2. Department policy on Cruiser Camera / Body-Worn Camera retention and upload protocols.\n3. Calibration and maintenance logs for radar/lidar speed measurement units used on ${currentCase.incidentDate}.`,
          conclusion: `Please provide these public records within ten (10) business days as mandated by M.G.L. c. 66 § 10.`,
          statutoryCitations: ['M.G.L. c. 66 § 10', 'M.G.L. c. 4 § 7(26)'],
          signatureBlock: attyBlock
        };

      case 'DISCOVERY_OAT_RECORDS_REQUEST_9510':
        return {
          id: `draft_${Date.now()}`,
          type: 'FOIA_REQUEST',
          title: 'OFFICE OF ALCOHOL TESTING (OAT) RECORDS REQUEST FOR DRAEGER 9510',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `RECORDS DEMAND TO OFFICE OF ALCOHOL TESTING (OAT)`,
          statementOfFacts: `To Director, Office of Alcohol Testing (OAT), Massachusetts State Police Crime Laboratory:\n\nUndersigned counsel requests certified records regarding Draeger Alcotest 9510 instrument utilized in Case #${currentCase.caseNumber}:`,
          legalArgument: `1. Annual Certification and Maintenance History for the instrument.\n2. Solution Certificate of Analysis for wet bath simulator solution lot used on ${currentCase.incidentDate}.\n3. Breath Test Operator Certification and recertification records for the administering officer under 501 CMR 2.00.`,
          conclusion: `Request filed in connection with pending Massachusetts District Court proceedings.`,
          statutoryCitations: ['501 CMR 2.00', 'M.G.L. c. 90 § 24K'],
          signatureBlock: attyBlock
        };

      case 'DISCOVERY_VIDEO_PRESERVATION_LETTER':
        return {
          id: `draft_${Date.now()}`,
          type: 'FOIA_REQUEST',
          title: 'FORMAL EVIDENCE PRESERVATION LETTER FOR DASHCAM & BOOKING VIDEO',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `EMERGENCY EVIDENCE PRESERVATION NOTICE`,
          statementOfFacts: `To Chief of Police, ${currentCase.arrestingAgency}:\n\nPLEASE TAKE NOTICE that your department is commanded to immediately PRESERVE and LOCK against auto-deletion all audio and video recordings pertaining to ${currentCase.clientName} recorded on ${currentCase.incidentDate}.`,
          legalArgument: `Failure to preserve cruiser camera, body camera, and booking room video after receipt of this notice constitutes spoliation of evidence under Commonwealth v. Heath, 89 Mass. App. Ct. 328 (2016) and will result in sanctions or dismissal.`,
          conclusion: `Immediate written confirmation of video preservation is requested.`,
          statutoryCitations: ['Commonwealth v. Heath, 89 Mass. App. Ct. 328 (2016)'],
          signatureBlock: attyBlock
        };

      case 'CLIENT_PLAIN_LANGUAGE_CASE_SUMMARY':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'CONFIDENTIAL CLIENT CASE DEFENSE SUMMARY & ANALYSIS',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `CONFIDENTIAL CLIENT ADVISORY - CASE DEFENSE EVALUATION`,
          statementOfFacts: `Dear ${currentCase.clientName},\n\nWe have completed our forensic investigation and legal audit of your pending OUI case in ${currentCase.court}.\n\nKEY STRENGTHS OF YOUR DEFENSE:\n1. Procedural Defects: We identified ${identifiedErrors.length} procedural errors in the police reports, including an interrupted 15-minute breath test observation window.\n2. Legal Grounds for Suppression: Under Massachusetts regulations (501 CMR 2.13), when an officer types on a computer or turns away during the waiting period, the breath test result can be suppressed.\n3. Next Steps: We are filing pre-trial motions to challenge the evidence before trial.`,
          legalArgument: `WHAT TO EXPECT AT COURT:\nYou must attend all court hearings on time. We will handle arguing the motions to the judge.`,
          conclusion: `Please contact our office if you have any questions before our next court date.`,
          statutoryCitations: ['Client Defense Advisory Protocol'],
          signatureBlock: attyBlock
        };

      case 'CLIENT_ENGAGEMENT_STATUS_LETTER_DATES':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'CLIENT ENGAGEMENT STATUS LETTER & UPCOMING COURT DATES SCHEDULE',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `DEFENSE STATUS UPDATE & COURT SCHEDULE`,
          statementOfFacts: `Dear ${currentCase.clientName},\n\nThis letter provides an update on your legal representation for Case #${currentCase.caseNumber} in ${currentCase.court}.\n\nUPCOMING COURT SCHEDULE (NEXT FOUR DATES):\n1. Pre-Trial Conference: Next Month (Mandatory Attendance)\n2. Compliance & Election Date: Following Month\n3. Motion to Suppress Hearing: Scheduled\n4. Trial / Final Disposition: Scheduled`,
          legalArgument: `DEFENSE STRATEGY SUMMARY:\nWe will challenge the validity of the exit order and breath test procedures.`,
          conclusion: `Sincerely, Elena Rostova, Esq.`,
          statutoryCitations: ['MA Rules of Professional Conduct 1.4'],
          signatureBlock: attyBlock
        };

      case 'CLIENT_INDEPENDENT_PHYSICIAN_BLOOD_ADVISORY':
        return {
          id: `draft_${Date.now()}`,
          type: 'MEMORANDUM',
          title: 'STATUTORY ADVISORY: RIGHT TO INDEPENDENT MEDICAL EXAMINATION c. 90 § 24(1)(e)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `STATUTORY ADVISORY REGARDING M.G.L. c. 90 § 24(1)(e) MEDICAL EXAM RIGHTS`,
          statementOfFacts: `Under M.G.L. c. 90 § 24(1)(e), every person arrested for operating under the influence has an absolute statutory right to be informed immediately of their right to be examined by an independent physician of their own choosing and to have a blood test conducted.`,
          legalArgument: `In Commonwealth v. King, 429 Mass. 169 (1999), the Supreme Judicial Court held that police failure to inform an arrestee of their independent medical examination rights deprives them of crucial exculpatory evidence and supports suppression or dismissal of charges.`,
          conclusion: `We are analyzing whether officers violated your statutory medical rights during booking.`,
          statutoryCitations: ['M.G.L. c. 90 § 24(1)(e)', 'Commonwealth v. King, 429 Mass. 169 (1999)'],
          signatureBlock: attyBlock
        };

      case 'ADMIN_DISCOVERY_COMPLIANCE_CERTIFICATE':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'DEFENDANT CERTIFICATE OF DISCOVERY COMPLIANCE (RULE 14)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `CERTIFICATE OF DISCOVERY COMPLIANCE PURSUANT TO MASS. R. CRIM. P. 14(a)(3)`,
          statementOfFacts: `Undersigned counsel for Defendant ${currentCase.clientName} hereby certifies that defense counsel has complied with all reciprocal discovery obligations under Mass. R. Crim. P. 14.`,
          legalArgument: `Counsel has disclosed all witness lists, defense expert disclosures, and physical evidence intended for introduction at trial.`,
          conclusion: `Filed under the pains and penalties of perjury this ${today}.`,
          statutoryCitations: ['Mass. R. Crim. P. 14(a)(3)'],
          signatureBlock: attyBlock
        };

      case 'ADMIN_MOTION_FOR_CONTINUANCE':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'MOTION FOR CONTINUANCE (OUTSTANDING MANDATORY DISCOVERY)',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `The Defendant respectfully moves this Honorable Court to continue the scheduled hearing date due to outstanding mandatory discovery.`,
          statementOfFacts: `The Commonwealth has not yet produced raw booking video recordings or Draeger maintenance logs requested in defense Rule 14 demands.`,
          legalArgument: `Under Mass. R. Crim. P. 10 and District Court Rule 3, a continuance is required to ensure defense counsel can adequately prepare and protect the Defendant's constitutional right to effective assistance of counsel.`,
          conclusion: `WHEREFORE, the Defendant requests that the Court continue the hearing for thirty (30) days.`,
          statutoryCitations: ['Mass. R. Crim. P. 10', 'District Court Rule 3'],
          signatureBlock: attyBlock
        };

      case 'ADMIN_WITNESS_SUMMONS_SUBPOENA_BTO_ANALYST':
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'WITNESS SUMMONS / SUBPOENA DUCES TECUM FOR BTO / LAB ANALYST',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `WITNESS SUBPOENA DUCES TECUM PURSUANT TO MASS. R. CRIM. P. 17`,
          statementOfFacts: `TO: Breath Test Operator / Forensic Chemist, ${currentCase.arrestingAgency} / State Crime Lab.\n\nYOU ARE HEREBY COMMANDED to appear before the ${currentCase.court} on the hearing date and bring with you all original calibration, batch maintenance, and simulator solution logs.`,
          legalArgument: `Issued pursuant to Mass. R. Crim. P. 17 and M.G.L. c. 233 § 1.`,
          conclusion: `HEREOF FAIL NOT AT YOUR PERIL.`,
          statutoryCitations: ['Mass. R. Crim. P. 17', 'M.G.L. c. 233 § 1'],
          signatureBlock: attyBlock
        };

      default:
        return {
          id: `draft_${Date.now()}`,
          type: 'MOTION',
          title: 'DEFENDANT COURT PLEADING',
          courtName: courtUpper,
          docketNumber: docketUpper,
          clientName: currentCase.clientName,
          defendantName: clientUpper,
          prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
          date: today,
          reliefRequested: `Relief requested for ${currentCase.clientName}.`,
          statementOfFacts: `Facts statement.`,
          legalArgument: `Legal argument.`,
          conclusion: `Conclusion.`,
          statutoryCitations: ['Mass. R. Crim. P. 13'],
          signatureBlock: attyBlock
        };
    }
  };

  const [activeDraft, setActiveDraft] = useState<CourtPleadingDraft>(() =>
    buildDraftForTemplate('MOTION_SUPPRESS_BREATH_OBSERVATION')
  );

  const [isAttorneySettingsOpen, setIsAttorneySettingsOpen] = useState(false);

  const handleSavedAttorneyInfo = (updatedInfo: AttorneyInfo) => {
    setActiveDraft((prev) => ({
      ...prev,
      signatureBlock: updatedInfo
    }));
  };

  const handleAttorneyInfoChange = (field: keyof AttorneyInfo, value: string) => {
    const updatedAtty = {
      ...activeDraft.signatureBlock,
      [field]: value
    };
    setActiveDraft({
      ...activeDraft,
      signatureBlock: updatedAtty
    });
    saveAttorneyInfo(updatedAtty);
  };

  const handleSelectTemplateOption = (option: DocumentTemplateOption) => {
    setSelectedTemplateKey(option.key);
    setActiveDraft(buildDraftForTemplate(option.key));
  };

  // Copy pleading text to clipboard
  const handleCopyText = () => {
    const text = `
================================================================================
ARC INVESTIGATIONS & CONSULTING • DEFENSE LEGAL WORK PRODUCT
================================================================================

${activeDraft.courtName}
${activeDraft.docketNumber}

${activeDraft.prosecutorAgency}
v.
${activeDraft.defendantName},
Defendant.

${activeDraft.title}

I. RELIEF REQUESTED
${activeDraft.reliefRequested}

II. STATEMENT OF FACTS
${activeDraft.statementOfFacts}

III. LEGAL ARGUMENT & AUTHORITIES
${activeDraft.legalArgument}

IV. CONCLUSION
${activeDraft.conclusion}

Respectfully submitted,
${activeDraft.signatureBlock.attorneyName} (${activeDraft.signatureBlock.bboNumber})
${activeDraft.signatureBlock.firmName}
${activeDraft.signatureBlock.address}
Phone: ${activeDraft.signatureBlock.phone}
Email: ${activeDraft.signatureBlock.email}
Date: ${activeDraft.date}
`;
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
  };

  // Export reference draft. Filing must occur through Motion & Legal after authority verification.
  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: 'ARC INVESTIGATIONS & CONSULTING • DEFENSE LEGAL WORK PRODUCT',
              heading: HeadingLevel.HEADING_3,
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'COMMONWEALTH OF MASSACHUSETTS',
              heading: HeadingLevel.HEADING_2,
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              text: activeDraft.courtName,
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              text: activeDraft.docketNumber,
              alignment: AlignmentType.RIGHT
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({ text: `${activeDraft.prosecutorAgency}\n`, bold: true }),
                new TextRun({ text: 'v.\n', italics: true }),
                new TextRun({ text: `${activeDraft.defendantName},\n`, bold: true }),
                new TextRun({ text: 'Defendant.\n' })
              ]
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: activeDraft.title,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'I. RELIEF REQUESTED',
              heading: HeadingLevel.HEADING_3
            }),
            new Paragraph({ text: activeDraft.reliefRequested }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'II. STATEMENT OF FACTS',
              heading: HeadingLevel.HEADING_3
            }),
            new Paragraph({ text: activeDraft.statementOfFacts }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'III. LEGAL ARGUMENT & AUTHORITIES',
              heading: HeadingLevel.HEADING_3
            }),
            new Paragraph({ text: activeDraft.legalArgument }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'IV. CONCLUSION',
              heading: HeadingLevel.HEADING_3
            }),
            new Paragraph({ text: activeDraft.conclusion }),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Respectfully submitted,\n', italics: true }),
                new TextRun({ text: `${activeDraft.signatureBlock.attorneyName}\n`, bold: true }),
                new TextRun({ text: `${activeDraft.signatureBlock.bboNumber}\n` }),
                new TextRun({ text: `${activeDraft.signatureBlock.firmName}\n` }),
                new TextRun({ text: `${activeDraft.signatureBlock.address}\n` }),
                new TextRun({ text: `Tel: ${activeDraft.signatureBlock.phone} | Email: ${activeDraft.signatureBlock.email}\n` }),
                new TextRun({ text: `Date: ${activeDraft.date}` })
              ]
            })
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDraft.type}_${currentCase.clientName.replace(/\s+/g, '_')}_${activeDraft.docketNumber.replace(/[^a-zA-Z0-9]/g, '')}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(activeDraft, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${activeDraft.type}_${activeDraft.docketNumber.replace(/[^a-zA-Z0-9]/g, '')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeDraft.title}</title>
  <style>
    body { font-family: 'Times New Roman', serif; margin: 40px; color: #111; line-height: 1.6; }
    .header { text-align: center; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; }
    .caption { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 25px; font-family: monospace; }
    .caption-left { width: 65%; border-right: 1px solid #000; padding-right: 15px; }
    .caption-right { text-align: right; }
    h1 { text-align: center; font-size: 16px; margin-bottom: 25px; text-transform: uppercase; font-family: sans-serif; }
    h2 { font-size: 14px; text-transform: uppercase; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 4px; font-family: sans-serif; }
    p { font-size: 13px; text-align: justify; }
    .signature { margin-top: 40px; font-size: 13px; border-top: 1px solid #ddd; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div>COMMONWEALTH OF MASSACHUSETTS</div>
    <div>${activeDraft.courtName}</div>
  </div>
  <div class="caption">
    <div class="caption-left">
      <div><strong>${activeDraft.prosecutorAgency}</strong></div>
      <div style="font-style: italic;">Complainant / Prosecution</div>
      <br/>
      <div>v.</div>
      <br/>
      <div><strong>${activeDraft.defendantName}</strong></div>
      <div style="font-style: italic;">Defendant</div>
    </div>
    <div class="caption-right">
      <div><strong>DOCKET NO. ${activeDraft.docketNumber}</strong></div>
      <div>MASS. R. CRIM. P. 13</div>
    </div>
  </div>
  <h1>${activeDraft.title}</h1>

  <h2>I. Relief Requested</h2>
  <p>${activeDraft.reliefRequested}</p>

  <h2>II. Statement of Facts</h2>
  <p style="white-space: pre-wrap;">${activeDraft.statementOfFacts}</p>

  <h2>III. Legal Argument & Statutory Authorities</h2>
  <p style="white-space: pre-wrap;">${activeDraft.legalArgument}</p>

  <h2>IV. Conclusion</h2>
  <p>${activeDraft.conclusion}</p>

  <div class="signature">
    <p><em>Respectfully submitted by Counsel for Defendant,</em></p>
    <p><strong>${activeDraft.signatureBlock.attorneyName}</strong> (${activeDraft.signatureBlock.bboNumber})</p>
    <p>${activeDraft.signatureBlock.firmName}</p>
    <p>${activeDraft.signatureBlock.address}</p>
    <p>Tel: ${activeDraft.signatureBlock.phone} | Email: ${activeDraft.signatureBlock.email}</p>
    <p>Date: ${activeDraft.date}</p>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDraft.type}_${activeDraft.docketNumber.replace(/[^a-zA-Z0-9]/g, '')}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const pleadingFileInputRef = useRef<HTMLInputElement>(null);

  const handlePleadingFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'json') {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        if (json.title && json.reliefRequested) {
          setActiveDraft({ ...activeDraft, ...json });
        }
      } catch (err) {
        console.error('Failed to parse uploaded JSON pleading:', err);
      }
    } else {
      const text = await file.text();
      if (text) {
        setActiveDraft({
          ...activeDraft,
          statementOfFacts: activeDraft.statementOfFacts + `\n\n[Uploaded Source Document: ${file.name}]\n` + text.slice(0, 1500)
        });
      }
    }
    e.target.value = '';
  };

  // Filter templates
  const filteredTemplates = DOCUMENT_TEMPLATES.filter((tmpl) => {
    const matchesCategory = selectedCategory === 'ALL' || tmpl.category === selectedCategory;
    const matchesSearch =
      searchQuery === '' ||
      tmpl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tmpl.shortDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tmpl.statutoryCitations.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      {/* Header Bar with ARC Logo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 print:hidden">
        <div className="flex items-center space-x-3">
          <ArcLogo variant="full" size="md" />
          <div className="border-l border-slate-300 pl-3">
            <h3 className="text-lg font-bold text-slate-900">Legacy Candidate Motion Reference — NOT FOR FILING</h3>
            <p className="text-xs text-slate-500">
              Massachusetts District Court Motions, Supporting Papers, Work Product &amp; Administrative Filings
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            type="file"
            ref={pleadingFileInputRef}
            onChange={handlePleadingFileUpload}
            accept=".pdf,.json,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.bmp,.docx,.txt"
            className="hidden"
          />
          <button
            onClick={() => setIsAttorneySettingsOpen(true)}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold rounded-lg border border-blue-300 transition-colors flex items-center shadow-2xs"
            title="Configure Law Office Info & Digital Signature"
          >
            <PenTool className="w-3.5 h-3.5 mr-1.5 text-blue-700" />
            Attorney Settings &amp; Signature
          </button>
          <button
            onClick={() => pleadingFileInputRef.current?.click()}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload (PDF/JSON/HTML/Pic/DOCX)
          </button>
          <button
            onClick={handleCopyText}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center"
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Copy Text
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center shadow-xs"
            title="Reference only. Verify all facts and authorities in Motion & Legal before filing."
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print Reference Draft (NOT FOR FILING)
          </button>
          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center"
          >
            <FileJson className="w-3.5 h-3.5 mr-1.5" />
            JSON
          </button>
          <button
            onClick={handleExportHtml}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center"
          >
            <Code2 className="w-3.5 h-3.5 mr-1.5" />
            HTML
          </button>
          <button
            onClick={handleExportDocx}
            className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center shadow-xs"
          >
            <FileCode className="w-3.5 h-3.5 mr-1.5" />
            DOCX
          </button>
        </div>
      </div>

      {copiedNotification && (
        <div className="mb-4 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-semibold flex items-center">
          <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />
          Formatted court document text copied to clipboard!
        </div>
      )}

      {/* CATEGORY SELECTOR TABS & SEARCH BAR */}
      <div className="mb-6 space-y-3 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search 27 document templates by legal ground, case cite, or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <span className="text-xs font-bold text-slate-500">
            Showing {filteredTemplates.length} of {DOCUMENT_TEMPLATES.length} Options
          </span>
        </div>

        {/* 6 Category Filter Buttons */}
        <div className="flex flex-wrap gap-1.5 text-xs font-medium">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg border transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 font-bold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Templates ({DOCUMENT_TEMPLATES.length})
          </button>

          <button
            onClick={() => setSelectedCategory('PRETRIAL_MOTIONS')}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center ${
              selectedCategory === 'PRETRIAL_MOTIONS'
                ? 'bg-blue-700 text-white border-blue-800 font-bold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Scale className="w-3.5 h-3.5 mr-1" />
            1. Pre-Trial Motions (8)
          </button>

          <button
            onClick={() => setSelectedCategory('SUPPORTING_PAPERS')}
            className={`px-3.5 py-1.5 rounded-lg border transition-all flex items-center ${
              selectedCategory === 'SUPPORTING_PAPERS'
                ? 'bg-blue-700 text-white border-blue-800 font-bold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5 mr-1" />
            2. Supporting Papers (4)
          </button>

          <button
            onClick={() => setSelectedCategory('INVESTIGATION_WORKPRODUCT')}
            className={`px-3.5 py-1.5 rounded-lg border transition-all flex items-center ${
              selectedCategory === 'INVESTIGATION_WORKPRODUCT'
                ? 'bg-blue-700 text-white border-blue-800 font-bold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 mr-1" />
            3. Investigation &amp; Work Product (5)
          </button>

          <button
            onClick={() => setSelectedCategory('DISCOVERY_RECORDS')}
            className={`px-3.5 py-1.5 rounded-lg border transition-all flex items-center ${
              selectedCategory === 'DISCOVERY_RECORDS'
                ? 'bg-blue-700 text-white border-blue-800 font-bold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Folder className="w-3.5 h-3.5 mr-1" />
            4. Discovery &amp; Records (4)
          </button>

          <button
            onClick={() => setSelectedCategory('CLIENT_FACING')}
            className={`px-3.5 py-1.5 rounded-lg border transition-all flex items-center ${
              selectedCategory === 'CLIENT_FACING'
                ? 'bg-blue-700 text-white border-blue-800 font-bold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5 mr-1" />
            5. Client-Facing (3)
          </button>

          <button
            onClick={() => setSelectedCategory('COURT_ADMINISTRATIVE')}
            className={`px-3.5 py-1.5 rounded-lg border transition-all flex items-center ${
              selectedCategory === 'COURT_ADMINISTRATIVE'
                ? 'bg-blue-700 text-white border-blue-800 font-bold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5 mr-1" />
            6. Court Administrative (3)
          </button>
        </div>
      </div>

      {/* TEMPLATE CHOOSER CAROUSEL / GRID */}
      <div className="mb-6 max-h-56 overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs print:hidden">
        {filteredTemplates.map((option) => {
          const isSelected = selectedTemplateKey === option.key;
          return (
            <button
              key={option.key}
              onClick={() => handleSelectTemplateOption(option)}
              className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-blue-50/90 border-blue-500 font-semibold shadow-xs ring-1 ring-blue-500'
                  : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/90 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded-md">
                    {option.categoryLabel}
                  </span>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />}
                </div>
                <h5 className="font-bold text-slate-900 text-xs leading-snug">{option.title}</h5>
                <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-tight">{option.shortDesc}</p>
              </div>

              <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex flex-wrap gap-1">
                {option.statutoryCitations.slice(0, 2).map((cite, idx) => (
                  <span key={idx} className="text-[9px] font-mono text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    {cite}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Editor & Document Paper Preview Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Interactive Form Controls */}
        <div className="space-y-4 text-xs print:hidden">
          {/* ATTORNEY & COUNSEL INFORMATION FORM BLOCK */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center">
                <User className="w-3.5 h-3.5 mr-1.5 text-blue-700" />
                Attorney &amp; Firm Information
              </h4>
              <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Pleading Signature Block
              </span>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Attorney Name</label>
              <input
                type="text"
                value={activeDraft.signatureBlock.attorneyName}
                onChange={(e) => handleAttorneyInfoChange('attorneyName', e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-md bg-white font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">BBO / Bar Number</label>
                <input
                  type="text"
                  value={activeDraft.signatureBlock.bboNumber}
                  onChange={(e) => handleAttorneyInfoChange('bboNumber', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Filing Date</label>
                <input
                  type="date"
                  value={activeDraft.date}
                  onChange={(e) => setActiveDraft({ ...activeDraft, date: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Law Firm Name</label>
              <input
                type="text"
                value={activeDraft.signatureBlock.firmName}
                onChange={(e) => handleAttorneyInfoChange('firmName', e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-md bg-white"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Office Address</label>
              <input
                type="text"
                value={activeDraft.signatureBlock.address}
                onChange={(e) => handleAttorneyInfoChange('address', e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-md bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Phone Number</label>
                <input
                  type="text"
                  value={activeDraft.signatureBlock.phone}
                  onChange={(e) => handleAttorneyInfoChange('phone', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Email Address</label>
                <input
                  type="text"
                  value={activeDraft.signatureBlock.email}
                  onChange={(e) => handleAttorneyInfoChange('email', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <PenTool className="w-3.5 h-3.5 text-blue-700" />
                <span className="text-[11px] font-semibold text-slate-800">
                  {activeDraft.signatureBlock.signatureDataUrl ? 'Signature Attached' : 'No Signature Attached'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAttorneySettingsOpen(true)}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg transition-colors flex items-center"
              >
                Upload / Draw Signature
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Pleading Header &amp; Caption</h4>
              <span className="text-[10px] font-mono font-bold text-slate-500">Mass. R. Crim. P. 13 Format</span>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Court Name &amp; Division</label>
              <input
                type="text"
                value={activeDraft.courtName}
                onChange={(e) => setActiveDraft({ ...activeDraft, courtName: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Docket Number</label>
                <input
                  type="text"
                  value={activeDraft.docketNumber}
                  onChange={(e) => setActiveDraft({ ...activeDraft, docketNumber: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Defendant Name</label>
                <input
                  type="text"
                  value={activeDraft.defendantName}
                  onChange={(e) => setActiveDraft({ ...activeDraft, defendantName: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Document Title</label>
              <input
                type="text"
                value={activeDraft.title}
                onChange={(e) => setActiveDraft({ ...activeDraft, title: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md bg-white font-bold"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Relief &amp; Facts Section</h4>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">I. Relief Requested</label>
              <textarea
                rows={3}
                value={activeDraft.reliefRequested}
                onChange={(e) => setActiveDraft({ ...activeDraft, reliefRequested: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md bg-white leading-relaxed"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">II. Statement of Facts (Record Cites)</label>
              <textarea
                rows={5}
                value={activeDraft.statementOfFacts}
                onChange={(e) => setActiveDraft({ ...activeDraft, statementOfFacts: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md bg-white leading-relaxed font-sans text-xs"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Legal Argument &amp; Signatures</h4>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">III. Legal Argument &amp; Statutory Authorities</label>
              <textarea
                rows={6}
                value={activeDraft.legalArgument}
                onChange={(e) => setActiveDraft({ ...activeDraft, legalArgument: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md bg-white leading-relaxed font-mono text-[11px]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">IV. Conclusion</label>
              <textarea
                rows={2}
                value={activeDraft.conclusion}
                onChange={(e) => setActiveDraft({ ...activeDraft, conclusion: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md bg-white leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Right: Formal Court Preview Paper Rendering */}
        <div className="border border-slate-300 rounded-xl p-8 bg-white shadow-lg text-slate-900 font-serif leading-relaxed text-sm print:border-0 print:p-0 print:shadow-none">
          {/* HEADER ON TOP OF COURT PLEADING PREVIEW (NO LOGO) */}
          <div className="mb-6 pb-4 border-b border-slate-200 flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-600 tracking-wider uppercase">
              MASSACHUSETTS DISTRICT COURT PLEADING
            </span>
            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
              CONFIDENTIAL ATTORNEY WORK PRODUCT
            </span>
          </div>

          {/* MASSACHUSETTS COURT FORMAL CAPTION BLOCK */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="text-center font-bold tracking-wider text-xs uppercase mb-1">
              COMMONWEALTH OF MASSACHUSETTS
            </div>
            <div className="text-center font-bold text-xs uppercase mb-3">{activeDraft.courtName}</div>

            <div className="flex justify-between items-start text-xs font-mono font-bold">
              <div className="w-2/3 border-r border-slate-400 pr-4 space-y-1">
                <div>{activeDraft.prosecutorAgency},</div>
                <div className="pl-4 italic font-normal text-slate-600">Complainant / Prosecution</div>
                <div className="py-1">v.</div>
                <div>{activeDraft.defendantName},</div>
                <div className="pl-4 italic font-normal text-slate-600">Defendant.</div>
              </div>

              <div className="pl-4 space-y-1 text-right">
                <div>{activeDraft.docketNumber}</div>
                <div className="text-[10px] text-slate-500 font-sans uppercase">Mass. R. Crim. P. 13</div>
              </div>
            </div>
          </div>

          {/* DOCUMENT TITLE */}
          <h2 className="text-center font-sans font-bold text-base mb-6 text-slate-900 uppercase tracking-wide">
            {activeDraft.title}
          </h2>

          {/* RELIEF REQUESTED */}
          <div className="mb-4">
            <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-700 mb-1">
              I. RELIEF REQUESTED
            </h4>
            <p className="text-xs leading-relaxed text-slate-800">{activeDraft.reliefRequested}</p>
          </div>

          {/* STATEMENT OF FACTS */}
          <div className="mb-4">
            <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-700 mb-1">
              II. STATEMENT OF FACTS
            </h4>
            <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{activeDraft.statementOfFacts}</p>
          </div>

          {/* LEGAL ARGUMENT */}
          <div className="mb-4">
            <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-700 mb-1">
              III. LEGAL ARGUMENT &amp; STATUTORY AUTHORITIES
            </h4>
            <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">{activeDraft.legalArgument}</p>
          </div>

          {/* CONCLUSION */}
          <div className="mb-6">
            <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-700 mb-1">
              IV. CONCLUSION
            </h4>
            <p className="text-xs leading-relaxed text-slate-800">{activeDraft.conclusion}</p>
          </div>

          {/* STATUTORY CITATION MAP CHIPS */}
          <div className="mb-6 pt-3 border-t border-slate-200">
            <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Verified Massachusetts Legal Authority Map:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {activeDraft.statutoryCitations.map((cite, idx) => (
                <span key={idx} className="text-[10px] font-mono px-2 py-0.5 bg-blue-50 text-blue-800 rounded-md border border-blue-200">
                  {cite}
                </span>
              ))}
            </div>
          </div>

          {/* SIGNATURE BLOCK WITH FIRM LOGO FOOTER */}
          <div className="pt-4 border-t border-slate-300 font-sans text-xs space-y-1 text-slate-800">
            <p className="italic mb-2">Respectfully submitted by Counsel for Defendant,</p>
            {activeDraft.signatureBlock.signatureDataUrl && (
              <div className="my-2">
                <img
                  src={activeDraft.signatureBlock.signatureDataUrl}
                  alt="Attorney Signature"
                  className="max-h-16 max-w-xs object-contain"
                />
              </div>
            )}
            <p className="font-bold">{activeDraft.signatureBlock.attorneyName}</p>
            <p className="text-slate-600 font-mono text-[11px]">{activeDraft.signatureBlock.bboNumber}</p>
            <p className="text-slate-600">{activeDraft.signatureBlock.firmName}</p>
            <p className="text-slate-600">{activeDraft.signatureBlock.address}</p>
            <p className="text-slate-600">Tel: {activeDraft.signatureBlock.phone} | Email: {activeDraft.signatureBlock.email}</p>
            <p className="text-slate-500 text-[10px] pt-1">Date: {activeDraft.date}</p>
          </div>
        </div>
      </div>

      {/* Global Attorney Settings & Signature Modal */}
      <AttorneySettingsModal
        isOpen={isAttorneySettingsOpen}
        onClose={() => setIsAttorneySettingsOpen(false)}
        onSaved={handleSavedAttorneyInfo}
      />
    </div>
  );
};
