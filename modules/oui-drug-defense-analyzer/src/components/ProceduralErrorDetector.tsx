import React, { useState, useRef } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  FileSearch,
  Filter,
  Printer,
  FileJson,
  Code2,
  FileCode,
  Upload,
  Copy,
  Check,
  Scale,
  BookOpen,
  Search,
  Sliders,
  Clock,
  Calendar,
  User,
  Building2,
  ChevronRight,
  CheckSquare,
  Square,
  Trash2,
  HelpCircle,
  RefreshCw,
  Layers,
  FileText
} from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { ProceduralError, ErrorSeverity, ErrorCategory, CaseData } from '../types';

interface ProceduralErrorDetectorProps {
  errors: ProceduralError[];
  isAnalyzing: boolean;
  currentCase?: CaseData;
  onUpdateCase?: (updatedCase: CaseData) => void;
}

export const ProceduralErrorDetector: React.FC<ProceduralErrorDetectorProps> = ({
  errors,
  isAnalyzing,
  currentCase,
  onUpdateCase
}) => {
  // Navigation tabs
  const [activeSubTab, setActiveSubTab] = useState<'defects' | 'discrepancies' | 'audit_matrix' | 'omnibus'>('defects');

  // Filters & Search
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLayer, setSelectedLayer] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected defects for Omnibus Motion
  const [selectedErrorIds, setSelectedErrorIds] = useState<string[]>(errors.map((e) => e.id));

  // Copy feedback tracking
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleToggleSelectError = (id: string) => {
    if (selectedErrorIds.includes(id)) {
      setSelectedErrorIds(selectedErrorIds.filter((i) => i !== id));
    } else {
      setSelectedErrorIds([...selectedErrorIds, id]);
    }
  };

  const handleSelectAllErrors = () => {
    if (selectedErrorIds.length === errors.length) {
      setSelectedErrorIds([]);
    } else {
      setSelectedErrorIds(errors.map((e) => e.id));
    }
  };

  // Filtered errors array
  const filteredErrors = errors.filter((err) => {
    if (selectedSeverity !== 'ALL' && err.severity !== selectedSeverity) return false;
    if (selectedLayer !== 'ALL' && err.sourceLayer !== selectedLayer) return false;
    if (selectedCategory !== 'ALL' && err.category !== selectedCategory) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchTitle = err.title.toLowerCase().includes(term);
      const matchDesc = err.description.toLowerCase().includes(term);
      const matchQuote = err.verbatimQuote.toLowerCase().includes(term);
      const matchStandard = err.standardViolated.toLowerCase().includes(term);
      const matchStrategy = err.evidentiaryExclusionStrategy.toLowerCase().includes(term);
      if (!matchTitle && !matchDesc && !matchQuote && !matchStandard && !matchStrategy) return false;
    }
    return true;
  });

  // Metrics
  const criticalCount = errors.filter((e) => e.severity === 'CRITICAL').length;
  const highCount = errors.filter((e) => e.severity === 'HIGH').length;
  const layerACount = errors.filter((e) => e.sourceLayer === 'RULE_ENGINE').length;
  const layerBCount = errors.filter((e) => e.sourceLayer === 'AI_MODEL').length;

  // Case context variables
  const clientName = currentCase?.clientName || 'the Defendant';
  const caseNumber = currentCase?.caseNumber || 'MA-2026-8812';
  const courtName = currentCase?.court || 'District Court';
  const arrestingAgency = currentCase?.arrestingAgency || 'Massachusetts State Police / Local Dept';

  // Defensive Tactical Impact & Cross-Exam Helper
  const getTacticalInfo = (err: ProceduralError) => {
    let tacticalImpact = '';
    let crossExamQuestion = '';

    switch (err.category) {
      case 'Observation Window':
        tacticalImpact = 'CRITICAL DEFECT: Invalidates 501 CMR 2.13 mandatory 15-minute uninterrupted observation period. Requires complete exclusion of Draeger Alcotest 9510 breath test results and all numerical BAC evidence at trial.';
        crossExamQuestion = `"Officer, during the 15-minute window before administering the breath test, you were actively completing arrest paperwork and inspecting the cruiser, correct? Meaning your eyes were not continuously fixed on my client for every single second?"`;
        break;
      case 'Exit Order':
        tacticalImpact = 'CONSTITUTIONAL DEFECT: Violates Article 14 of the Mass. Declaration of Rights and Commonwealth v. Gonsalves. Lacks reasonable suspicion of danger or criminal activity. All evidence obtained after the exit order (SFSTs, statements, breath sample) must be suppressed as fruit of the poisonous tree.';
        crossExamQuestion = `"Officer, when you ordered my client out of the vehicle, they had produced a valid driver's license and registration, correct? And you had not observed any weapons or furtive gestures inside the cabin, correct?"`;
        break;
      case 'SFST Administration':
        tacticalImpact = 'METHODOLOGICAL DEFECT: Non-standard administration or scoring of SFSTs compromises test reliability under NHTSA manuals and Mass. G. Evid. § 702. Undermines officer lay opinion regarding coordination and balance.';
        crossExamQuestion = `"Officer, the NHTSA manual explicitly states that if the test is not administered in the standardized manner, the validity of the results is compromised, correct?"`;
        break;
      case 'Cannabis Impairment':
        tacticalImpact = 'EVIDENTIARY DEFECT: Under Commonwealth v. Gerhardt, 477 Mass. 775, officers are strictly prohibited from offering lay opinion testimony that a defendant was "impaired by marijuana" or failed SFSTs due to cannabis.';
        crossExamQuestion = `"Officer, you acknowledge that there is no scientifically recognized per se threshold for cannabis impairment in blood or oral fluid, correct?"`;
        break;
      case 'Refusal Characterization':
        tacticalImpact = 'CONSTITUTIONAL DEFECT: Under Commonwealth v. Davis, 481 Mass. 440, refusal to submit to a chemical breath or blood test is strictly inadmissible at trial to show consciousness of guilt.';
        crossExamQuestion = `"Officer, you agree that under Massachusetts law, a motorist has a statutory right to refuse a breath test, correct?"`;
        break;
      case 'Draeger Calibration':
        tacticalImpact = 'INSTRUMENTAL DEFECT: Non-compliance with 501 CMR 2.00 or annual calibration / simulator solution tolerances invalidates breath certificate certification.';
        crossExamQuestion = `"Officer, you personally did not perform the annual calibration or certified solution verification on this Draeger unit, correct?"`;
        break;
      default:
        tacticalImpact = 'PROCEDURAL DEFECT: Violates statutory mandate or administrative protocol, creating reasonable doubt regarding evidence integrity.';
        crossExamQuestion = `"Officer, you are required to follow established department procedure for evidence logging and reporting in all OUI investigations, correct?"`;
        break;
    }

    return { tacticalImpact, crossExamQuestion };
  };

  // Case-Specific Motion Issue Summary
  const generateCaseMotionText = (err: ProceduralError): string => {
    const { tacticalImpact } = getTacticalInfo(err);
    return `COMMONWEALTH OF MASSACHUSETTS
${courtName.toUpperCase()}
DOCKET NO. ${caseNumber}

DEFENDANT'S MOTION IN LIMINE & MOTION TO SUPPRESS
REGARDING: ${err.title.toUpperCase()}

NOW COMES Defendant, ${clientName}, in the above-captioned matter and respectfully moves this Honorable Court pursuant to Mass. R. Crim. P. 13, M.G.L. c. 90 § 24, 501 CMR 2.00, and Article 14 of the Massachusetts Declaration of Rights to EXCLUDE or SUPPRESS all evidence stemming from the procedural violation documented in Discovery (${err.pageParagraphRef.documentName || 'Police Report'}, Page ${err.pageParagraphRef.pageNumber}, Paragraph ${err.pageParagraphRef.paragraphNumber}).

GROUNDS:
1. SPECIFIC DEFECT IDENTIFIED:
   The prosecution records establish that: "${err.verbatimQuote}"
   This constitutes a direct violation of ${err.standardViolated}.

2. EVIDENTIARY IMPACT & LEGAL PRECEDENT:
   ${tacticalImpact}
   As set forth in ${err.standardViolated}, the Commonwealth cannot satisfy its burden of proving compliance beyond a reasonable doubt.

3. PRAYER FOR RELIEF:
   Defendant respectfully requests that this Court issue an Order prohibiting the Commonwealth from introducing or referencing any testimony, chemical test results, or observations derived from this procedural defect.`;
  };

  // Generate Omnibus Motion Document
  const generateOmnibusMotionText = (): string => {
    const selectedDefects = errors.filter((e) => selectedErrorIds.includes(e.id));

    if (selectedDefects.length === 0) {
      return `COMMONWEALTH OF MASSACHUSETTS\n${courtName.toUpperCase()}\nDOCKET NO. ${caseNumber}\n\nCOMMONWEALTH v. ${clientName.toUpperCase()}\n\n[No procedural defects selected for inclusion in Omnibus Motion]`;
    }

    const counts = selectedDefects
      .map((err, idx) => {
        return `COUNT ${idx + 1}: ${err.title.toUpperCase()}
Category: ${err.category} | Authority: ${err.standardViolated}
Location: ${err.pageParagraphRef.documentName || 'Discovery Document'}, Page ${err.pageParagraphRef.pageNumber}, Paragraph ${err.pageParagraphRef.paragraphNumber}

Verbatim Record: "${err.verbatimQuote}"

Legal Argument & Basis for Suppression:
${err.description}

Defendant's Exclusionary Strategy:
${err.evidentiaryExclusionStrategy}
`;
      })
      .join('\n--------------------------------------------------------------------------------\n\n');

    return `COMMONWEALTH OF MASSACHUSETTS
${courtName.toUpperCase()}
DOCKET NO. ${caseNumber}

COMMONWEALTH OF MASSACHUSETTS
v.
${clientName.toUpperCase()}, DEFENDANT

DEFENDANT'S OMNIBUS MOTION TO SUPPRESS EVIDENCE & MOTION IN LIMINE
(PURSUANT TO MASS. R. CRIM. P. 13 & ARTICLE 14 OF MASS. DECLARATION OF RIGHTS)

NOW COMES the Defendant, ${clientName}, by and through undersigned counsel, and respectfully moves this Honorable Court pursuant to Mass. R. Crim. P. 13, M.G.L. c. 90 § 24, 501 CMR 2.00, and Articles 12 and 14 of the Massachusetts Declaration of Rights to SUPPRESS and EXCLUDE from evidence at trial all chemical test results, field sobriety observations, officer opinions, and physical evidence seized as a result of unlawful police procedures by ${arrestingAgency}.

STATEMENT OF GROUNDS:
The discovery produced by the Commonwealth demonstrates ${selectedDefects.length} distinct procedural, statutory, and constitutional defects:

${counts}

PRAYER FOR RELIEF:
WHEREFORE, the Defendant respectfully requests that this Honorable Court:
1. Schedule an evidentiary hearing on Defendant's Omnibus Motion to Suppress.
2. Order complete suppression of all chemical test readings, breath certificates, and officer opinion testimony affected by the above-detailed procedural violations.
3. Grant such other and further relief as this Court deems just and proper.

Respectfully submitted,
DEFENDANT, ${clientName.toUpperCase()}
By Counsel,

____________________________________
Massachusetts Bar No.: _____________
Date: ${new Date().toLocaleDateString()}`;
  };

  // Export File Handlers
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredErrors, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `procedural_defects_${caseNumber}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Procedural Defects Audit - ${clientName} (${caseNumber})</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 35px; color: #0f172a; line-height: 1.5; }
    h1 { font-size: 22px; color: #1e293b; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: #f8fafc; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-right: 6px; }
    .critical { background: #dc2626; color: #fff; }
    .high { background: #d97706; color: #fff; }
    .medium { background: #2563eb; color: #fff; }
    .quote { background: #fff; border-left: 3px solid #1d4ed8; padding: 10px 14px; font-family: monospace; font-size: 12px; margin: 10px 0; border: 1px solid #e2e8f0; }
    .motion-box { background: #f0f9ff; border: 1px solid #bae6fd; padding: 16px; border-radius: 8px; color: #0c4a6e; font-family: monospace; white-space: pre-wrap; font-size: 11px; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>PROCEDURAL ERROR & EVIDENCE INCONSISTENCY AUDIT REPORT</h1>
  <div class="subtitle">Client: ${clientName} | Docket: ${caseNumber} | Venue: ${courtName} | Agency: ${arrestingAgency}</div>

  <p>Total Defects Identified: <strong>${errors.length}</strong> (Filtered: ${filteredErrors.length})</p>

  ${filteredErrors
    .map((err) => {
      const { tacticalImpact, crossExamQuestion } = getTacticalInfo(err);
      return `
    <div class="card">
      <div>
        <span class="badge ${err.severity.toLowerCase()}">${err.severity}</span>
        <strong>${err.category}</strong> &bull; ${err.pageParagraphRef.documentName || 'Discovery'}, p. ${err.pageParagraphRef.pageNumber}, ¶ ${err.pageParagraphRef.paragraphNumber}
      </div>
      <h3 style="margin: 8px 0 4px 0; color: #0f172a;">${err.title}</h3>
      <p style="font-size: 13px; margin: 0 0 8px 0; color: #334155;">${err.description}</p>
      <div class="quote">"${err.verbatimQuote}"</div>
      <div style="font-size: 12px; margin-bottom: 6px;"><strong>Potential Standard / Authority:</strong> ${err.standardViolated}</div>
      <div style="font-size: 12px; margin-bottom: 6px; color: #1e3a8a;"><strong>Tactical Trial Impact:</strong> ${tacticalImpact}</div>
      <div style="font-size: 12px; color: #854d0e;"><strong>Cross-Exam Lead:</strong> ${crossExamQuestion}</div>
      <div class="motion-box">${generateCaseMotionText(err)}</div>
    </div>
  `;
    })
    .join('')}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `procedural_defects_report_${caseNumber}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          children: [
            new Paragraph({ text: "DEFENDANT'S OMNIBUS MOTION TO SUPPRESS & PROCEDURAL AUDIT", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Client: ${clientName} | Docket: ${caseNumber} | Venue: ${courtName}` }),
            new Paragraph({ text: `Arresting Agency: ${arrestingAgency}` }),
            new Paragraph({ text: `Total Errors Identified: ${filteredErrors.length}` }),
            new Paragraph({ text: '' }),
            ...filteredErrors.flatMap((err, idx) => {
              const { tacticalImpact, crossExamQuestion } = getTacticalInfo(err);
              return [
                new Paragraph({ text: `COUNT ${idx + 1}: [${err.severity}] ${err.title}`, heading: HeadingLevel.HEADING_2 }),
                new Paragraph({ text: `Category: ${err.category} | Location: ${err.pageParagraphRef.documentName || 'Discovery'}, Page ${err.pageParagraphRef.pageNumber}, Paragraph ${err.pageParagraphRef.paragraphNumber}` }),
                new Paragraph({ text: `Description: ${err.description}` }),
                new Paragraph({ text: `Verbatim Discovery Quote: "${err.verbatimQuote}"` }),
                new Paragraph({ text: `Potential Standard / Authority: ${err.standardViolated}` }),
                new Paragraph({ text: `Tactical Defense Impact: ${tacticalImpact}` }),
                new Paragraph({ text: `Cross-Examination Question: ${crossExamQuestion}` }),
                new Paragraph({ text: '' })
              ];
            }),
            new Paragraph({ text: 'COMPLETE OMNIBUS MOTION TEXT', heading: HeadingLevel.HEADING_1 }),
            ...generateOmnibusMotionText()
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
    link.download = `omnibus_motion_${caseNumber}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !onUpdateCase || !currentCase) return;

    try {
      const file = files[0];
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
    } catch (err) {
      console.error('File upload failed in ProceduralErrorDetector:', err);
    }
    e.target.value = '';
  };

  // Sample timeline discrepancies for Tab B
  const timelineDiscrepancies = [
    {
      time: '01:14 AM',
      topic: 'Initial Vehicle Observation & Traffic Stop',
      docA: 'Police Narrative Report (p. 1, ¶ 2)',
      statementA: 'Observed vehicle marked with MA Reg. crossing double yellow line three times over 200 yards.',
      docB: 'CAD Dispatch Log (p. 1, ¶ 1)',
      statementB: 'Officer logged self-initiated traffic stop at 01:14:02 AM. No preliminary BOLO or erratic driving call registered.',
      discrepancy: '14-second delta between dispatched stop time and reported 200-yard observation span. Vehicles traveling at 35 mph cover 200 yards in 11.7 seconds.',
      impact: 'Constitutional basis for initial stop under Article 14 requires reasonable suspicion of traffic infraction.'
    },
    {
      time: '01:26 AM',
      topic: 'Exit Order Basis & Motorist Demeanor',
      docA: 'Police Narrative Report (p. 2, ¶ 1)',
      statementA: 'Ordered motorist out of vehicle due to slurred speech, glassy eyes, and inability to locate vehicle registration.',
      docB: 'Booking Video / Officer Body Camera Log (p. 1, ¶ 4)',
      statementB: 'Motorist retrieved registration card from glovebox in 8 seconds without dropping items; spoken voice steady.',
      discrepancy: 'Direct contradiction between narrative claim of motor impairment vs video evidence demonstrating fluid fine motor skill.',
      impact: 'Commonwealth v. Gonsalves violation. Exit order lacks reasonable suspicion of danger or crime.'
    },
    {
      time: '01:38 AM',
      topic: 'Draeger 15-Minute Observation Window',
      docA: 'Draeger Alcotest 9510 Ticket (Cert ID: 8812)',
      statementA: 'Observation start time recorded as 01:22 AM. Breath test sample #1 taken at 01:37 AM (15 mins).',
      docB: 'Cruiser Transport Log / Booking Search Sheet',
      statementB: 'Officer was conducting pat-frisk search and hand-custody transfer from 01:28 AM to 01:34 AM inside booking cell.',
      discrepancy: 'Officer eyes were not continuously focused on motorist for 15 unbroken minutes per 501 CMR 2.13 mandate.',
      impact: 'Mandatory suppression of Draeger breath certificate under M.G.L. c. 90 § 24(1)(e).'
    }
  ];

  // 10 Massachusetts Procedural Checkpoints for Tab C
  const proceduralCheckpoints = [
    {
      title: '501 CMR 2.13 Uninterrupted 15-Minute Observation',
      category: 'Observation Window',
      status: errors.some((e) => e.category === 'Observation Window') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Continuous 1:1 visual monitoring with no chewing gum, regurgitation, or mouth contents prior to breath test.',
      citation: '501 CMR 2.13 / M.G.L. c. 90 § 24(1)(e)'
    },
    {
      title: 'Article 14 Exit Order Reasonable Suspicion',
      category: 'Exit Order',
      status: errors.some((e) => e.category === 'Exit Order') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Police must articulate specific safety threat or reasonable suspicion of OUI before ordering motorist out.',
      citation: 'Commonwealth v. Gonsalves, 429 Mass. 658'
    },
    {
      title: 'NHTSA SFST Standardized Administration',
      category: 'SFST Administration',
      status: errors.some((e) => e.category === 'SFST Administration') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Strict adherence to 45-degree HGN onset, 9-step Walk & Turn line, and 30-second One-Leg Stand timing.',
      citation: 'Mass. G. Evid. § 702 / NHTSA Manual'
    },
    {
      title: 'Prohibition on Cannabis Lay Impairment Opinion',
      category: 'Cannabis Impairment',
      status: errors.some((e) => e.category === 'Cannabis Impairment') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Officers cannot state lay opinion that defendant was impaired by marijuana or failed SFSTs due to cannabis.',
      citation: 'Commonwealth v. Gerhardt, 477 Mass. 775'
    },
    {
      title: 'Exclusion of Breath/Blood Refusal Evidence',
      category: 'Refusal Characterization',
      status: errors.some((e) => e.category === 'Refusal Characterization') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Strict prohibition against mentioning breath test refusal or refusal to take SFSTs at trial.',
      citation: 'Commonwealth v. Davis, 481 Mass. 440'
    },
    {
      title: '501 CMR 2.00 Draeger Calibration & Simulator Compliance',
      category: 'Draeger Calibration',
      status: errors.some((e) => e.category === 'Draeger Calibration') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Annual certification, calibration log verification, and simulator solution temperature tolerances.',
      citation: '501 CMR 2.00 / Commonwealth v. Anoushsiravani'
    },
    {
      title: 'M.G.L. c. 90 § 24K Specimen Chain of Custody',
      category: 'Chain of Custody',
      status: errors.some((e) => e.category === 'Chain of Custody') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Continuous temperature logging, preservative verification, and unbroken transit receipts.',
      citation: 'M.G.L. c. 90 § 24K / Commonwealth v. Zeininger'
    },
    {
      title: 'M.G.L. c. 263 § 5A Statutory Right to Independent Doctor',
      category: 'Statutory Rights',
      status: errors.some((e) => e.category === 'Statutory Rights') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Arrestee must be informed of right to immediate independent physician examination at their expense.',
      citation: 'M.G.L. c. 263 § 5A'
    },
    {
      title: 'Discovery Timeline & CAD Discrepancy Verification',
      category: 'Timeline Contradiction',
      status: errors.some((e) => e.category === 'Timeline Contradiction') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Cross-checking officer narrative timestamps against CAD dispatch logs and booking cell video.',
      citation: 'Mass. R. Crim. P. 14'
    },
    {
      title: 'GC/MS Forensic Uncertainty & Lower Confidence Bound',
      category: 'Lab Analysis',
      status: errors.some((e) => e.category === 'Lab Analysis') ? 'VIOLATION DETECTED' : 'NO VIOLATION FLAGGED',
      description: 'Applying expanded uncertainty (k=2) to confirm BAC lower bound exceeds statutory 0.080 threshold.',
      citation: 'ISO 17025 Standard / Commonwealth v. Senior'
    }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-6 h-6 text-red-600" />
            <h3 className="text-xl font-bold text-slate-900">
              Procedural Error & Evidence Inconsistency Detector
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Dual-Layer Audit Engine: Layer A (Deterministic Massachusetts Rules) + Layer B (AI Timeline & Discrepancy Finder).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-mono font-bold flex items-center shadow-2xs">
            <Scale className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            Client: {clientName} | Docket: {caseNumber}
          </div>
        </div>
      </div>

      {/* Case Context & Flag Breakdown Banner */}
      <div className="p-4 bg-slate-900 text-white rounded-xl mb-6 shadow-xs border border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Active Client & Docket</span>
            <span className="font-bold text-white block">{clientName}</span>
            <span className="text-[11px] font-mono text-blue-300">Docket: {caseNumber}</span>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Court & Agency</span>
            <span className="font-semibold text-slate-200 block truncate">{courtName}</span>
            <span className="text-[11px] text-slate-400 block truncate">{arrestingAgency}</span>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Critical & High Defects</span>
            <span className="font-bold text-red-400 text-sm block">{criticalCount} Critical Defects</span>
            <span className="text-[11px] text-amber-300 font-semibold block">{highCount} High Severity</span>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Dual-Layer Engine</span>
            <span className="font-bold text-blue-300 block">Layer A Rules: {layerACount}</span>
            <span className="text-[11px] text-purple-300 font-semibold block">Layer B AI: {layerBCount}</span>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Omnibus Motion Selection</span>
            <span className="font-bold text-emerald-400 block">{selectedErrorIds.length} / {errors.length} Selected</span>
            <button
              onClick={handleSelectAllErrors}
              className="mt-1 text-[10px] font-bold text-blue-300 hover:underline text-left"
            >
              {selectedErrorIds.length === errors.length ? 'Deselect All' : 'Select All Defects'}
            </button>
          </div>
        </div>
      </div>

      {/* Primary Detector Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3 mb-6">
        <button
          onClick={() => setActiveSubTab('defects')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'defects' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
          Flagged Procedural Defects ({errors.length})
        </button>

        <button
          onClick={() => setActiveSubTab('discrepancies')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'discrepancies' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Clock className="w-3.5 h-3.5 mr-1.5" />
          Evidence Discrepancy & Timeline Matrix ({timelineDiscrepancies.length})
        </button>

        <button
          onClick={() => setActiveSubTab('audit_matrix')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'audit_matrix' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
          MA Procedural Checkpoints Matrix (10 Points)
        </button>

        <button
          onClick={() => setActiveSubTab('omnibus')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center ${
            activeSubTab === 'omnibus' ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          Omnibus Motion Builder & Exporter
        </button>
      </div>

      {/* SUB-TAB 1: FLAGGED PROCEDURAL DEFECT CARDS */}
      {activeSubTab === 'defects' && (
        <div className="space-y-6">
          {/* Search Bar & Filters Header */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search defects by quote, rule, citation, or motion keyword..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-600"
              >
                <option value="ALL">All Categories ({errors.length})</option>
                <option value="Observation Window">Observation Window</option>
                <option value="Exit Order">Exit Order</option>
                <option value="SFST Administration">SFST Administration</option>
                <option value="Cannabis Impairment">Cannabis Impairment</option>
                <option value="Refusal Characterization">Refusal Characterization</option>
                <option value="Draeger Calibration">Draeger Calibration</option>
                <option value="Chain of Custody">Chain of Custody</option>
                <option value="Statutory Rights">Statutory Rights</option>
                <option value="Timeline Contradiction">Timeline Contradiction</option>
                <option value="Lab Analysis">Lab Analysis</option>
              </select>

              {/* Layer Origin Filter */}
              <select
                value={selectedLayer}
                onChange={(e) => setSelectedLayer(e.target.value)}
                className="font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-600"
              >
                <option value="ALL">All Layers</option>
                <option value="RULE_ENGINE">Layer A: Rule Engine ({layerACount})</option>
                <option value="AI_MODEL">Layer B: AI Engine ({layerBCount})</option>
              </select>

              {/* Severity Filter */}
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-600"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical ({criticalCount})</option>
                <option value="HIGH">High ({highCount})</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          {/* Document Upload & Global Export Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100 rounded-lg border border-slate-200 print:hidden">
            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.json,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.bmp,.docx,.txt"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5 text-blue-700" />
                Upload Discovery Document (PDF / Image / DOCX / TXT)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                Print
              </button>
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
              >
                <FileJson className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                JSON
              </button>
              <button
                onClick={handleExportHtml}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
              >
                <Code2 className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                HTML
              </button>
              <button
                onClick={handleExportDocx}
                className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition-colors flex items-center shadow-2xs"
              >
                <FileCode className="w-3.5 h-3.5 mr-1.5" />
                Export DOCX Report
              </button>
            </div>
          </div>

          {/* Loader or Defects List */}
          {isAnalyzing ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-700 border-t-transparent mb-3" />
              <p className="text-sm font-semibold text-slate-800">Executing Dual-Layer Defense Engine...</p>
              <p className="text-xs text-slate-500 mt-1">Scanning discovery text for 15-minute window, exit order basis, and SFST deviations.</p>
            </div>
          ) : filteredErrors.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-sm">
              No procedural defects matched current search and filter criteria.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredErrors.map((err) => {
                const isCritical = err.severity === 'CRITICAL';
                const isHigh = err.severity === 'HIGH';
                const isRuleEngine = err.sourceLayer === 'RULE_ENGINE';
                const isSelected = selectedErrorIds.includes(err.id);
                const { tacticalImpact, crossExamQuestion } = getTacticalInfo(err);

                return (
                  <div
                    key={err.id}
                    className={`p-5 rounded-xl border transition-all ${
                      isCritical
                        ? 'bg-red-50/50 border-red-200'
                        : isHigh
                        ? 'bg-amber-50/50 border-amber-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Top Status & Chips Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        {/* Checkbox for Omnibus Selection */}
                        <button
                          onClick={() => handleToggleSelectError(err.id)}
                          className="flex items-center text-slate-700 hover:text-blue-700 mr-1"
                          title="Select / Deselect for Omnibus Motion"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-700" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        {/* Severity Badge */}
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            isCritical
                              ? 'bg-red-600 text-white'
                              : isHigh
                              ? 'bg-amber-600 text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          {err.severity}
                        </span>

                        {/* Category Badge */}
                        <span className="text-xs font-semibold px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded-full border border-slate-200">
                          {err.category}
                        </span>

                        {/* Page & Paragraph Ref */}
                        <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          p. {err.pageParagraphRef.pageNumber}, ¶ {err.pageParagraphRef.paragraphNumber}
                        </span>

                        {/* Doc ID & Timestamp */}
                        {err.pageParagraphRef.documentId && (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                            Doc ID: {err.pageParagraphRef.documentId}
                          </span>
                        )}
                        {err.pageParagraphRef.timestamp && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md border border-amber-300">
                            Time: {err.pageParagraphRef.timestamp}
                          </span>
                        )}

                        {/* Layer Origin Chip */}
                        {isRuleEngine ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md border border-blue-300">
                            LAYER A: DETERMINISTIC
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md border border-purple-300 flex items-center">
                            <Cpu className="w-3 h-3 mr-1" />
                            LAYER B: AI DETECTED
                          </span>
                        )}

                        {/* Verification Status Chip */}
                        {err.verificationStatus === 'VERIFIED' ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md border border-emerald-300 flex items-center">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            VERIFIED QUOTE
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md border border-amber-300 flex items-center">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            UNVERIFIED QUOTE
                          </span>
                        )}
                      </div>

                      <span className="text-xs font-semibold text-slate-600 truncate max-w-xs">
                        {err.pageParagraphRef.documentName || 'Discovery Document'}
                      </span>
                    </div>

                    <h4 className="text-base font-bold text-slate-900 mb-1">{err.title}</h4>
                    <p className="text-xs text-slate-700 mb-3 leading-relaxed">{err.description}</p>

                    {/* Verbatim Discovery Quote Callout Box */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 font-mono text-xs text-slate-800">
                      <span className="text-[10px] font-sans uppercase tracking-wider text-slate-500 block mb-1 font-bold">
                        Discovery Verbatim Quote ({err.pageParagraphRef.documentName || 'File'}, Page {err.pageParagraphRef.pageNumber}, Para {err.pageParagraphRef.paragraphNumber}):
                      </span>
                      &ldquo;{err.verbatimQuote}&rdquo;
                    </div>

                    {/* Standard & Legal Authority Violated */}
                    <div className="p-3 bg-red-50/70 border border-red-200 rounded-lg mb-3 text-xs">
                      <div className="flex items-center text-red-900 font-bold mb-1">
                        <Scale className="w-3.5 h-3.5 mr-1.5 text-red-700 shrink-0" />
                        Standard & Legal Authority Violated:
                      </div>
                      <div className="text-red-950 font-medium">{err.standardViolated}</div>
                    </div>

                    {/* Tactical Trial Impact & Cross-Exam Lead */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-xs">
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg">
                        <div className="flex items-center text-amber-950 font-bold mb-1">
                          <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-700 shrink-0" />
                          Tactical Defense Impact:
                        </div>
                        <p className="text-amber-900 leading-relaxed text-[11px]">{tacticalImpact}</p>
                      </div>

                      <div className="p-3 bg-slate-900 text-white rounded-lg border border-slate-800">
                        <div className="flex items-center text-amber-400 font-bold mb-1">
                          <HelpCircle className="w-3.5 h-3.5 mr-1.5 text-amber-400 shrink-0" />
                          Cross-Examination Lead Question:
                        </div>
                        <p className="text-slate-200 font-mono text-[11px] leading-relaxed">{crossExamQuestion}</p>
                      </div>
                    </div>

                    {/* Potential Motion Issue for Counsel Review */}
                    <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-lg text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-blue-950 font-bold text-sm">
                          <BookOpen className="w-4 h-4 mr-2 text-blue-700 shrink-0" />
                          Case-Specific Motion Paragraph (Formatted for Counsel)
                        </div>
                        <button
                          onClick={() => handleCopyText(err.id, generateCaseMotionText(err))}
                          className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white font-bold text-[11px] rounded-md transition-colors flex items-center shadow-2xs shrink-0"
                        >
                          {copiedId === err.id ? (
                            <>
                              <Check className="w-3 h-3 mr-1 text-emerald-300" />
                              Copied Motion Text!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />
                              Copy Motion Paragraph
                            </>
                          )}
                        </button>
                      </div>

                      <pre className="p-3 bg-white border border-blue-200 rounded-md font-mono text-[11px] text-slate-800 leading-relaxed overflow-x-auto whitespace-pre-wrap select-all max-h-48">
                        {generateCaseMotionText(err)}
                      </pre>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: EVIDENCE DISCREPANCY & TIMELINE MATRIX */}
      {activeSubTab === 'discrepancies' && (
        <div className="space-y-6">
          <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-950 leading-relaxed">
            <h4 className="font-bold text-sm text-blue-950 mb-1 flex items-center">
              <Clock className="w-4 h-4 mr-2 text-blue-700" />
              Cross-Document Evidence Discrepancy Matrix
            </h4>
            Compares statements, timestamps, and physical observations recorded in Police Narrative Reports against CAD Dispatch Logs, Draeger Breath Tickets, and Booking Video Logs. Direct contradictions impeach officer credibility and invalidate statutory prerequisites.
          </div>

          <div className="space-y-4">
            {timelineDiscrepancies.map((disc, idx) => (
              <div key={idx} className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-900 text-sm flex items-center">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mr-2" />
                    {disc.topic}
                  </span>
                  <span className="font-mono font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-md border border-amber-300">
                    Timestamp: {disc.time}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-bold text-blue-800 block mb-1">{disc.docA}</span>
                    <p className="font-mono text-slate-800 text-[11px]">&ldquo;{disc.statementA}&rdquo;</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-bold text-purple-800 block mb-1">{disc.docB}</span>
                    <p className="font-mono text-slate-800 text-[11px]">&ldquo;{disc.statementB}&rdquo;</p>
                  </div>
                </div>

                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-950">
                  <span className="font-bold text-red-900 block mb-1">Discrepancy / Time Delta Analysis:</span>
                  <p className="text-[11px] font-medium leading-relaxed">{disc.discrepancy}</p>
                </div>

                <div className="p-3 bg-slate-900 text-white rounded-lg">
                  <span className="font-bold text-amber-400 block mb-1">Evidentiary Exclusion Impact:</span>
                  <p className="text-[11px] text-slate-200 leading-relaxed">{disc.impact}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PROCEDURAL CHECKPOINTS MATRIX */}
      {activeSubTab === 'audit_matrix' && (
        <div className="space-y-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed">
            <h4 className="font-bold text-sm text-slate-900 mb-1 flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-2 text-blue-700" />
              Massachusetts OUI Procedural Compliance Audit Matrix
            </h4>
            Reviews discovery against the 10 core Massachusetts statutory, regulatory, and constitutional standards governing drunk driving prosecutions.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {proceduralCheckpoints.map((cp, idx) => {
              const isViolated = cp.status === 'VIOLATION DETECTED';
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border ${
                    isViolated ? 'bg-red-50/60 border-red-200' : 'bg-emerald-50/50 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900">{cp.title}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        isViolated ? 'bg-red-600 text-white' : 'bg-emerald-700 text-white'
                      }`}
                    >
                      {cp.status}
                    </span>
                  </div>

                  <p className="text-slate-700 mb-2 leading-relaxed text-[11px]">{cp.description}</p>
                  <span className="font-mono text-[10px] text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block font-semibold">
                    Authority: {cp.citation}
                  </span>

                  {isViolated && (
                    <button
                      onClick={() => {
                        setSelectedCategory(cp.category);
                        setActiveSubTab('defects');
                      }}
                      className="mt-3 text-[11px] font-bold text-red-700 hover:underline flex items-center"
                    >
                      View Flagged Defects in this Category <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: OMNIBUS MOTION BUILDER & EXPORTER */}
      {activeSubTab === 'omnibus' && (
        <div className="space-y-6">
          <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-base font-bold text-white flex items-center">
                  <FileText className="w-5 h-5 text-blue-400 mr-2" />
                  Compiled Omnibus Motion to Suppress & Motion in Limine
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Includes {selectedErrorIds.length} of {errors.length} selected procedural defects formatted for Mass. District Court filing.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleCopyText('omnibus_text', generateOmnibusMotionText())}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md transition-colors flex items-center shadow-2xs"
                >
                  {copiedId === 'omnibus_text' ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-300" />
                      Copied Full Motion!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copy Omnibus Text
                    </>
                  )}
                </button>

                <button
                  onClick={handleExportDocx}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-md transition-colors flex items-center shadow-2xs"
                >
                  <FileCode className="w-3.5 h-3.5 mr-1.5" />
                  Download DOCX
                </button>
              </div>
            </div>

            {/* Omnibus Text Box */}
            <pre className="text-xs font-mono text-slate-200 bg-slate-950 p-4 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed select-all max-h-96 overflow-y-auto">
              {generateOmnibusMotionText()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
