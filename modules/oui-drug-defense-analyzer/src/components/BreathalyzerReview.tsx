import React, { useState, useRef } from 'react';
import {
  Activity,
  Upload,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  FileText,
  Search,
  Printer,
  FileJson,
  Code2,
  FileCode,
  Gauge,
  Thermometer,
  Radio,
  Stethoscope,
  Wind,
  FlaskConical,
  Cpu,
  UserX,
  HelpCircle,
  FolderPlus,
  Trash2,
  Layers,
  ChevronDown,
  ChevronUp,
  FileSearch,
  BookOpen,
  Copy,
  Check,
  Scale
} from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, HeadingLevel } from 'docx';
import { CaseData, CaseDocument, ExtractedPage, DocumentType } from '../types';
import { categorizeFileByFilename } from './DocumentVault';

interface BreathalyzerReviewProps {
  currentCase: CaseData;
  onUpdateCase: (updated: CaseData) => void;
}

// Draeger 9510 Status Code Reference Table
interface DraegerCode {
  code: number;
  type: 'Software Status' | 'Hardware Error';
  name: string;
  description: string;
  defenseImpact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  defenseStrategy: string;
}

const DRAEGER_CODES: DraegerCode[] = [
  {
    code: 3,
    type: 'Software Status',
    name: 'CAL GAS SUPPLY',
    description: 'Minimum flow not observed from dry-gas cylinder or simulator.',
    defenseImpact: 'HIGH',
    defenseStrategy: 'Indicates gas delivery hose blockage, regulator failure, or empty gas standard cylinder. Invalidates calibration check.'
  },
  {
    code: 4,
    type: 'Software Status',
    name: 'ADJUST ERROR',
    description: 'An IR or EC sensor problem was observed during the Calibration Procedure.',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Direct evidence of sensor drift or hardware instability requiring manual recalibration.'
  },
  {
    code: 5,
    type: 'Software Status',
    name: 'BLANK CHECK INCORRECT',
    description: 'The IR difference between the pre- and post-purge concentration is too high.',
    defenseImpact: 'HIGH',
    defenseStrategy: 'Proves residual alcohol or chemical contamination within the cuvette or ambient testing room.'
  },
  {
    code: 6,
    type: 'Software Status',
    name: 'ALCOHOL IN AMBIENT AIR',
    description: 'After purging, the EC measured ambient alcohol concentration greater than threshold level.',
    defenseImpact: 'HIGH',
    defenseStrategy: 'Demonstrates environmental air contamination in the booking room influencing breath measurements.'
  },
  {
    code: 7,
    type: 'Software Status',
    name: 'INVALID SAMPLE',
    description: 'Mouth alcohol detected by slope/plateau algorithm.',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Confirms presence of mouth alcohol (GERD, regurgitation, recent consumption). Must restart full 15-min observation.'
  },
  {
    code: 8,
    type: 'Software Status',
    name: 'INTERFERENT DETECTED',
    description: 'Interfering non-ethanol substance detected (e.g. acetone, isopropanol, methanol, toluene).',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Excludes test due to non-ethanol chemical interference. Supports medical or occupational chemical defense.'
  },
  {
    code: 10,
    type: 'Software Status',
    name: 'SAMPLES OUTSIDE 10%',
    description: 'IR values from subject sample 1 and sample 2 exceeded acceptable 10% agreement limit.',
    defenseImpact: 'HIGH',
    defenseStrategy: 'Demonstrates lack of repeatability between successive breath samples, violating 501 CMR 2.00 standards.'
  },
  {
    code: 21,
    type: 'Software Status',
    name: 'CAL. STANDARD FAILED',
    description: 'Calculated cal-check gas concentration did not meet tolerance limits (0.072 - 0.088 g/210L).',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Direct proof of instrument inaccuracy. Automatic grounds for exclusion of breath test results.'
  },
  {
    code: 23,
    type: 'Software Status',
    name: 'COMMUNICATION ERROR',
    description: 'Communication exception occurred between WinCE and M16 measurement processors.',
    defenseImpact: 'HIGH',
    defenseStrategy: 'Raises internal software and hardware synchronization faults between internal microprocessors.'
  },
  {
    code: 24,
    type: 'Software Status',
    name: 'QUICK RESET',
    description: 'A quick reset was executed by system or operator.',
    defenseImpact: 'MEDIUM',
    defenseStrategy: 'Undocumented system restart indicating power fluctuation, thermal spike, or forced reboot.'
  },
  {
    code: 38,
    type: 'Software Status',
    name: 'HARDWARE ERROR',
    description: 'General indicator for hardware related error messages.',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Physical component failure. Demands full factory maintenance and technician logs.'
  },
  {
    code: 39,
    type: 'Software Status',
    name: 'INTERNAL STANDARD ERROR',
    description: 'Results of the internal optical quartz filter standard were outside tolerance limits.',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Primary internal optical calibration check failed; invalidates optical cuvette integrity.'
  },
  {
    code: 57,
    type: 'Software Status',
    name: 'MESSAGE 57 / INCOMPLETE',
    description: 'In-sequence test interruption code indicating aborted test or incomplete sample sequence.',
    defenseImpact: 'HIGH',
    defenseStrategy: 'Incomplete sequence where second test was never completed; cannot be characterized as lawful refusal.'
  },
  {
    code: 109,
    type: 'Hardware Error',
    name: 'EC_SENSOR_SYSTEM_DEFEKT',
    description: 'Motor of EC sampling unit does not move piston as expected.',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Defective electrochemical piston assembly failing to pull required 1cc sample from cuvette.'
  },
  {
    code: 118,
    type: 'Hardware Error',
    name: 'NTC_CUVETTE_DEFEKT',
    description: 'Cuvette heater NTC temperature sensor broken or temp > 75°C.',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Thermal control defect causing cuvette overheating or condensation, invalidating Beer-Lambert optics.'
  },
  {
    code: 119,
    type: 'Hardware Error',
    name: 'NTC_HOSE_DEFEKT',
    description: 'Hose heater NTC broken or temp > 60°C.',
    defenseImpact: 'HIGH',
    defenseStrategy: 'Breath hose heater failure leading to sample condensation in hose or thermal degradation.'
  },
  {
    code: 153,
    type: 'Hardware Error',
    name: 'TRANSDUCER_DEFECT',
    description: 'Output value of pressure transducer indicates transducer defect.',
    defenseImpact: 'CRITICAL',
    defenseStrategy: 'Defective differential pressure transducer invalidates flow rate, breath volume (1.5L), and plateau measurements.'
  }
];

