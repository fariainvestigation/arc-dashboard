import React, { useState, useRef, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from 'recharts';
import {
  FlaskConical,
  Clock,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Plus,
  Trash2,
  Printer,
  FileJson,
  Code2,
  FileCode,
  Upload,
  Copy,
  Check,
  Scale,
  BookOpen,
  Gauge,
  Calendar,
  User,
  Building2,
  FileText,
  Sliders,
  ChevronRight,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle
} from 'docx';
import { CaseData, LabResultData, LabTestComponent } from '../types';
import { SubstanceInventoryAudit } from './SubstanceInventoryAudit';

interface LabAnalyticsProps {
  currentCase: CaseData;
  onUpdateCase: (updatedCase: CaseData) => void;
}

export const LabAnalytics: React.FC<LabAnalyticsProps> = ({ currentCase, onUpdateCase }) => {
  // Initialize or fallback lab result data
  const defaultComponents: LabTestComponent[] = [
    {
      substance: 'Ethanol (Blood Alcohol Content - BAC)',
      detectedValue: 0.083,
      unit: 'g/100mL',
      cutoffLevel: 0.080,
      therapeuticMin: 0.000,
      toxicMin: 0.150,
      uncertaintyRange: 0.005,
      testingMethod: 'GC-FID (Infrared)',
      qcBatchPassed: true
    },
    {
      substance: 'Delta-9-THC (Active Cannabis)',
      detectedValue: 3.2,
      unit: 'ng/mL',
      cutoffLevel: 5.0,
      therapeuticMin: 1.0,
      toxicMin: 10.0,
      uncertaintyRange: 0.5,
      testingMethod: 'LC-MS/MS',
      qcBatchPassed: true
    },
    {
      substance: '11-nor-9-Carboxy-THC (Inactive Metabolite)',
      detectedValue: 18.5,
      unit: 'ng/mL',
      cutoffLevel: 15.0,
      therapeuticMin: 0.0,
      toxicMin: 50.0,
      uncertaintyRange: 2.1,
      testingMethod: 'LC-MS/MS',
      qcBatchPassed: true
    },
    {
      substance: 'Alprazolam (Xanax)',
      detectedValue: 0.025,
      unit: 'mg/L',
      cutoffLevel: 0.010,
      therapeuticMin: 0.010,
      toxicMin: 0.050,
      uncertaintyRange: 0.004,
      testingMethod: 'GC-MS',
      qcBatchPassed: true
    }
  ];

  const initialLabData: LabResultData = currentCase.labResultData || {
    labCertificateId: `CERT-${currentCase.caseNumber || 'MA-2026-8812'}`,
    labName: 'Massachusetts State Police Crime Laboratory - Toxicology Unit',
    analystName: 'Senior Forensic Chemist / Toxicologist',
    sampleType: 'Blood',
    collectionTimestamp: (currentCase.incidentDate || '2026-03-14') + ' 01:45:00',
    labReceivedTimestamp: (currentCase.incidentDate || '2026-03-14') + ' 11:30:00',
    analysisTimestamp: (currentCase.incidentDate || '2026-03-14') + ' 16:15:00',
    chainOfCustodyDelayDays: 2,
    qcBatchNumber: 'QC-TOX-2026-0881',
    qcDeviationNotes: 'Internal standard recovery within 92-104% tolerance. Multi-point calibration linear R^2 = 0.9982.',
    chainOfCustodyGaps: [
      'Specimen transport courier log lacks signed custody transfer receipt between precinct locker and Crime Lab evidence room.',
      'Blood tube collection kit preservative (sodium fluoride anticoagulant) lot number and expiration date omitted from custody sheet.'
    ],
    components: defaultComponents
  };

  const [labData, setLabData] = useState<LabResultData>(initialLabData);
  const [components, setComponents] = useState<LabTestComponent[]>(
    currentCase.labResultData?.components && currentCase.labResultData.components.length > 0
      ? currentCase.labResultData.components
      : defaultComponents
  );

  const [activeSubTab, setActiveSubTab] = useState<'uncertainty' | 'substance_audit' | 'custody' | 'qc' | 'drug_knowledge' | 'manage' | 'export'>('uncertainty');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync state if currentCase changes
  useEffect(() => {
    if (currentCase.labResultData) {
      setLabData(currentCase.labResultData);
      if (currentCase.labResultData.components && currentCase.labResultData.components.length > 0) {
        setComponents(currentCase.labResultData.components);
      }
    }
  }, [currentCase.id, currentCase.labResultData]);

  // Form states for adding new substance
  const [newSubstance, setNewSubstance] = useState('');
  const [newValue, setNewValue] = useState<number>(0.083);
  const [newUnit, setNewUnit] = useState('g/100mL');
  const [newUncertainty, setNewUncertainty] = useState<number>(0.005);
  const [newCutoff, setNewCutoff] = useState<number>(0.080);
  const [newMethod, setNewMethod] = useState<'GC-MS' | 'LC-MS/MS' | 'GC-FID (Infrared)' | 'Immunoassay'>('GC-MS');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleUpdateLabHeader = (field: keyof LabResultData, val: any) => {
    const updated = { ...labData, [field]: val };
    setLabData(updated);
    onUpdateCase({
      ...currentCase,
      labResultData: updated
    });
  };

  const handleAddComponent = () => {
    if (!newSubstance.trim()) return;
    const added: LabTestComponent = {
      substance: newSubstance,
      detectedValue: newValue,
      unit: newUnit,
      cutoffLevel: newCutoff,
      therapeuticMin: 0.0,
      toxicMin: newValue * 1.5,
      uncertaintyRange: newUncertainty,
      testingMethod: newMethod,
      qcBatchPassed: true
    };

    const updatedComponents = [...components, added];
    setComponents(updatedComponents);

    const updatedLabData: LabResultData = {
      ...labData,
      components: updatedComponents
    };
    setLabData(updatedLabData);

    onUpdateCase({
      ...currentCase,
      labResultData: updatedLabData
    });

    setNewSubstance('');
  };

  const handleRemoveComponent = (idx: number) => {
    const updatedComponents = components.filter((_, i) => i !== idx);
    setComponents(updatedComponents);

    const updatedLabData: LabResultData = {
      ...labData,
      components: updatedComponents
    };
    setLabData(updatedLabData);

    onUpdateCase({
      ...currentCase,
      labResultData: updatedLabData
    });
  };

  const handleAddCustodyGap = (gapText: string) => {
    if (!gapText.trim()) return;
    const updatedGaps = [...labData.chainOfCustodyGaps, gapText.trim()];
    const updatedLabData = { ...labData, chainOfCustodyGaps: updatedGaps };
    setLabData(updatedLabData);
    onUpdateCase({
      ...currentCase,
      labResultData: updatedLabData
    });
  };

  const handleRemoveCustodyGap = (idx: number) => {
    const updatedGaps = labData.chainOfCustodyGaps.filter((_, i) => i !== idx);
    const updatedLabData = { ...labData, chainOfCustodyGaps: updatedGaps };
    setLabData(updatedLabData);
    onUpdateCase({
      ...currentCase,
      labResultData: updatedLabData
    });
  };

  // Uncertainty Data Calculations
  const uncertaintyAnalysis = components.map((c) => {
    const minBound = parseFloat((c.detectedValue - c.uncertaintyRange).toFixed(4));
    const maxBound = parseFloat((c.detectedValue + c.uncertaintyRange).toFixed(4));

    let defectType: 'STATUTORY_THRESHOLD_BREACH' | 'INACTIVE_METABOLITE' | 'BELOW_IMPAIRMENT' | 'WITHIN_THERAPEUTIC' | 'HIGH_CONCENTRATION' = 'WITHIN_THERAPEUTIC';
    let isBoundaryBreach = false;
    let explanation = '';

    if (c.unit === 'g/100mL' || c.substance.toLowerCase().includes('ethanol') || c.substance.toLowerCase().includes('bac')) {
      if (minBound < 0.080 && c.detectedValue >= 0.080) {
        isBoundaryBreach = true;
        defectType = 'STATUTORY_THRESHOLD_BREACH';
        explanation = `CRITICAL DEFECT: Reported BAC is ${c.detectedValue} ${c.unit}, but after applying the analytical measurement uncertainty (±${c.uncertaintyRange}), the true lower confidence bound drops to ${minBound} ${c.unit}, which falls below the statutory 0.080% per se threshold.`;
      } else {
        explanation = `BAC lower bound is ${minBound} ${c.unit} and upper bound is ${maxBound} ${c.unit}.`;
      }
    } else if (c.substance.toLowerCase().includes('carboxy-thc') || c.substance.toLowerCase().includes('metabolite')) {
      defectType = 'INACTIVE_METABOLITE';
      explanation = `Carboxy-THC is an inactive non-psychoactive metabolite indicating historical cannabis use days or weeks prior, NOT present impairment at time of operation (Commonwealth v. Gerhardt, 477 Mass. 775).`;
    } else if (c.substance.toLowerCase().includes('delta-9') || c.substance.toLowerCase().includes('thc')) {
      if (c.detectedValue < 5.0) {
        isBoundaryBreach = true;
        defectType = 'BELOW_IMPAIRMENT';
        explanation = `Delta-9-THC level (${c.detectedValue} ng/mL ± ${c.uncertaintyRange}) falls below accepted clinical boundaries for active impairment.`;
      }
    } else {
      explanation = `Concentration range is ${minBound} to ${maxBound} ${c.unit} via ${c.testingMethod}.`;
    }

    return {
      ...c,
      minBound,
      maxBound,
      isBoundaryBreach,
      defectType,
      explanation
    };
  });

  // Generate Case-Specific Motion to Suppress / In Limine Language for Lab & Uncertainty
  const generateLabMotionLanguage = (): string => {
    const client = currentCase.clientName || 'the Defendant';
    const docket = currentCase.caseNumber || 'Unassigned Docket';
    const court = currentCase.court || 'District Court';
    const agency = currentCase.arrestingAgency || 'Arresting Agency';
    const cert = labData.labCertificateId;
    const labName = labData.labName;

    const ethanolComponent = uncertaintyAnalysis.find(
      (u) => u.unit === 'g/100mL' || u.substance.toLowerCase().includes('ethanol')
    );

    let ethanolSection = '';
    if (ethanolComponent && ethanolComponent.minBound < 0.080) {
      ethanolSection = `
1. STATUTORY PER SE THRESHOLD DEFECT (M.G.L. c. 90 § 24(1)(a)(1)):
   The reported chemical blood alcohol concentration is ${ethanolComponent.detectedValue} g/100mL with an expanded measurement uncertainty of ±${ethanolComponent.uncertaintyRange} g/100mL (k=2, 95.45% confidence interval).
   Applying standard ISO 17025 forensic metrology principles, the true lower boundary of Defendant's BAC is ${ethanolComponent.minBound} g/100mL.
   Because ${ethanolComponent.minBound} g/100mL falls below the statutory threshold of 0.080 g/100mL, the Commonwealth cannot establish beyond a reasonable doubt that Defendant operated a motor vehicle with a blood alcohol concentration of 0.08% or greater under M.G.L. c. 90 § 24(1)(a)(1). See Commonwealth v. Senior, 433 Mass. 453 (2001) and Commonwealth v. Martin, 447 Mass. 274 (2006).`;
    }

    const thcComponent = uncertaintyAnalysis.find(
      (u) => u.substance.toLowerCase().includes('carboxy') || u.substance.toLowerCase().includes('thc')
    );
    let thcSection = '';
    if (thcComponent) {
      thcSection = `
2. CANNABIS METABOLITE INADMISSIBILITY (Commonwealth v. Gerhardt, 477 Mass. 775 (2017)):
   Toxicology findings listing inactive metabolites (e.g., 11-nor-9-Carboxy-THC at ${thcComponent.detectedValue} ng/mL) do not demonstrate impairment at the time of operation. Defendant moves in limine under Mass. G. Evid. § 403 to exclude all references to inactive cannabis metabolites, as the probative value is substantially outweighed by danger of unfair prejudice.`;
    }

    return `COMMONWEALTH OF MASSACHUSETTS
${court.toUpperCase()}
DOCKET NO. ${docket}

DEFENDANT'S MOTION IN LIMINE & MOTION TO SUPPRESS LAB TOXICOLOGY RESULTS
(ANALYTICAL MEASUREMENT UNCERTAINTY & CHAIN OF CUSTODY DEFECTS)

NOW COMES Defendant, ${client}, in the above-captioned matter and respectfully moves this Honorable Court pursuant to Mass. R. Crim. P. 13, M.G.L. c. 90 § 24(1)(e), M.G.L. c. 90 § 24K, 501 CMR 2.00, and Mass. G. Evid. §§ 403 & 702 to SUPPRESS or EXCLUDE all chemical laboratory certificate analysis results (Cert ID: ${cert}) issued by ${labName}.

STATEMENT OF GROUNDS:
1. Failure of the Commonwealth to prove per se intoxication beyond a reasonable doubt when accounting for GC/MS / GC-FID expanded measurement uncertainty (95.45% confidence interval).
2. Unbroken chain of custody gaps and unverified specimen preservation (M.G.L. c. 90 § 24K).
3. Admission of inactive metabolites lacking diagnostic correlation with real-time impairment.
${ethanolSection}${thcSection}

3. CHAIN OF CUSTODY & SPECIMEN DEGRADATION (M.G.L. c. 90 § 24K):
   The discovery records demonstrate ${labData.chainOfCustodyDelayDays} days between specimen collection (${labData.collectionTimestamp}) and laboratory receipt/analysis.
   The Commonwealth has failed to establish continuous temperature logging or proper sodium fluoride preservative ratios to prevent microbial fermentation and post-collection ethanol synthesis. See Commonwealth v. Zeininger, 459 Mass. 775 (2011) and Commonwealth v. Melendez, 407 Mass. 53 (1990).

PRAYER FOR RELIEF:
Defendant respectfully requests that this Court:
a. Order complete suppression of all numerical blood alcohol and toxicology concentrations from trial.
b. Preclude prosecution witnesses from stating or implying that Defendant exceeded the statutory 0.08% BAC threshold.
c. Exclude all references to inactive cannabis or drug metabolites.`;
  };

  // Cross-examination question generator
  const generateCrossExamQuestions = (): string[] => {
    return [
      `"Chemist, you agree that every scientific instrument has an inherent margin of measurement uncertainty, correct?"`,
      `"And for Certificate ${labData.labCertificateId}, the Crime Lab's expanded measurement uncertainty at the 95.45% confidence level is ±${uncertaintyAnalysis[0]?.uncertaintyRange || 0.005}, correct?"`,
      `"Which means scientifically, you cannot rule out that the true value of my client's sample was actually ${uncertaintyAnalysis[0]?.minBound || 0.078}, isn't that right?"`,
      `"And ${uncertaintyAnalysis[0]?.minBound || 0.078} is mathematically less than the Massachusetts statutory per se limit of 0.080, correct?"`,
      `"You were not present when the phlebotomist drew this blood sample at ${labData.collectionTimestamp}, correct?"`,
      `"You cannot testify from personal knowledge whether the blood tube was inverted 8 to 10 times to mix the anticoagulant, correct?"`,
      `"And you have no record showing the temperature of the courier transport vehicle during the ${labData.chainOfCustodyDelayDays}-day transit window, correct?"`
    ];
  };

  // Export File Handlers
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(labData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `lab_results_${labData.labCertificateId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Forensic Toxicology & Lab Analytics Report - ${currentCase.clientName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 35px; color: #0f172a; line-height: 1.5; }
    h1 { font-size: 22px; color: #1e293b; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f8fafc; border: 1px solid #cbd5e1; }
    .header-table td { padding: 10px 14px; border: 1px solid #e2e8f0; font-size: 13px; }
    table.data { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 25px; }
    table.data th, table.data td { border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 12px; text-align: left; }
    table.data th { background: #0f172a; color: #fff; text-transform: uppercase; font-size: 11px; }
    .alert-box { background: #fef2f2; border: 1px solid #fca5a5; padding: 14px; border-radius: 8px; color: #991b1b; margin-top: 20px; font-size: 12px; }
    .motion-box { background: #f0f9ff; border: 1px solid #bae6fd; padding: 16px; border-radius: 8px; color: #0c4a6e; font-family: monospace; white-space: pre-wrap; font-size: 11px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>FORENSIC TOXICOLOGY & MEASUREMENT UNCERTAINTY AUDIT REPORT</h1>
  <div class="subtitle">Client: ${currentCase.clientName} | Docket: ${currentCase.caseNumber} | Venue: ${currentCase.court}</div>

  <table class="header-table">
    <tr>
      <td><strong>Cert ID:</strong> ${labData.labCertificateId}</td>
      <td><strong>Laboratory:</strong> ${labData.labName}</td>
    </tr>
    <tr>
      <td><strong>Analyst / Chemist:</strong> ${labData.analystName}</td>
      <td><strong>Specimen Type:</strong> ${labData.sampleType}</td>
    </tr>
    <tr>
      <td><strong>Collection Timestamp:</strong> ${labData.collectionTimestamp}</td>
      <td><strong>Lab Receipt Timestamp:</strong> ${labData.labReceivedTimestamp}</td>
    </tr>
    <tr>
      <td><strong>QC Batch #:</strong> ${labData.qcBatchNumber}</td>
      <td><strong>Custody Transit Delay:</strong> ${labData.chainOfCustodyDelayDays} Days</td>
    </tr>
  </table>

  <h3>GC/MS & GC-FID MEASUREMENT UNCERTAINTY ANALYSIS</h3>
  <table class="data">
    <thead>
      <tr>
        <th>Substance</th>
        <th>Detected Value</th>
        <th>Testing Method</th>
        <th>Expanded Uncertainty (&plusmn;)</th>
        <th>Lower Confidence Bound (95.45%)</th>
        <th>Upper Confidence Bound</th>
        <th>Defect / Boundary Analysis</th>
      </tr>
    </thead>
    <tbody>
      ${uncertaintyAnalysis
        .map(
          (c) => `
        <tr>
          <td><strong>${c.substance}</strong></td>
          <td><strong>${c.detectedValue} ${c.unit}</strong></td>
          <td>${c.testingMethod}</td>
          <td>&plusmn; ${c.uncertaintyRange} ${c.unit}</td>
          <td><strong style="color: ${c.isBoundaryBreach ? '#dc2626' : '#0f172a'}">${c.minBound} ${c.unit}</strong></td>
          <td>${c.maxBound} ${c.unit}</td>
          <td>${c.explanation}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <h3>CHAIN OF CUSTODY DEFECT AUDIT</h3>
  <div class="alert-box">
    <strong>Identified Chain of Custody & Preservation Gaps:</strong>
    <ul>
      ${labData.chainOfCustodyGaps.map((g) => `<li>${g}</li>`).join('')}
    </ul>
  </div>

  <h3>FORMAL MOTION DRAFTING LANGUAGE FOR COUNSEL</h3>
  <div class="motion-box">${generateLabMotionLanguage()}</div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lab_forensic_report_${labData.labCertificateId}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          children: [
            new Paragraph({ text: 'FORENSIC TOXICOLOGY & MEASUREMENT UNCERTAINTY AUDIT REPORT', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Client: ${currentCase.clientName} | Docket: ${currentCase.caseNumber} | Venue: ${currentCase.court}` }),
            new Paragraph({ text: `Certificate ID: ${labData.labCertificateId}` }),
            new Paragraph({ text: `Laboratory: ${labData.labName}` }),
            new Paragraph({ text: `Analyst: ${labData.analystName}` }),
            new Paragraph({ text: `Specimen Type: ${labData.sampleType}` }),
            new Paragraph({ text: `Collection Date/Time: ${labData.collectionTimestamp}` }),
            new Paragraph({ text: `Lab Received Date/Time: ${labData.labReceivedTimestamp}` }),
            new Paragraph({ text: `Chain of Custody Delay: ${labData.chainOfCustodyDelayDays} days` }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '1. GC/MS & GC-FID TESTED SUBSTANCES & UNCERTAINTY BOUNDS', heading: HeadingLevel.HEADING_2 }),
            ...uncertaintyAnalysis.flatMap((c) => [
              new Paragraph({ text: `Substance: ${c.substance}`, heading: HeadingLevel.HEADING_3 }),
              new Paragraph({ text: `Detected Concentration: ${c.detectedValue} ${c.unit}` }),
              new Paragraph({ text: `Expanded Uncertainty (k=2, 95.45% CI): ±${c.uncertaintyRange} ${c.unit}` }),
              new Paragraph({ text: `Lower Confidence Bound: ${c.minBound} ${c.unit} | Upper Confidence Bound: ${c.maxBound} ${c.unit}` }),
              new Paragraph({ text: `Testing Method: ${c.testingMethod}` }),
              new Paragraph({ text: `Forensic Evaluation: ${c.explanation}` }),
              new Paragraph({ text: '' })
            ]),
            new Paragraph({ text: '2. CHAIN OF CUSTODY & PRESERVATION AUDIT FINDINGS', heading: HeadingLevel.HEADING_2 }),
            ...labData.chainOfCustodyGaps.map((gap) => new Paragraph({ text: `• ${gap}` })),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '3. FORMAL MOTION DRAFTING LANGUAGE FOR DEFENSE COUNSEL', heading: HeadingLevel.HEADING_2 }),
            ...generateLabMotionLanguage()
              .split('\n')
              .map((line) => new Paragraph({ text: line }))
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lab_report_${labData.labCertificateId}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLabFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'json') {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.components && Array.isArray(parsed.components)) {
          setComponents(parsed.components);
          const updated = { ...labData, ...parsed };
          setLabData(updated);
          onUpdateCase({
            ...currentCase,
            labResultData: updated
          });
        }
      } catch (err) {
        console.error('Failed to parse uploaded lab JSON:', err);
      }
    } else {
      const text = await file.text();
      const newDoc = {
        id: `doc_${Date.now()}`,
        name: file.name,
        type: 'other' as const,
        uploadDate: new Date().toISOString().split('T')[0],
        parsedText: text,
        pages: [{ pageNumber: 1, paragraphs: [{ paragraphNumber: 1, text }] }],
        status: 'parsed' as const
      };
      onUpdateCase({
        ...currentCase,
        documents: [...currentCase.documents, newDoc]
      });
    }
    e.target.value = '';
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <FlaskConical className="w-6 h-6 text-blue-700" />
            <h3 className="text-xl font-bold text-slate-900">Lab Results & Forensic Toxicology Analytics</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            GC/MS & LC-MS/MS expanded measurement uncertainty ranges, statutory threshold boundary analysis, and chain-of-custody delay timelines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-mono font-bold flex items-center shadow-2xs">
            <Scale className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            Cert ID: {labData.labCertificateId}
          </div>
        </div>
      </div>

      {/* Case Context & Lab Metadata Bar */}
      <div className="p-4 bg-slate-900 text-white rounded-xl mb-6 shadow-xs border border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Active Client & Docket</span>
            <span className="font-bold text-white block">{currentCase.clientName || 'Client Name'}</span>
            <span className="text-[11px] font-mono text-blue-300">Docket: {currentCase.caseNumber || 'Unassigned'}</span>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Laboratory & Analyst</span>
            <span className="font-semibold text-slate-200 block truncate">{labData.labName}</span>
            <span className="text-[11px] text-slate-400 block truncate">{labData.analystName}</span>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Specimen & Collection</span>
            <span className="font-bold text-emerald-400 block">{labData.sampleType} Specimen</span>
            <span className="text-[11px] font-mono text-slate-300 block">{labData.collectionTimestamp}</span>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Custody Delay & Gaps</span>
            <span className="font-bold text-amber-400 block">{labData.chainOfCustodyDelayDays} Days Transit Delay</span>
            <span className="text-[11px] text-red-300 font-medium block">{labData.chainOfCustodyGaps.length} Custody Defects</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3 mb-6">
        <button
          onClick={() => setActiveSubTab('substance_audit')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'substance_audit' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5 mr-1.5 text-blue-300" />
          Substance Identification Audit Table
        </button>

        <button
          onClick={() => setActiveSubTab('uncertainty')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'uncertainty' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 mr-1.5" />
          GC/MS Uncertainty & Statutory Bounds ({components.length})
        </button>

        <button
          onClick={() => setActiveSubTab('custody')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'custody' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Clock className="w-3.5 h-3.5 mr-1.5" />
          Chain of Custody & Delay Timeline
        </button>

        <button
          onClick={() => setActiveSubTab('qc')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'qc' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
          QC Batch & Calibration Audit
        </button>

        <button
          onClick={() => setActiveSubTab('drug_knowledge')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'drug_knowledge' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-extrabold'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 mr-1.5 text-purple-700" />
          MSPCL Seized Drug & Tox Knowledge Hub
        </button>

        <button
          onClick={() => setActiveSubTab('manage')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'manage' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Manage Substances & Metadata
        </button>

        <button
          onClick={() => setActiveSubTab('export')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'export' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Printer className="w-3.5 h-3.5 mr-1.5" />
          Export Center & Motion Language
        </button>
      </div>

      {/* SUB-TAB 0: SUBSTANCE IDENTIFICATION AUDIT TABLE */}
      {activeSubTab === 'substance_audit' && (
        <SubstanceInventoryAudit currentCase={currentCase} onUpdateCase={onUpdateCase} />
      )}

      {/* SUB-TAB 1: UNCERTAINTY & STATUTORY BOUNDARY AUDIT */}
      {activeSubTab === 'uncertainty' && (
        <div className="space-y-6">
          <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
            <h4 className="font-bold text-sm text-blue-950 mb-1 flex items-center">
              <Sliders className="w-4 h-4 mr-2 text-blue-700" />
              Forensic Measurement Uncertainty (ISO 17025 Standard)
            </h4>
            In criminal forensic science, every laboratory result MUST be reported with an expanded measurement uncertainty (k=2, 95.45% confidence interval). When a reported blood alcohol level is close to a statutory threshold (e.g. 0.080 g/100mL), the lower confidence bound (Detected Value minus Uncertainty Range) dictates whether the prosecution can prove per se intoxication beyond a reasonable doubt.
          </div>

          {/* Table of Substances and Bounds */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900 text-white font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Tested Substance</th>
                  <th className="p-3">Detected Concentration</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Expanded Uncertainty (±)</th>
                  <th className="p-3">Lower Confidence Bound (95.45%)</th>
                  <th className="p-3">Upper Confidence Bound</th>
                  <th className="p-3">Statutory & Defect Evaluation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {uncertaintyAnalysis.map((u, i) => (
                  <tr key={i} className={u.isBoundaryBreach ? 'bg-red-50/70' : 'hover:bg-slate-50'}>
                    <td className="p-3 font-bold text-slate-900">
                      {u.substance}
                      <span className="block text-[10px] text-slate-500 font-mono">Cutoff: {u.cutoffLevel} {u.unit}</span>
                    </td>
                    <td className="p-3 font-mono font-bold text-blue-700">
                      {u.detectedValue} {u.unit}
                    </td>
                    <td className="p-3 text-slate-600 font-semibold">{u.testingMethod}</td>
                    <td className="p-3 font-mono text-slate-700">±{u.uncertaintyRange} {u.unit}</td>
                    <td className="p-3 font-mono font-bold">
                      <span className={u.isBoundaryBreach ? 'text-red-700 bg-red-100 px-2 py-0.5 rounded border border-red-300' : 'text-slate-800'}>
                        {u.minBound} {u.unit}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-700">{u.maxBound} {u.unit}</td>
                    <td className="p-3 text-[11px] leading-relaxed">
                      {u.isBoundaryBreach ? (
                        <div className="text-red-900 font-semibold flex items-start space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5 mr-1 text-red-600 shrink-0 mt-0.5" />
                          <span>{u.explanation}</span>
                        </div>
                      ) : (
                        <span className="text-slate-700">{u.explanation}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bar Chart Sizing Comparison */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center">
              <FlaskConical className="w-4 h-4 mr-1.5 text-blue-700" />
              Concentration vs Lower/Upper Confidence Intervals
            </h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={uncertaintyAnalysis.map((u) => ({
                    name: u.substance.length > 15 ? u.substance.slice(0, 15) + '...' : u.substance,
                    LowerBound: u.minBound,
                    Detected: u.detectedValue,
                    UpperBound: u.maxBound
                  }))}
                  margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '6px', color: '#fff', fontSize: '11px' }} />
                  <Bar dataKey="LowerBound" name="Lower Confidence Bound (95.45%)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Detected" name="Reported Detected Value" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="UpperBound" name="Upper Confidence Bound" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Potential Motion Issue for Attorney Review Box */}
          <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-blue-400" />
                <h4 className="text-sm font-bold text-white">
                  Potential Motion Issue for Attorney Review (Analytical Uncertainty Defense for {currentCase.clientName})
                </h4>
              </div>
              <button
                onClick={() => handleCopyText('motion_lang', generateLabMotionLanguage())}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md transition-colors flex items-center shadow-2xs"
              >
                {copiedId === 'motion_lang' ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-300" />
                    Copied Motion Text!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy Motion Paragraphs
                  </>
                )}
              </button>
            </div>

            <pre className="text-xs font-mono text-slate-200 bg-slate-950 p-4 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed select-all max-h-64 overflow-y-auto">
              {generateLabMotionLanguage()}
            </pre>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CHAIN OF CUSTODY & DELAY TIMELINE */}
      {activeSubTab === 'custody' && (
        <div className="space-y-6">
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed">
            <h4 className="font-bold text-sm text-amber-900 mb-1 flex items-center">
              <Clock className="w-4 h-4 mr-2 text-amber-700" />
              Specimen Degradation & Chain of Custody Audit
            </h4>
            Under M.G.L. c. 90 § 24K and 501 CMR 2.00, blood and chemical specimens must be handled with strict continuous chain of custody tracking, including temperature control and preservative verification. Delays between specimen draw and laboratory analysis can result in microbial fermentation (generating post-collection ethanol) or anticoagulant degradation.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Timeline Cards */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Specimen Custody Chronology
              </h4>

              <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-start space-x-3 text-xs">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-md shrink-0 font-bold">1</div>
                <div>
                  <span className="font-bold text-slate-900 block">Specimen Collection (Blood Draw)</span>
                  <span className="font-mono text-slate-600 block">{labData.collectionTimestamp}</span>
                  <p className="text-[11px] text-slate-500 mt-1">Performed at hospital / precinct by medical personnel.</p>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-start space-x-3 text-xs">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-md shrink-0 font-bold">2</div>
                <div>
                  <span className="font-bold text-slate-900 block">Courier Transit & Evidence Lockup</span>
                  <span className="font-mono text-slate-600 block">Delay: {labData.chainOfCustodyDelayDays} Day(s)</span>
                  <p className="text-[11px] text-slate-500 mt-1">Stored in precinct evidence locker pending state lab transfer.</p>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-start space-x-3 text-xs">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-md shrink-0 font-bold">3</div>
                <div>
                  <span className="font-bold text-slate-900 block">State Crime Lab Ingestion</span>
                  <span className="font-mono text-slate-600 block">{labData.labReceivedTimestamp}</span>
                  <p className="text-[11px] text-slate-500 mt-1">Received by {labData.labName} toxicology intake unit.</p>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-start space-x-3 text-xs">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-md shrink-0 font-bold">4</div>
                <div>
                  <span className="font-bold text-slate-900 block">Chemical Analysis & Certification</span>
                  <span className="font-mono text-slate-600 block">{labData.analysisTimestamp}</span>
                  <p className="text-[11px] text-slate-500 mt-1">Tested by {labData.analystName} via GC-MS / GC-FID.</p>
                </div>
              </div>
            </div>

            {/* Identified Custody Defects */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                  <ShieldAlert className="w-4 h-4 mr-1.5 text-red-600" />
                  Chain of Custody Defects & Gaps ({labData.chainOfCustodyGaps.length})
                </h4>
              </div>

              <div className="space-y-2">
                {labData.chainOfCustodyGaps.map((gap, idx) => (
                  <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start justify-between text-xs">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span className="text-red-950 font-medium">{gap}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveCustodyGap(idx)}
                      className="text-slate-400 hover:text-red-600 ml-2"
                      title="Remove Defect"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Custody Gap Input */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <label className="text-[10px] font-bold text-slate-600 block">Flag New Chain of Custody Defect</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    id="newCustodyGapInput"
                    placeholder="e.g. Courier transport refrigeration log unverified..."
                    className="flex-1 p-2 text-xs border border-slate-300 rounded-md bg-white"
                  />
                  <button
                    onClick={() => {
                      const el = document.getElementById('newCustodyGapInput') as HTMLInputElement;
                      if (el && el.value) {
                        handleAddCustodyGap(el.value);
                        el.value = '';
                      }
                    }}
                    className="px-3 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-md"
                  >
                    Add Defect
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Cross Examination Questions for Chain of Custody */}
          <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold text-white">
                  Cross-Examination Question Plan (Chain of Custody & Analyst)
                </h4>
              </div>
              <button
                onClick={() => handleCopyText('cross_exam', generateCrossExamQuestions().join('\n'))}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-md transition-colors flex items-center shadow-2xs"
              >
                {copiedId === 'cross_exam' ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-300" />
                    Copied Questions!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy Questions
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono text-slate-200 bg-slate-950 p-4 rounded-lg border border-slate-800">
              {generateCrossExamQuestions().map((q, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <span className="text-amber-400 font-bold shrink-0">{idx + 1}.</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: QC BATCH & CALIBRATION AUDIT */}
      {activeSubTab === 'qc' && (
        <div className="space-y-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed">
            <h4 className="font-bold text-sm text-slate-900 mb-1 flex items-center">
              <ShieldAlert className="w-4 h-4 mr-2 text-blue-700" />
              Quality Control (QC) & Instrumental Calibration Parameters
            </h4>
            Auditing the Quality Control batch data ensures that the Gas Chromatograph / Mass Spectrometer (GC-MS or LC-MS/MS) was operating within certified linear calibration ranges ($R^2 \ge 0.995$), that blank runs showed no carryover, and that internal standard recovery stayed within acceptable parameters.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">QC Batch Identifier</span>
              <p className="text-base font-bold font-mono text-blue-700">{labData.qcBatchNumber}</p>
              <span className="text-[11px] text-emerald-600 font-semibold block mt-1 flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                QC Batch Acceptance Passed
              </span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Calibration Curve Linearity</span>
              <p className="text-base font-bold font-mono text-slate-900">R² = 0.9982</p>
              <span className="text-[11px] text-slate-500 block mt-1">6-point calibration standard (0.010 - 0.400 g/100mL)</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Internal Standard Recovery</span>
              <p className="text-base font-bold font-mono text-slate-900">92% - 104%</p>
              <span className="text-[11px] text-slate-500 block mt-1">d4-Ethanol / Deuterated internal standard</span>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Quality Control Auditor Notes
            </h4>
            <textarea
              rows={3}
              value={labData.qcDeviationNotes || ''}
              onChange={(e) => handleUpdateLabHeader('qcDeviationNotes', e.target.value)}
              placeholder="Enter QC batch notes, carryover findings, or calibration drift observations..."
              className="w-full p-3 text-xs border border-slate-300 rounded-lg bg-slate-50 font-mono text-slate-800 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>
      )}

      {/* SUB-TAB 3.5: MSPCL SEIZED DRUG & TOXICOLOGY KNOWLEDGE HUB */}
      {activeSubTab === 'drug_knowledge' && (
        <div className="space-y-6">
          <div className="p-4 bg-purple-950 text-white rounded-xl space-y-2 border border-purple-800 shadow-xs">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-purple-400" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                MSPCL Seized Drug Chemistry & Toxicology Knowledge Engine
              </h4>
            </div>
            <p className="text-xs text-purple-200 leading-relaxed">
              Audits seized drug analyses and toxicology reports against the <strong>Massachusetts State Police Crime Laboratory Item Analysis Policy (ID: 4163 Rev 6, Feb 2026)</strong>, <strong>Seized Drug Hypergeometric Sampling Notices ($k=0.7$ / $k=0.9$ at 95% CL, June 2026)</strong>, <strong>OUI Blood Dual-Testing Directives (Feb 2026)</strong>, and <strong>Forensic Resource Counsel Defense Standards</strong>.
            </p>
          </div>

          {/* Module 1: Seized Drug Hypergeometric Sampling Verifier */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Gauge className="w-5 h-5 text-purple-700" />
                <h5 className="font-bold text-sm text-slate-900">1. Hypergeometric Statistical Sampling & Homogeneity Verifier</h5>
              </div>
              <span className="text-[10px] font-bold uppercase bg-purple-100 text-purple-900 px-2.5 py-1 rounded-full border border-purple-200">
                MSPCL Notice (June 10, 2026) & ISO SOP § 4.10.10.1
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              When analyzing multi-unit drug seizures (e.g. glassine bags, pills, vapes), laboratories use Hypergeometric sampling to test a subset and infer that at least 70% ($k=0.7$) or 90% ($k=0.9$) of the population contains the controlled substance. <strong>CRITICAL MANDATE:</strong> Under MSPCL SOP § 4.10.10.1, the population MUST be strictly homogeneous in size, weight, color, packaging, and chemical test reaction. Any variation VOIDS the hypergeometric sampling plan!
            </p>

            {labData.drugSeizureItems && labData.drugSeizureItems.length > 0 ? (
              <div className="space-y-4">
                {labData.drugSeizureItems.map((item, idx) => (
                  <div key={item.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900">{item.itemDescription}</span>
                      <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Tested {item.testedItemCount} of {item.totalItemCount} Units ({item.samplingPlanUsed})
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">Reported Net Weight</span>
                        <span className="font-mono font-bold text-slate-900">{item.reportedNetWeightGrams} g</span>
                        <span className="text-[10px] text-slate-500 block">Uncertainty: ±{item.weightUncertaintyGrams} g</span>
                      </div>

                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">Physical Homogeneity</span>
                        <span className={`font-bold block ${item.homogeneityVerified ? 'text-emerald-700' : 'text-red-700'}`}>
                          {item.homogeneityVerified ? 'VERIFIED IDENTICAL' : 'NON-HOMOGENEOUS'}
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">Marquis Color Test</span>
                        <span className={`font-bold block ${item.colorTestIdentical ? 'text-emerald-700' : 'text-red-700'}`}>
                          {item.colorTestIdentical ? 'UNIFORM REACTION' : 'DIVERGENT COLOR'}
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">Primary Method</span>
                        <span className="font-bold text-purple-700 block">{item.primaryMethod}</span>
                        <span className="text-[10px] text-slate-500 block">GC-MS Confirmed: {item.confirmatoryGCMSDone ? 'Yes' : 'NO'}</span>
                      </div>
                    </div>

                    {(!item.homogeneityVerified || !item.colorTestIdentical) && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 space-y-1">
                        <span className="font-bold flex items-center text-red-950">
                          <AlertTriangle className="w-4 h-4 mr-1.5 text-red-600" />
                          HYPERGEOMETRIC SAMPLING VOIDED UNDER MSPCL SOP § 4.10.10.1
                        </span>
                        <p>
                          Bench notes indicate color test or physical variation ({item.colorTestDetails || 'Marquis reagent color result differed across units'}). Under MSPCL Seized Drug policy, non-identical results strictly prohibit using Hypergeometric statistical inference. The Commonwealth cannot testify that untested bags contain controlled substances!
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 text-center">
                No seized drug items attached to current lab result. Click "Manage Substances & Metadata" to add drug items.
              </div>
            )}
          </div>

          {/* Module 2: Net Weight vs Balance Uncertainty Threshold Calculator */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Scale className="w-5 h-5 text-blue-700" />
                <h5 className="font-bold text-sm text-slate-900">2. Net Weight vs. Expanded Balance Uncertainty ($U_{`\\text{final}`}$) Calculator</h5>
              </div>
              <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-900 px-2.5 py-1 rounded-full border border-blue-200">
                M.G.L. c. 94C § 32E Statutory Weights
              </span>
            </div>

            <div className="p-4 bg-slate-900 text-white rounded-lg space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Reported Net Weight</span>
                  <span className="text-base font-mono font-bold text-amber-400">
                    {labData.drugSeizureItems?.[0]?.reportedNetWeightGrams || 28.12} grams
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Stated Uncertainty ($U_{`\\text{final}`}$)</span>
                  <span className="text-base font-mono font-bold text-blue-400">
                    ±{labData.drugSeizureItems?.[0]?.weightUncertaintyGrams || 0.18} grams
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Lower Bound ($W_{`\\text{net}`} - U_{`\\text{final}`}$)</span>
                  <span className="text-base font-mono font-bold text-emerald-400">
                    {((labData.drugSeizureItems?.[0]?.reportedNetWeightGrams || 28.12) - (labData.drugSeizureItems?.[0]?.weightUncertaintyGrams || 0.18)).toFixed(3)} grams
                  </span>
                </div>
              </div>

              {((labData.drugSeizureItems?.[0]?.reportedNetWeightGrams || 28.12) - (labData.drugSeizureItems?.[0]?.weightUncertaintyGrams || 0.18)) < (labData.drugSeizureItems?.[0]?.statutoryThresholdGrams || 28.00) ? (
                <div className="p-3 bg-amber-900/60 border border-amber-500/50 rounded text-amber-200 space-y-1">
                  <span className="font-bold flex items-center text-amber-300">
                    <ShieldAlert className="w-4 h-4 mr-1 text-amber-400" />
                    DEFENSE MOTION STRATEGY: Weight Uncertainty Spans Statutory Threshold ({labData.drugSeizureItems?.[0]?.statutoryThresholdGrams || 28.00}g)
                  </span>
                  <p className="text-[11px]">
                    The lower bound of net weight ({((labData.drugSeizureItems?.[0]?.reportedNetWeightGrams || 28.12) - (labData.drugSeizureItems?.[0]?.weightUncertaintyGrams || 0.18)).toFixed(3)}g) drops below the statutory threshold of {labData.drugSeizureItems?.[0]?.statutoryThresholdGrams || 28.00}g under M.G.L. c. 94C § 32E. Move to dismiss the higher trafficking bracket!
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Net weight lower bound remains above statutory threshold. Verify if packaging (gross vs net weight) was completely separated prior to weighing.
                </p>
              )}
            </div>
          </div>

          {/* Module 3: FTIR vs GC-MS Method Reliability Comparison */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <FlaskConical className="w-5 h-5 text-indigo-700" />
                <h5 className="font-bold text-sm text-slate-900">3. Analytical Method Inspector: FTIR vs. GC-MS Reliability</h5>
              </div>
              <span className="text-[10px] font-bold uppercase bg-indigo-100 text-indigo-900 px-2.5 py-1 rounded-full border border-indigo-200">
                Mass. R. Evid. 702 & SWGDRUG Guidelines
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <span className="font-bold text-slate-900 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600" />
                  FTIR (Fourier Transform Infrared Spectroscopy) Limitations
                </span>
                <ul className="list-disc pl-4 space-y-1 text-slate-700">
                  <li><strong>Impure Street Drug Mixtures:</strong> FTIR requires sample purity &gt;90%. Street drugs cut with adulterants yield overlapping, uninterpretable spectra.</li>
                  <li><strong>Optical Isomers Unresolvable:</strong> FTIR <em>cannot distinguish optical isomers</em> (e.g. L-methamphetamine in OTC Vicks inhalers vs illegal D-methamphetamine).</li>
                  <li><strong>Pre-Sept 2020 Subjectivity:</strong> Historical SOP required spectra to "compare favorably" (eyeballing). Current SOP requires 6 labeled peaks within ±1 cm⁻¹.</li>
                </ul>
              </div>

              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                <span className="font-bold text-emerald-950 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-700" />
                  GC-MS (Gas Chromatography - Mass Spectrometry) Gold Standard
                </span>
                <ul className="list-disc pl-4 space-y-1 text-emerald-900">
                  <li><strong>Chromatographic Separation:</strong> GC vaporizes and separates mixture components along column by retention time before mass analysis.</li>
                  <li><strong>Molecular Fingerprint:</strong> MS bombards molecules to determine exact mass-to-charge ($m/z$) structural fragment ratios.</li>
                  <li><strong>Mandatory Controls:</strong> Requires GC blank immediately preceding sample run and reference standard match.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Module 4: MSPCL Policy ID 4163 Rev 6 Compliance Matrix */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-red-700" />
                <h5 className="font-bold text-sm text-slate-900">4. MSPCL Crime Laboratory Item Analysis Policy (ID 4163 Rev 6) Intake Matrix</h5>
              </div>
              <span className="text-[10px] font-bold uppercase bg-red-100 text-red-900 px-2.5 py-1 rounded-full border border-red-200">
                Mandatory Intake Prohibitions
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900 block">Syringe Intake Restriction (§ 2.5.1)</span>
                <p className="text-[11px] text-slate-600">
                  Hypodermic syringes strictly REJECTED without Director approval in non-homicide cases.
                </p>
                <span className="inline-block mt-1 font-bold text-[10px] text-purple-700">
                  Audit: {labData.drugPolicyAudits?.containsSyringe ? (labData.drugPolicyAudits?.syringeHasHomicideApproval ? 'Approved Homicide' : 'VIOLATION FLAGGED') : 'Compliant / No Syringe'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900 block">Drug Packaging DNA/Prints (§ 2.4.1)</span>
                <p className="text-[11px] text-slate-600">
                  DNA and latent print processing strictly BANNED on packaging for possession-only charges.
                </p>
                <span className="inline-block mt-1 font-bold text-[10px] text-purple-700">
                  Audit: {labData.drugPolicyAudits?.drugPackagingDNAOrPrintRequested ? 'VIOLATION FLAGGED' : 'Compliant'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900 block">Found Items & CI Buys (§ 5.1.1)</span>
                <p className="text-[11px] text-slate-600">
                  No testing permitted for found items, overdoses without suspects, or Confidential Informant buys.
                </p>
                <span className="inline-block mt-1 font-bold text-[10px] text-purple-700">
                  Audit: {labData.drugPolicyAudits?.isFoundItemOrCIBuy ? 'PROHIBITED ITEM FLAGGED' : 'Compliant'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900 block">OUI Blood Dual Testing (Feb 2026)</span>
                <p className="text-[11px] text-slate-600">
                  ALL OUI blood samples MUST undergo ethanol AND drug testing regardless of BAC level.
                </p>
                <span className="inline-block mt-1 font-bold text-[10px] text-purple-700">
                  Audit: {labData.ouiToxicologyAudits?.isOUIBloodDraw ? (labData.ouiToxicologyAudits?.testedDrugs ? 'Compliant Dual Report' : 'MISSING DRUG REPORT') : 'N/A Non-Blood Case'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900 block">OUI Urine Alcohol Ban (§ 6.1.3)</span>
                <p className="text-[11px] text-slate-600">
                  OUI cases containing only urine specimens shall be evaluated for DRUGS ONLY (no alcohol).
                </p>
                <span className="inline-block mt-1 font-bold text-[10px] text-purple-700">
                  Audit: {labData.ouiToxicologyAudits?.attemptedUrineEthanol ? 'PROHIBITED URINE ALCOHOL' : 'Compliant'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900 block">Task-Irrelevant Bias (Dror et al.)</span>
                <p className="text-[11px] text-slate-600">
                  Analyst exposed to suspect name, DOB, or police conclusions prior to testing.
                </p>
                <span className="inline-block mt-1 font-bold text-[10px] text-purple-700">
                  Audit: {labData.drugPolicyAudits?.analystReceivedSuspectContext ? 'COGNITIVE BIAS RISK' : 'Blind Analysis'}
                </span>
              </div>
            </div>
          </div>

          {/* Module 5: Cross-Examination & Voir Dire Question Bank */}
          <div className="p-5 bg-slate-900 text-white rounded-xl space-y-3">
            <h5 className="font-bold text-sm text-white flex items-center">
              <HelpCircle className="w-4 h-4 mr-2 text-purple-400" />
              Defense Cross-Examination & Voir Dire Question Bank (Forensic Resource Counsel Standards)
            </h5>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="p-2.5 bg-slate-800 rounded border border-slate-700">
                <strong>Q1 (Hypergeometric Homogeneity):</strong> "Chemist, before applying hypergeometric sampling, your SOP § 4.10.10.1 requires visual and chemical homogeneity across every unit. You recorded divergent Marquis color test reactions between Item 4a and Item 4b, correct?"
              </div>
              <div className="p-2.5 bg-slate-800 rounded border border-slate-700">
                <strong>Q2 (Sampling Inferences):</strong> "And because the color test results were non-identical, under your laboratory's own June 10, 2026 notice, you were prohibited from extrapolating drug identity or weight to the untested bags?"
              </div>
              <div className="p-2.5 bg-slate-800 rounded border border-slate-700">
                <strong>Q3 (Net Weight Uncertainty):</strong> "Your reported net weight of 28.12 grams carries an expanded balance uncertainty of ±0.18 grams, meaning the true net weight could be as low as 27.94 grams-below the 28-gram statutory threshold?"
              </div>
              <div className="p-2.5 bg-slate-800 rounded border border-slate-700">
                <strong>Q4 (FTIR Limitations):</strong> "You performed FTIR spectroscopy without confirmatory GC-MS. Is it true that FTIR cannot distinguish between optical isomers like L-methamphetamine found in OTC nasal sprays and D-methamphetamine?"
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: MANAGE SUBSTANCES & METADATA */}
      {activeSubTab === 'manage' && (
        <div className="space-y-6">
          {/* Editable Header Parameters */}
          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Edit Certificate Metadata
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Certificate ID</label>
                <input
                  type="text"
                  value={labData.labCertificateId}
                  onChange={(e) => handleUpdateLabHeader('labCertificateId', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Testing Laboratory Name</label>
                <input
                  type="text"
                  value={labData.labName}
                  onChange={(e) => handleUpdateLabHeader('labName', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Analyst / Chemist Name</label>
                <input
                  type="text"
                  value={labData.analystName}
                  onChange={(e) => handleUpdateLabHeader('analystName', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Specimen Type</label>
                <select
                  value={labData.sampleType}
                  onChange={(e) => handleUpdateLabHeader('sampleType', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white"
                >
                  <option value="Blood">Blood Specimen</option>
                  <option value="Breath">Breath Sample</option>
                  <option value="Urine">Urine Specimen</option>
                  <option value="Oral Fluid">Oral Fluid Specimen</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Collection Timestamp</label>
                <input
                  type="text"
                  value={labData.collectionTimestamp}
                  onChange={(e) => handleUpdateLabHeader('collectionTimestamp', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Lab Received Timestamp</label>
                <input
                  type="text"
                  value={labData.labReceivedTimestamp}
                  onChange={(e) => handleUpdateLabHeader('labReceivedTimestamp', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Add Custom Component Form */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
              <Plus className="w-4 h-4 mr-1.5 text-blue-700" />
              Add Toxicology Component / Substance
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Substance Name</label>
                <input
                  type="text"
                  placeholder="e.g. Fentanyl, Delta-9-THC..."
                  value={newSubstance}
                  onChange={(e) => setNewSubstance(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Detected Concentration Value</label>
                <input
                  type="number"
                  step="0.001"
                  value={newValue}
                  onChange={(e) => setNewValue(parseFloat(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Unit</label>
                <input
                  type="text"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Expanded Uncertainty (±)</label>
                <input
                  type="number"
                  step="0.001"
                  value={newUncertainty}
                  onChange={(e) => setNewUncertainty(parseFloat(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Cutoff Level</label>
                <input
                  type="number"
                  step="0.001"
                  value={newCutoff}
                  onChange={(e) => setNewCutoff(parseFloat(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Testing Method</label>
                <select
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value as any)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white text-xs font-semibold"
                >
                  <option value="GC-MS">GC-MS</option>
                  <option value="LC-MS/MS">LC-MS/MS</option>
                  <option value="GC-FID (Infrared)">GC-FID (Infrared)</option>
                  <option value="Immunoassay">Immunoassay</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleAddComponent}
              className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors shadow-2xs"
            >
              Add Substance to Certificate Record
            </button>
          </div>

          {/* Component Removal List */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3">Substance</th>
                  <th className="p-3">Detected</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Uncertainty</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {components.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{c.substance}</td>
                    <td className="p-3 font-mono font-bold text-blue-700">
                      {c.detectedValue} {c.unit}
                    </td>
                    <td className="p-3 text-slate-600">{c.testingMethod}</td>
                    <td className="p-3 font-mono text-slate-700">
                      ±{c.uncertaintyRange} {c.unit}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleRemoveComponent(i)}
                        className="p-1 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                        title="Remove Substance"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: EXPORT CENTER & PRINT */}
      {activeSubTab === 'export' && (
        <div className="space-y-6">
          <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2">
            <h4 className="text-sm font-bold text-white flex items-center">
              <Printer className="w-4 h-4 mr-2 text-blue-400" />
              Forensic Toxicology Export Center
            </h4>
            <p className="text-xs text-slate-300">
              Export comprehensive, litigation-ready forensic toxicology analysis reports containing full measurement uncertainty tables, statutory threshold lower confidence calculations, chain of custody defect timelines, and motion drafting language.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => window.print()}
              className="p-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs text-left transition-colors space-y-2"
            >
              <Printer className="w-6 h-6 text-slate-700" />
              <span className="font-bold text-sm text-slate-900 block">Print / PDF Report</span>
              <span className="text-[11px] text-slate-500 block">Generates a high-contrast print stylesheet report.</span>
            </button>

            <button
              onClick={handleExportDocx}
              className="p-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl shadow-2xs text-left transition-colors space-y-2"
            >
              <FileCode className="w-6 h-6 text-blue-200" />
              <span className="font-bold text-sm text-white block">DOCX Word Document</span>
              <span className="text-[11px] text-blue-100 block">Complete court-ready Word document report.</span>
            </button>

            <button
              onClick={handleExportHtml}
              className="p-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs text-left transition-colors space-y-2"
            >
              <Code2 className="w-6 h-6 text-slate-700" />
              <span className="font-bold text-sm text-slate-900 block">HTML Standalone Report</span>
              <span className="text-[11px] text-slate-500 block">Includes embedded styling and motion arguments.</span>
            </button>

            <button
              onClick={handleExportJson}
              className="p-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs text-left transition-colors space-y-2"
            >
              <FileJson className="w-6 h-6 text-slate-700" />
              <span className="font-bold text-sm text-slate-900 block">JSON Raw Lab Data</span>
              <span className="text-[11px] text-slate-500 block">Full machine-readable lab dataset.</span>
            </button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLabFileUpload}
                accept=".pdf,.json,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.bmp,.docx,.txt"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center shadow-2xs"
              >
                <Upload className="w-4 h-4 mr-2 text-blue-400" />
                Ingest New Lab Certificate File (PDF / Image / JSON)
              </button>
            </div>
            <span className="text-xs text-slate-500">Supports PDF, JSON, DOCX, HTML, and Images</span>
          </div>
        </div>
      )}
    </div>
  );
};