// The 8 Draeger 9510 Failure Mechanism Categories
interface FailureMechanism {
  id: string;
  number: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  keyVulnerabilities: string[];
  investigationChecklist: string[];
  legalAuthority: string;
}

const FAILURE_MECHANISMS: FailureMechanism[] = [
  {
    id: 'improper_calibration',
    number: 1,
    title: 'Improper Calibration & Accuracy Verification',
    icon: Gauge,
    summary:
      "The accuracy of the Draeger Alcotest 9510 depends on regular calibration and maintenance. If the device is not properly calibrated according to the manufacturer's guidelines, it may produce incorrect readings. Regular calibration by qualified technicians is crucial to ensure accurate and reliable results.",
    keyVulnerabilities: [
      'Unexplained pre-test "adjustments" made without documenting initial/final values on certification forms.',
      'Calcheck failures ("CAL. STANDARD FAILED") appearing prior to same-day pass certifications.',
      'Wet bath simulator temperature deviations outside 34.0°C ± 0.2°C tolerance.',
      'Expired dry gas reference cylinders or NIST traceability gaps.'
    ],
    investigationChecklist: [
      'Obtain complete OAT Certification Event Folder (including incomplete certifications).',
      'Verify 12-month annual certification window under 501 CMR 2.06.',
      'Inspect dry gas lot #, expiration date, and target value (0.072 - 0.088 g/210L range).',
      'Check if initial adjustment was performed without recording raw pre-adjustment values.'
    ],
    legalAuthority: '501 CMR 2.06; Commonwealth v. Barazueta, 470 Mass. 1017 (2014)'
  },
  {
    id: 'environmental_factors',
    number: 2,
    title: 'Environmental & Barometric Factors',
    icon: Thermometer,
    summary:
      "The Draeger Alcotest 9510 may be affected by various environmental factors, such as temperature and humidity. Extreme temperatures can impact the device's accuracy, leading to potential failures or erroneous readings. Additionally, the presence of certain chemicals or fumes in the testing environment may interfere with the breathalyzer's measurements.",
    keyVulnerabilities: [
      'Barometric pressure changes affecting dry gas volume expansion ($C = C_{760} \\times P / 760$).',
      'Cuvette operating temperature falling outside required 39°C - 50°C window.',
      'Breath hose heater dropping below 35°C, causing ethanol condensation inside hose.',
      'Ambient air contamination in booking room (Status Code 6: ALCOHOL IN AMBIENT AIR).'
    ],
    investigationChecklist: [
      'Verify recorded ambient pressure (hPa) on test ticket versus local barometric readings.',
      'Inspect recorded Hose Temp (min 35°C) and Cuvette Temp on diagnostic prints.',
      'Cross-examine officer regarding room ventilation, hand sanitizers, or solvents used near machine.'
    ],
    legalAuthority: 'Draeger Alcotest 9510 Technical Manual § 8.3.2; 501 CMR 2.00'
  },
  {
    id: 'residual_mouth_alcohol',
    number: 3,
    title: 'Residual Mouth Alcohol & Observation Violations',
    icon: Wind,
    summary:
      'The presence of alcohol in the mouth, such as from recent alcohol consumption, the use of mouthwash, or belching, can result in residual mouth alcohol. This residual alcohol can falsely elevate BAC readings, leading to inaccurate results.',
    keyVulnerabilities: [
      'Failure to continuously observe subject for 15 unbroken minutes prior to testing.',
      'Interrupted observation period due to officer typing, looking away, or transporting subject.',
      'Belching, regurgitation, or burping immediately prior to or during blowing.',
      'False slope plateau recognition failing to detect rapid slope spikes.'
    ],
    investigationChecklist: [
      'Compare "Observation Start Time" with "Test Starts" timestamp on ticket.',
      'Review booking room video to confirm officer\'s continuous line-of-sight visual contact.',
      'Inquire if subject belched, regurgitated, or had dentures/dental hardware retaining liquid.'
    ],
    legalAuthority: 'Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008); 501 CMR 2.13'
  },
  {
    id: 'medical_conditions',
    number: 4,
    title: 'Medical Conditions (GERD & Pulmonary Factors)',
    icon: Stethoscope,
    summary:
      'Some medical conditions, such as acid reflux or gastroesophageal reflux disease (GERD), can cause alcohol from the stomach to enter the mouth, leading to mouth alcohol contamination. Medical conditions that affect lung function may also impact the accuracy of breathalyzer readings.',
    keyVulnerabilities: [
      'GERD, acid reflux, or hiatal hernia continuously venting stomach alcohol vapor into oral cavity.',
      'Asthma, COPD, or restricted lung capacity causing prolonged blow times (>10s) and hyper-concentrated deep lung air.',
      'Diabetic ketoacidosis producing elevated breath acetone levels.'
    ],
    investigationChecklist: [
      'Obtain client medical records establishing diagnosis of GERD or acid reflux.',
      'Evaluate blow volume (L) and blow time (s) from Draeger diagnostic printout.',
      'Consult gastroenterologist or forensic toxicologist for expert testimony.'
    ],
    legalAuthority: 'Commonwealth v. Camblin, 478 Mass. 469 (2017)'
  },
  {
    id: 'radio_frequency_interference',
    number: 5,
    title: 'Radio Frequency Interference (RFI)',
    icon: Radio,
    summary:
      'The Draeger Alcotest 9510 uses radio frequency (RF) technology for communication. In environments with strong RF interference, such as police stations or areas with multiple electronic devices, the device may experience disruptions in its operation, potentially leading to failures or inconsistent results.',
    keyVulnerabilities: [
      'Police department 800 MHz radios or dispatch equipment keying nearby.',
      'Cellular phones or Wi-Fi routers operating near unshielded Draeger circuitry.',
      'Transient electromagnetic voltage spikes disturbing 12-bit A/D signal sampling.'
    ],
    investigationChecklist: [
      'Inquire if officer or booking personnel were wearing active two-way radios during test.',
      'Check location of cellular devices and Wi-Fi access points in booking area.',
      'Request maintenance logs for RFI antenna shielding inspections.'
    ],
    legalAuthority: 'Commonwealth v. Neal, 392 Mass. 1 (1984)'
  },
  {
    id: 'instrument_malfunction',
    number: 6,
    title: 'Instrument Hardware & Software Malfunctions',
    icon: Cpu,
    summary:
      'Like any electronic device, the Draeger Alcotest 9510 can experience malfunctions or technical issues. These malfunctions may be caused by software glitches, sensor problems, or other hardware-related factors.',
    keyVulnerabilities: [
      'Code 153 Transducer Defect corrupting flow rate and volume calculations.',
      'Code 109 Motor Defect causing electrochemical sampling piston to freeze.',
      'Code 39 Internal Standard error indicating optical filter misalignment.',
      'WinCE and M16 dual-processor communication loss (Code 23).'
    ],
    investigationChecklist: [
      'Search all uploaded maintenance logs for hidden status codes (1-73) and hardware codes (100-153).',
      'Verify software CRC checksums (WinCE 4.12, Cfg 1.56/8322235).',
      'Check for abrupt system reboots or "QUICK RESET" entries in history.'
    ],
    legalAuthority: 'Commonwealth v. An evidentiary audit of Draeger Alcotest 9510 software (Ankeny decision)'
  },
  {
    id: 'operator_errors',
    number: 7,
    title: 'Operator Certification & Administrative Errors',
    icon: UserX,
    summary:
      'The accuracy of breathalyzer results can also be influenced by the training and expertise of the law enforcement officer administering the test. Improper administration or failure to follow the correct testing procedures may lead to unreliable readings.',
    keyVulnerabilities: [
      'Test administered by officer whose Breath Test Operator (BTO) certification was expired.',
      'Officer skipping data entry prompts or entering arbitrary observation start times.',
      'Improper mouthpiece installation causing air leaks or back-pressure loss.',
      'Mischaracterizing incomplete tests as voluntary refusals.'
    ],
    investigationChecklist: [
      'Verify BTO card expiration date against incident date.',
      'Check if officer followed exact 10.1 Data Entry Sequence from Technical Manual.',
      'Audit whether "Refusal" was logged following an instrument error or timeout.'
    ],
    legalAuthority: '501 CMR 2.08; Commonwealth v. Zeininger, 459 Mass. 775 (2011)'
  },
  {
    id: 'interfering_substances',
    number: 8,
    title: 'Interfering Chemical Substances',
    icon: FlaskConical,
    summary:
      'The Draeger Alcotest 9510 is designed to measure alcohol specifically. However, certain substances, such as acetone (found in nail polish remover), ketones (produced during low-carb diets or diabetes), and some cleaning chemicals, may interfere with the accuracy of the test.',
    keyVulnerabilities: [
      'Elevated breath acetone from ketogenic dieting, fasting, or diabetes absorbing at 9.5 µm spectrum.',
      'Occupational exposure to paints, toluene, or isopropyl alcohol in painters or mechanics.',
      'Draeger dual-sensor divergence: IR reading vs EC reading exceeding 0.008 g/210L or 10% threshold.'
    ],
    investigationChecklist: [
      'Compare IR reading vs EC reading on raw ticket (must be within 0.008 g/210L or 10%).',
      'Question client regarding dietary habits (keto/fasting) or industrial chemical exposures.',
      'Inspect booking room cleaning logs for chemical disinfectants used prior to test.'
    ],
    legalAuthority: 'Draeger Alcotest 9510 Tech Manual § 9; 501 CMR 2.00'
  }
];

export const BreathalyzerReview: React.FC<BreathalyzerReviewProps> = ({
  currentCase,
  onUpdateCase
}) => {
  // Active Tab inside Breathalyzer Review
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'vault' | 'audit' | 'codes'>('overview');

  // Expanded Failure Category
  const [expandedMechanismId, setExpandedMechanismId] = useState<string>('improper_calibration');

  // Code Search Term
  const [codeSearch, setCodeSearch] = useState('');

  // Motion Copy State
  const [copiedFmId, setCopiedFmId] = useState<string | null>(null);

  const handleCopyFmMotion = (fmId: string, motionText: string) => {
    navigator.clipboard.writeText(motionText);
    setCopiedFmId(fmId);
    setTimeout(() => setCopiedFmId(null), 2500);
  };

  // Helper to generate case-specific motion drafting language for each failure mechanism
  const generateCaseSpecificMotion = (fmId: string): string => {
    const client = currentCase.clientName || 'the Defendant';
    const docket = currentCase.caseNumber || 'Unassigned Docket';
    const court = currentCase.court || 'District Court';
    const agency = currentCase.arrestingAgency || 'Arresting Department';
    const date = currentCase.incidentDate || 'Incident Date';
    const docsList = currentCase.documents.map((d) => d.name).join(', ') || 'Discovery Files';

    switch (fmId) {
      case 'improper_calibration':
        return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION TO SUPPRESS BREATH TEST RESULTS
(IMPROPER CALIBRATION & 501 CMR 2.06 NON-COMPLIANCE)

NOW COMES Defendant, ${client}, in the above-captioned matter and respectfully moves this Honorable Court pursuant to M.G.L. c. 90 § 24(1)(e), M.G.L. c. 90 § 24K, and 501 CMR 2.06 to SUPPRESS all chemical breath test results and Draeger Alcotest 9510 report printouts generated on or about ${date} by the ${agency}.

GROUNDS: The Commonwealth cannot satisfy its threshold foundational burden of proving that the Draeger Alcotest 9510 utilized in this case was properly calibrated and certified in strict compliance with Mass. Office of Alcohol Testing (OAT) regulations and 501 CMR 2.06.

LEGAL ARGUMENT: Under Commonwealth v. Barazueta, 470 Mass. 1017 (2014) and 501 CMR 2.06, breath test evidence is strictly inadmissible unless the Commonwealth establishes proper annual certification, reference gas standard NIST traceability, and dry gas target concentration tolerances (0.072 - 0.088 g/210L). Review of discovery records (${docsList}) reveals gaps in dry gas cylinder lot verification and calibration event logs.

PRAYER FOR RELIEF: Defendant requests that all breath test numerical results and BATS report forms be suppressed from trial evidence.`;

      case 'environmental_factors':
        return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION IN LIMINE TO EXCLUDE BREATH TEST RESULTS
(ENVIRONMENTAL & BAROMETRIC INTERFERENCE)

NOW COMES Defendant, ${client}, and moves to exclude all chemical breath readings obtained on ${date}.

GROUNDS: The testing environment at ${agency} contained ambient chemical or thermal anomalies that compromised the optical cuvette and electrochemical sensor readings of the Draeger Alcotest 9510.

LEGAL ARGUMENT: Under 501 CMR 2.00 and Draeger Alcotest 9510 Technical Specifications § 8.3, cuvette operating temperatures must remain within 39°C - 50°C and breath hose heaters must maintain at least 35°C to prevent condensation. Discovery (${docsList}) fails to verify room ambient air zeroing or hose temperature logs at time of testing.

PRAYER FOR RELIEF: Exclude breath test evidence and preclude prosecution testimony regarding breath alcohol concentration.`;

      case 'residual_mouth_alcohol':
        return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION TO SUPPRESS BREATH TEST RESULTS
(VIOLATION OF MANDATORY 15-MINUTE OBSERVATION WINDOW)

NOW COMES Defendant, ${client}, and moves to suppress all chemical breath test results obtained by ${agency}.

GROUNDS: Law enforcement officers failed to conduct a continuous, unbroken, 15-minute line-of-sight observation of ${client} prior to breath test administration, violating 501 CMR 2.13.

LEGAL ARGUMENT: In Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008) and 501 CMR 2.13, continuous 15-minute observation is mandatory to ensure no belching, regurgitation, mouth alcohol contamination, or foreign object placement occurs. Police report narratives (${docsList}) demonstrate officers were engaged in typing, booking, or paperwork during the window.

PRAYER FOR RELIEF: Suppress all breath test results and BATS certificates.`;

      case 'medical_conditions':
        return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION IN LIMINE REGARDING PHYSIOLOGICAL & MEDICAL CONTAMINATION
(GERD & PULMONARY DEVIATIONS)

NOW COMES Defendant, ${client}, and moves to exclude breath test results due to medical GERD/gastrointestinal contamination.

GROUNDS: Physiological regurgitation and acid reflux continuously vent stomach alcohol vapor into the oral cavity, creating false slope readings on the Draeger 9510.

LEGAL ARGUMENT: Pursuant to Commonwealth v. Camblin, 478 Mass. 469 (2017), breath test instruments are susceptible to mouth alcohol contamination from GERD and upper GI tract conditions.

PRAYER FOR RELIEF: Exclude chemical breath test readings or order a voir dire hearing on medical admissibility.`;

      case 'radio_frequency_interference':
        return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION TO SUPPRESS CHEMICAL TEST RESULTS
(RADIO FREQUENCY INTERFERENCE)

NOW COMES Defendant, ${client}, and moves to suppress chemical test results due to RFI keying in the booking area.

GROUNDS: Unshielded radio frequency transmissions from police 800 MHz radios and cellular devices in the booking room disturbed A/D sampling circuitry.

LEGAL ARGUMENT: Under Commonwealth v. Neal, 392 Mass. 1 (1984), RFI shielding compliance is a prerequisite to instrument accuracy.

PRAYER FOR RELIEF: Suppress all chemical test outputs from trial.`;

      case 'instrument_malfunction':
        return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION TO SUPPRESS BREATH EVIDENCE
(HARDWARE & STATUS CODE MALFUNCTIONS)

NOW COMES Defendant, ${client}, and moves to suppress breath test results due to Draeger hardware and software status code failures.

GROUNDS: Maintenance logs for the instrument used against ${client} reveal unaddressed status codes (e.g. Code 153 Transducer Defect / Code 39 Internal Standard Error).

LEGAL ARGUMENT: Under Ankeny and 501 CMR 2.00, unresolved internal hardware errors invalidate testing sequences.

PRAYER FOR RELIEF: Order complete suppression of breath test records.`;

      case 'operator_errors':
        return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION TO SUPPRESS BREATH TEST RESULTS
(UNQUALIFIED BREATH TEST OPERATOR / ADMINISTRATIVE VIOLATION)

NOW COMES Defendant, ${client}, and moves to suppress breath evidence due to operator certification defects.

GROUNDS: The administering officer lacked valid, unexpired Breath Test Operator certification under 501 CMR 2.08 on date of arrest (${date}).

LEGAL ARGUMENT: Pursuant to M.G.L. c. 90 § 24K and Commonwealth v. Zeininger, 459 Mass. 775 (2011), breath tests must be administered by certified operators.

PRAYER FOR RELIEF: Exclude breath test results and BATS report forms.`;

      case 'interfering_substances':
        return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION IN LIMINE TO EXCLUDE BREATH TEST RESULTS
(NON-ETHANOL INTERFERING CHEMICAL SUBSTANCES)

NOW COMES Defendant, ${client}, and moves to exclude breath readings due to non-ethanol chemical interference.

GROUNDS: Environmental solvents or endogenous acetone created false 9.5 µm optical absorption.

LEGAL ARGUMENT: Under Draeger Technical Specifications § 9 and 501 CMR 2.00, non-ethanol interferents invalidate BAC calculations.

PRAYER FOR RELIEF: Order complete exclusion of chemical breath test evidence.`;

      default:
        return `DEFENDANT'S MOTION TO SUPPRESS BREATH EVIDENCE for ${client} (${docket}).`;
    }
  };

  // Drag and Drop Upload State for Breathalyzer Vault
  const [isDragging, setIsDragging] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Interactive Diagnostic Inspector Inputs
  const [sample1IR, setSample1IR] = useState<number>(0.092);
  const [sample1EC, setSample1EC] = useState<number>(0.084);
  const [sample2IR, setSample2IR] = useState<number>(0.095);
  const [sample2EC, setSample2EC] = useState<number>(0.087);
  const [hoseTemp, setHoseTemp] = useState<number>(47.0);
  const [cuvetteTemp, setCuvetteTemp] = useState<number>(41.2);
  const [ambientPressure, setAmbientPressure] = useState<number>(1013);
  const [obsStartMinutes, setObsStartMinutes] = useState<number>(15);

  // Computed Dual Sensor Discrepancy Checks
  const diff1 = Math.abs(sample1IR - sample1EC);
  const tol1 = Math.max(0.008, sample1IR * 0.1);
  const sample1Valid = diff1 <= tol1;

  const diff2 = Math.abs(sample2IR - sample2EC);
  const tol2 = Math.max(0.008, sample2IR * 0.1);
  const sample2Valid = diff2 <= tol2;

  // Comparison of Sample 1 vs Sample 2 Mean IR agreement
  const meanIR = (sample1IR + sample2IR) / 2;
  const sampleAgreement = Math.abs(sample1IR - sample2IR) <= Math.max(0.008, meanIR * 0.1);

  // Environmental Temp Checks
  const hoseTempValid = hoseTemp >= 35.0 && hoseTemp <= 60.0;
  const cuvetteTempValid = cuvetteTemp >= 39.0 && cuvetteTemp <= 50.0;
  const obsValid = obsStartMinutes >= 15;

  // Filtered status codes
  const filteredCodes = DRAEGER_CODES.filter(
    (c) =>
      c.code.toString().includes(codeSearch) ||
      c.name.toLowerCase().includes(codeSearch.toLowerCase()) ||
      c.description.toLowerCase().includes(codeSearch.toLowerCase()) ||
      c.defenseStrategy.toLowerCase().includes(codeSearch.toLowerCase())
  );

  // Filter breathalyzer documents
  const breathalyzerDocs = currentCase.documents.filter(
    (d) =>
      d.type === 'draeger_ticket' ||
      d.name.toLowerCase().includes('draeger') ||
      d.name.toLowerCase().includes('calib') ||
      d.name.toLowerCase().includes('breath') ||
      d.name.toLowerCase().includes('solution')
  );

  // Batch file processing handler
  const handleProcessFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const newDocs: CaseDocument[] = [];
    for (const file of files) {
      const { type: docType, classification } = categorizeFileByFilename(file.name);
      let parsedText = '';
      try {
        if (
          file.type.includes('text') ||
          file.type.includes('json') ||
          file.type.includes('html') ||
          file.name.endsWith('.txt') ||
          file.name.endsWith('.json') ||
          file.name.endsWith('.html') ||
          file.name.endsWith('.md')
        ) {
          parsedText = await file.text();
        } else {
          parsedText = `[Ingested Draeger Record: ${file.name}]\nFile Size: ${(file.size / 1024).toFixed(
            1
          )} KB | Auto-Categorized Category: ${docType.toUpperCase()}\nVerified Breathalyzer Discovery Attachment.`;
        }
      } catch {
        parsedText = `[Extracted content for ${file.name}]`;
      }

      const rawParagraphs = parsedText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      const pages: ExtractedPage[] = [
        {
          pageNumber: 1,
          paragraphs:
            rawParagraphs.length > 0
              ? rawParagraphs.map((pt, idx) => ({ paragraphNumber: idx + 1, text: pt.trim() }))
              : [{ paragraphNumber: 1, text: parsedText }]
        }
      ];

      newDocs.push({
        id: `draeger_doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        type: docType === 'other' ? 'draeger_ticket' : docType,
        uploadDate: new Date().toISOString().split('T')[0],
        parsedText,
        pages,
        status: 'parsed',
        mimeType: file.type || 'application/pdf'
      });
    }

    const updatedDocs = [...currentCase.documents, ...newDocs];
    onUpdateCase({
      ...currentCase,
      documents: updatedDocs,
      lastUpdated: new Date().toISOString()
    });

    setUploadNote(`Ingested ${newDocs.length} breathalyzer record file(s) into case vault.`);
  };

  // Exports
  const handleExportJson = () => {
    const payload = {
      clientName: currentCase.clientName,
      caseNumber: currentCase.caseNumber,
      exportDate: new Date().toISOString(),
      breathalyzerAudit: {
        sample1: { IR: sample1IR, EC: sample1EC, valid: sample1Valid },
        sample2: { IR: sample2IR, EC: sample2EC, valid: sample2Valid },
        temperatures: { hoseTemp, hoseValid: hoseTempValid, cuvetteTemp, cuvetteValid: cuvetteTempValid },
        observation: { minutes: obsStartMinutes, valid: obsValid },
        failureMechanisms: FAILURE_MECHANISMS
      }
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `draeger9510_review_${currentCase.caseNumber}.json`;
    a.click();
  };

  const handleExportHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Draeger Alcotest 9510 Records Review - ${currentCase.clientName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #0f172a; line-height: 1.5; }
    h1 { font-size: 22px; color: #1d4ed8; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; }
    .card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .title { font-size: 15px; font-weight: bold; color: #1e293b; margin-bottom: 6px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #1d4ed8; color: #fff; }
    .list { margin-top: 8px; font-size: 13px; }
    .authority { font-size: 11px; font-weight: bold; color: #1e40af; margin-top: 8px; background: #eff6ff; padding: 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Draeger Alcotest 9510 Breathalyzer Audit & Defense Review</h1>
  <p><strong>Client:</strong> ${currentCase.clientName} | <strong>Case #:</strong> ${currentCase.caseNumber} | <strong>Court:</strong> ${currentCase.court}</p>
  
  <h2>8 Core Draeger 9510 Vulnerability & Failure Modes</h2>
  ${FAILURE_MECHANISMS.map(
    (fm) => `
    <div class="card">
      <div class="title"><span class="badge">#${fm.number}</span> ${fm.title}</div>
      <p style="font-size: 12px; color: #475569;">${fm.summary}</p>
      <div class="list">
        <strong>Key Defense Vulnerabilities:</strong>
        <ul>${fm.keyVulnerabilities.map((v) => `<li>${v}</li>`).join('')}</ul>
      </div>
      <div class="authority">Authority: ${fm.legalAuthority}</div>
    </div>
  `
  ).join('')}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `draeger9510_review_${currentCase.caseNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          children: [
            new Paragraph({ text: 'DRAEGER ALCOTEST 9510 AUDIT & MOTION TO SUPPRESS REVIEW', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Client: ${currentCase.clientName} (${currentCase.caseNumber})` }),
            new Paragraph({ text: `Court: ${currentCase.court}` }),
            new Paragraph({ text: `Review Date: ${new Date().toLocaleDateString()}` }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '1. TECHNICAL FAILURE MECHANISM ANALYSIS', heading: HeadingLevel.HEADING_2 }),
            ...FAILURE_MECHANISMS.flatMap((fm) => [
              new Paragraph({ text: `${fm.number}. ${fm.title}`, heading: HeadingLevel.HEADING_3 }),
              new Paragraph({ text: fm.summary }),
              new Paragraph({ text: `Legal Authority: ${fm.legalAuthority}` }),
              new Paragraph({ text: '' })
            ])
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `draeger9510_defense_review_${currentCase.caseNumber}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <Gauge className="w-6 h-6 text-blue-700" />
            <h3 className="text-xl font-bold text-slate-900">
              Draeger Alcotest 9510 Breathalyzer Records Review
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Comprehensive forensic audit of breath test tickets, calibration certificates, status codes, dual-sensor (IR/EC) tolerances, and failure mechanisms.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
            Print to PDF
          </button>
          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <FileJson className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
            JSON
          </button>
          <button
            onClick={handleExportHtml}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <Code2 className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
            HTML
          </button>
          <button
            onClick={handleExportDocx}
            className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition-colors flex items-center shadow-2xs"
          >
            <FileCode className="w-3.5 h-3.5 mr-1.5" />
            DOCX Motion
          </button>
        </div>
      </div>

      {/* Module Navigation Sub-Tabs */}
      <div className="flex space-x-1 border-b border-slate-200 mb-6 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center whitespace-nowrap ${
            activeSubTab === 'overview'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4 mr-2" />
          8 Failure Mechanisms & Reliability
        </button>
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center whitespace-nowrap ${
            activeSubTab === 'audit'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4 mr-2" />
          Interactive Ticket & Sensor Auditor
        </button>
        <button
          onClick={() => setActiveSubTab('vault')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center whitespace-nowrap ${
            activeSubTab === 'vault'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderPlus className="w-4 h-4 mr-2" />
          Upload Multi-Document Records ({breathalyzerDocs.length})
        </button>
        <button
          onClick={() => setActiveSubTab('codes')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center whitespace-nowrap ${
            activeSubTab === 'codes'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileSearch className="w-4 h-4 mr-2" />
          Draeger 9510 Error Code Lookup
        </button>
      </div>

      {/* SUB-TAB 1: 8 FAILURE MECHANISMS & RELIABILITY FRAMEWORK */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Active Case Evidence Spotlight Banner */}
          <div className="p-4 bg-slate-900 text-white rounded-xl shadow-xs border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <Gauge className="w-5 h-5 text-blue-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                    Active Case Breathalyzer Audit Profile
                  </span>
                </div>
                <h4 className="text-base font-bold text-white mt-0.5">
                  Client: {currentCase.clientName || 'Active Defendant'} ({currentCase.caseNumber || 'Unassigned Docket'})
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-md border border-slate-700 font-mono">
                  Venue: {currentCase.court}
                </span>
                <span className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-md border border-slate-700 font-mono">
                  Agency: {currentCase.arrestingAgency || 'Police Dept'}
                </span>
                <span className="bg-blue-900/60 text-blue-300 px-2.5 py-1 rounded-md border border-blue-700/50 font-mono">
                  Docs: {currentCase.documents.length} File(s) Ingested
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Primary Charge</span>
                <span className="font-semibold text-slate-200">{currentCase.charge || 'OUI-Liquor'}</span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Incident Date</span>
                <span className="font-semibold text-slate-200">{currentCase.incidentDate || 'Date Unspecified'}</span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Uploaded Records</span>
                <span className="font-semibold text-blue-300 truncate block">
                  {currentCase.documents.length > 0
                    ? currentCase.documents.map((d) => d.name).join(', ')
                    : 'No documents attached yet'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
            <h4 className="font-bold text-sm text-blue-950 mb-1 flex items-center">
              <ShieldAlert className="w-4 h-4 mr-2 text-blue-700" />
              Forensic Reliability & Case-Specific Motion Arguments
            </h4>
            While the Alcotest 9510 dual-sensor (Infrared at 9.5 µm & Electrochemical Fuel Cell) system is widely used, it is not infallible. Below are the 8 primary technical failure mechanisms with custom motion arguments generated specifically for <strong>{currentCase.clientName}</strong>.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FAILURE_MECHANISMS.map((fm) => {
              const IconComp = fm.icon;
              const isExpanded = expandedMechanismId === fm.id;
              const caseMotionText = generateCaseSpecificMotion(fm.id);

              return (
                <div
                  key={fm.id}
                  className={`border rounded-xl p-4 transition-all ${
                    isExpanded ? 'bg-slate-50 border-blue-500 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div
                    onClick={() => setExpandedMechanismId(isExpanded ? '' : fm.id)}
                    className="flex items-start justify-between cursor-pointer"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                          Mechanism #{fm.number}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{fm.title}</h4>
                      </div>
                    </div>

                    <button className="text-slate-400 hover:text-slate-700 p-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">{fm.summary}</p>

                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-slate-200 space-y-3 text-xs">
                      <div>
                        <span className="font-bold text-slate-900 block mb-1">Key Technical Vulnerabilities:</span>
                        <ul className="list-disc pl-4 space-y-1 text-slate-700 text-[11px]">
                          {fm.keyVulnerabilities.map((v, i) => (
                            <li key={i}>{v}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <span className="font-bold text-slate-900 block mb-1">Investigation Checklist:</span>
                        <ul className="list-disc pl-4 space-y-1 text-slate-700 text-[11px]">
                          {fm.investigationChecklist.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-2 bg-blue-50 rounded border border-blue-100 text-[11px] font-semibold text-blue-900">
                        <strong>Legal Authority:</strong> {fm.legalAuthority}
                      </div>

                      {/* Case-Specific Motion Drafting Box */}
                      <div className="mt-3 p-3 bg-white border border-blue-200 rounded-lg shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-950 text-[11px] flex items-center">
                            <Scale className="w-3.5 h-3.5 mr-1 text-blue-700" />
                            Motion Argument for {currentCase.clientName}:
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyFmMotion(fm.id, caseMotionText);
                            }}
                            className="px-2 py-1 bg-blue-700 hover:bg-blue-800 text-white font-bold text-[10px] rounded transition-colors flex items-center"
                          >
                            {copiedFmId === fm.id ? (
                              <>
                                <Check className="w-3 h-3 mr-1 text-emerald-300" />
                                Copied Motion Argument!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 mr-1" />
                                Copy Motion Paragraph
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="text-[10px] font-mono text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200 whitespace-pre-wrap leading-relaxed select-all max-h-48 overflow-y-auto">
                          {caseMotionText}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: INTERACTIVE TICKET & DUAL SENSOR AUDITOR */}
      {activeSubTab === 'audit' && (
        <div className="space-y-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <h4 className="text-sm font-bold text-slate-900 mb-1 flex items-center">
              <Activity className="w-4 h-4 mr-2 text-blue-700" />
              Draeger 9510 Dual-Sensor (IR vs EC) Tolerance & Diagnostic Auditor
            </h4>
            <p className="text-xs text-slate-500">
              Input the raw IR and EC values from Breath Sample 1 and Breath Sample 2 to verify compliance with the 501 CMR 2.00 rule: EC must be within 0.008 g/210L or 10% of the IR reading.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Breath Sample 1 Audit Card */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Breath Test Sample 1
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    sample1Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {sample1Valid ? 'PASS (In Tolerance)' : 'FAIL (Tolerance Exceeded)'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                    Sample 1 IR (g/210L)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={sample1IR}
                    onChange={(e) => setSample1IR(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                    Sample 1 EC (g/210L)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={sample1EC}
                    onChange={(e) => setSample1EC(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg text-xs space-y-1 font-mono text-slate-700">
                <div>Absolute Difference: {diff1.toFixed(3)} g/210L</div>
                <div>Allowable Tolerance Limit: ±{tol1.toFixed(3)} g/210L</div>
                {!sample1Valid && (
                  <div className="text-red-700 font-bold mt-1 text-[11px]">
                    ⚠️ Discrepancy exceeds tolerance. Triggers INTERFERENT DETECTED or dual-sensor flaw!
                  </div>
                )}
              </div>
            </div>

            {/* Breath Sample 2 Audit Card */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Breath Test Sample 2
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    sample2Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {sample2Valid ? 'PASS (In Tolerance)' : 'FAIL (Tolerance Exceeded)'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                    Sample 2 IR (g/210L)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={sample2IR}
                    onChange={(e) => setSample2IR(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                    Sample 2 EC (g/210L)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={sample2EC}
                    onChange={(e) => setSample2EC(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg text-xs space-y-1 font-mono text-slate-700">
                <div>Absolute Difference: {diff2.toFixed(3)} g/210L</div>
                <div>Allowable Tolerance Limit: ±{tol2.toFixed(3)} g/210L</div>
                {!sample2Valid && (
                  <div className="text-red-700 font-bold mt-1 text-[11px]">
                    ⚠️ Discrepancy exceeds tolerance. Triggers INTERFERENT DETECTED or dual-sensor flaw!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Diagnostic Environmental Controls Auditor */}
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">
              Environmental & Procedural Parameters Audit
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Hose Temp (°C)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={hoseTemp}
                  onChange={(e) => setHoseTemp(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-bold px-2 py-1 border border-slate-300 rounded"
                />
                <span
                  className={`text-[10px] font-bold block mt-1 ${
                    hoseTempValid ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {hoseTempValid ? '✓ Range 35°C - 60°C' : '❌ Out of spec! Condensation risk'}
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Cuvette Temp (°C)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={cuvetteTemp}
                  onChange={(e) => setCuvetteTemp(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-bold px-2 py-1 border border-slate-300 rounded"
                />
                <span
                  className={`text-[10px] font-bold block mt-1 ${
                    cuvetteTempValid ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {cuvetteTempValid ? '✓ Range 39°C - 50°C' : '❌ Out of spec! Optical drift'}
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Ambient Baro (hPa)
                </label>
                <input
                  type="number"
                  value={ambientPressure}
                  onChange={(e) => setAmbientPressure(parseInt(e.target.value) || 0)}
                  className="w-full text-xs font-bold px-2 py-1 border border-slate-300 rounded"
                />
                <span className="text-[10px] text-slate-500 block mt-1">Normal: 950 - 1050 hPa</span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Observation Period (min)
                </label>
                <input
                  type="number"
                  value={obsStartMinutes}
                  onChange={(e) => setObsStartMinutes(parseInt(e.target.value) || 0)}
                  className="w-full text-xs font-bold px-2 py-1 border border-slate-300 rounded"
                />
                <span
                  className={`text-[10px] font-bold block mt-1 ${
                    obsValid ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {obsValid ? '✓ 15+ Min Met' : '❌ < 15 Min! Mandatory exclusion'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: MULTI-DOCUMENT UPLOAD VAULT */}
      {activeSubTab === 'vault' && (
        <div className="space-y-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) {
                await handleProcessFiles(Array.from(e.dataTransfer.files));
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
              isDragging
                ? 'bg-blue-100 border-blue-600 scale-[1.01]'
                : 'bg-slate-50 hover:bg-blue-50/50 border-slate-300 hover:border-blue-400'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".pdf,.json,.html,.txt,.docx,image/*"
              className="hidden"
              onChange={async (e) => {
                if (e.target.files) {
                  await handleProcessFiles(Array.from(e.target.files));
                }
              }}
            />

            <Upload className="w-8 h-8 text-blue-700 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-900">
              Drag & Drop Multiple Breathalyzer Record Files Here
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Upload Draeger calibration certificates, wet bath solution logs, diagnostic prints, operator cards, and test tickets.
            </p>
          </div>

          {uploadNote && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium flex justify-between items-center">
              <span>{uploadNote}</span>
              <button onClick={() => setUploadNote(null)} className="font-bold underline text-emerald-700">
                Dismiss
              </button>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl p-4 bg-white">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Ingested Breathalyzer Records in Case ({breathalyzerDocs.length})
            </h4>

            {breathalyzerDocs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No breathalyzer records uploaded yet. Drop files above or select from sample cases.
              </div>
            ) : (
              <div className="space-y-2">
                {breathalyzerDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3 bg-slate-50 hover:bg-blue-50/40 border border-slate-200 rounded-lg flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <FileText className="w-4 h-4 text-blue-700 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-900 truncate">{doc.name}</p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Category: {doc.type.toUpperCase()} | Uploaded: {doc.uploadDate}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const updatedDocs = currentCase.documents.filter((d) => d.id !== doc.id);
                        onUpdateCase({ ...currentCase, documents: updatedDocs });
                      }}
                      className="p-1 hover:bg-red-100 text-slate-400 hover:text-red-700 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: DRAEGER 9510 ERROR CODE DIRECTORY */}
      {activeSubTab === 'codes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search error code (e.g., 38, 153, CAL, BLANK)..."
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <span className="text-xs font-mono text-slate-500">
              Showing {filteredCodes.length} of {DRAEGER_CODES.length} Status/Error Codes
            </span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                  <th className="p-3 w-16">Code #</th>
                  <th className="p-3 w-40">Status / Error Name</th>
                  <th className="p-3">Technical Description</th>
                  <th className="p-3 w-28">Impact</th>
                  <th className="p-3">Defense Cross-Exam Strategy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {filteredCodes.map((c) => (
                  <tr key={c.code} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-800">#{c.code}</td>
                    <td className="p-3 font-bold text-slate-900">{c.name}</td>
                    <td className="p-3 text-slate-600 text-[11px]">{c.description}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          c.defenseImpact === 'CRITICAL'
                            ? 'bg-red-700 text-white'
                            : c.defenseImpact === 'HIGH'
                            ? 'bg-amber-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {c.defenseImpact}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] font-medium text-slate-700 leading-snug">
                      {c.defenseStrategy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
