import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import {
  GitCompare,
  ShieldAlert,
  AlertTriangle,
  Scale,
  Printer,
  FileJson,
  Code2,
  FileCode,
  CheckCircle2,
  Sliders,
  FileText,
  FlaskConical,
  Gavel
} from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { CaseData, ErrorCategory, ErrorSeverity, ProceduralError } from '../types';
import { runDeterministicRuleEngine } from '../lib/ruleEngine';
import { generateLabProceduralErrors } from '../lib/labRuleEngine';
import { SAMPLE_MASSACHUSETTS_CASES } from '../data/sampleCases';

interface CaseComparisonViewProps {
  availableCases?: CaseData[];
  initialCaseAId?: string;
  initialCaseBId?: string;
}

const ERROR_CATEGORIES: ErrorCategory[] = [
  'Observation Window',
  'Exit Order',
  'SFST Administration',
  'Cannabis Impairment',
  'Refusal Characterization',
  'Draeger Calibration',
  'Chain of Custody',
  'Statutory Rights',
  'Timeline Contradiction',
  'Lab Analysis',
  'Other'
];

const SEVERITY_LEVELS: ErrorSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const CaseComparisonView: React.FC<CaseComparisonViewProps> = ({
  availableCases = SAMPLE_MASSACHUSETTS_CASES,
  initialCaseAId = SAMPLE_MASSACHUSETTS_CASES[0]?.id || 'case_miller_woburn',
  initialCaseBId = SAMPLE_MASSACHUSETTS_CASES[1]?.id || 'case_santos_worcester'
}) => {
  const [caseAId, setCaseAId] = useState<string>(initialCaseAId);
  const [caseBId, setCaseBId] = useState<string>(
    initialCaseBId !== initialCaseAId ? initialCaseBId : availableCases[1]?.id || availableCases[0]?.id
  );

  // Get Case Objects
  const caseA = availableCases.find((c) => c.id === caseAId) || availableCases[0];
  const caseB = availableCases.find((c) => c.id === caseBId) || availableCases[1] || availableCases[0];

  // Derive Procedural Errors for Case A
  const getErrorsForCase = (c: CaseData): ProceduralError[] => {
    let errs: ProceduralError[] = [];
    if (c.analysisResult?.proceduralErrors && c.analysisResult.proceduralErrors.length > 0) {
      errs = [...c.analysisResult.proceduralErrors];
    } else {
      errs = runDeterministicRuleEngine(c.documents).errors;
    }
    // Include lab errors if present
    const labErrs = generateLabProceduralErrors(c.labResultData);
    // Deduplicate by title
    const existingTitles = new Set(errs.map((e) => e.title));
    labErrs.forEach((le) => {
      if (!existingTitles.has(le.title)) {
        errs.push(le);
      }
    });
    return errs;
  };

  const errorsA = getErrorsForCase(caseA);
  const errorsB = getErrorsForCase(caseB);

  // 1. Prepare Category Frequency Comparison Data for Recharts
  const categoryChartData = ERROR_CATEGORIES.map((cat) => {
    const countA = errorsA.filter((e) => e.category === cat).length;
    const countB = errorsB.filter((e) => e.category === cat).length;
    return {
      category: cat,
      shortCategory: cat.length > 12 ? cat.slice(0, 10) + '…' : cat,
      [caseA.clientName]: countA,
      [caseB.clientName]: countB,
      delta: countA - countB
    };
  });

  // Filter out categories with zero errors in both cases for cleaner bar chart view
  const activeCategoryChartData = categoryChartData.filter(
    (d) => (d[caseA.clientName] as number) > 0 || (d[caseB.clientName] as number) > 0
  );

  // 2. Prepare Severity Level Frequency Comparison Data
  const severityChartData = SEVERITY_LEVELS.map((sev) => {
    const countA = errorsA.filter((e) => e.severity === sev).length;
    const countB = errorsB.filter((e) => e.severity === sev).length;
    return {
      severity: sev,
      [caseA.clientName]: countA,
      [caseB.clientName]: countB
    };
  });

  // 3. Prepare Defense Pillar Defect Radar Scores
  const pillars = [
    {
      pillar: 'Observation & Timeline',
      scoreA: errorsA.some((e) => e.category === 'Observation Window' || e.category === 'Timeline Contradiction') ? 90 : 25,
      scoreB: errorsB.some((e) => e.category === 'Observation Window' || e.category === 'Timeline Contradiction') ? 90 : 25
    },
    {
      pillar: 'Exit Order Basis',
      scoreA: errorsA.some((e) => e.category === 'Exit Order') ? 85 : 20,
      scoreB: errorsB.some((e) => e.category === 'Exit Order') ? 85 : 20
    },
    {
      pillar: 'SFST Compliance',
      scoreA: errorsA.some((e) => e.category === 'SFST Administration' || e.category === 'Cannabis Impairment') ? 95 : 30,
      scoreB: errorsB.some((e) => e.category === 'SFST Administration' || e.category === 'Cannabis Impairment') ? 95 : 30
    },
    {
      pillar: 'Chemical Integrity',
      scoreA: errorsA.some((e) => e.category === 'Draeger Calibration' || e.category === 'Lab Analysis') ? 85 : 35,
      scoreB: errorsB.some((e) => e.category === 'Draeger Calibration' || e.category === 'Lab Analysis') ? 85 : 35
    },
    {
      pillar: 'Statutory Rights',
      scoreA: errorsA.some((e) => e.category === 'Statutory Rights' || e.category === 'Refusal Characterization') ? 88 : 40,
      scoreB: errorsB.some((e) => e.category === 'Statutory Rights' || e.category === 'Refusal Characterization') ? 88 : 40
    }
  ];

  const pillarRadarData = pillars.map((p) => ({
    pillar: p.pillar,
    [caseA.clientName]: p.scoreA,
    [caseB.clientName]: p.scoreB
  }));

  // 4. Motion Issue Support Scores Comparison Data
  const getMotionScores = (c: CaseData) => {
    if (c.analysisResult?.motionWinScores) return c.analysisResult.motionWinScores;
    return runDeterministicRuleEngine(c.documents).motionScores;
  };

  const motionA = getMotionScores(caseA);
  const motionB = getMotionScores(caseB);

  // Unified list of motion types
  const allMotionTypes = Array.from(
    new Set([...motionA.map((m) => m.motionType), ...motionB.map((m) => m.motionType)])
  );

  const motionComparisonData = allMotionTypes.map((mType) => {
    const scoreA = motionA.find((m) => m.motionType === mType)?.score || 0;
    const scoreB = motionB.find((m) => m.motionType === mType)?.score || 0;
    return {
      motionType: mType,
      shortMotion: mType.length > 18 ? mType.slice(0, 16) + '…' : mType,
      [caseA.clientName]: scoreA,
      [caseB.clientName]: scoreB
    };
  });

  // Export handlers
  const handleExportJson = () => {
    const payload = {
      comparisonDate: new Date().toISOString(),
      caseA: {
        id: caseA.id,
        clientName: caseA.clientName,
        caseNumber: caseA.caseNumber,
        court: caseA.court,
        totalErrors: errorsA.length,
        proceduralErrors: errorsA
      },
      caseB: {
        id: caseB.id,
        clientName: caseB.clientName,
        caseNumber: caseB.caseNumber,
        court: caseB.court,
        totalErrors: errorsB.length,
        proceduralErrors: errorsB
      },
      categoryComparison: activeCategoryChartData
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `case_procedural_error_comparison_${caseA.id}_vs_${caseB.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Side-by-Side Case Procedural Error Comparison</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #0f172a; background: #fff; line-height: 1.5; }
    h1 { font-size: 22px; color: #1e293b; border-bottom: 3px solid #1d4ed8; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
    .case-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; background: #f8fafc; }
    .case-header { font-size: 16px; font-weight: bold; color: #1d4ed8; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-right: 6px; }
    .critical { background: #dc2626; color: #fff; }
    .high { background: #d97706; color: #fff; }
    .medium { background: #2563eb; color: #fff; }
    .low { background: #64748b; color: #fff; }
    .error-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 10px; font-size: 12px; }
    .quote { font-family: monospace; background: #f1f5f9; padding: 6px 8px; border-left: 3px solid #2563eb; margin: 6px 0; }
  </style>
</head>
<body>
  <h1>Side-by-Side Procedural Error Frequency & Defect Analytics</h1>
  <p>Comparing <strong>${caseA.clientName} (${caseA.caseNumber})</strong> vs <strong>${caseB.clientName} (${caseB.caseNumber})</strong></p>
  
  <div class="grid">
    <div class="case-card">
      <div class="case-header">Case A: ${caseA.clientName}</div>
      <p><strong>Case #:</strong> ${caseA.caseNumber} | <strong>Court:</strong> ${caseA.court}</p>
      <p><strong>Total Procedural Errors Identified:</strong> ${errorsA.length}</p>
      <hr/>
      <h3>Detected Errors (${errorsA.length})</h3>
      ${errorsA
        .map(
          (e) => `
        <div class="error-item">
          <div><span class="badge ${e.severity.toLowerCase()}">${e.severity}</span> <strong>${e.category}</strong></div>
          <div style="font-weight: bold; margin-top: 4px;">${e.title}</div>
          <div>${e.description}</div>
          <div class="quote">"${e.verbatimQuote}"</div>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="case-card">
      <div class="case-header">Case B: ${caseB.clientName}</div>
      <p><strong>Case #:</strong> ${caseB.caseNumber} | <strong>Court:</strong> ${caseB.court}</p>
      <p><strong>Total Procedural Errors Identified:</strong> ${errorsB.length}</p>
      <hr/>
      <h3>Detected Errors (${errorsB.length})</h3>
      ${errorsB
        .map(
          (e) => `
        <div class="error-item">
          <div><span class="badge ${e.severity.toLowerCase()}">${e.severity}</span> <strong>${e.category}</strong></div>
          <div style="font-weight: bold; margin-top: 4px;">${e.title}</div>
          <div>${e.description}</div>
          <div class="quote">"${e.verbatimQuote}"</div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `case_comparison_${caseA.id}_vs_${caseB.id}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          children: [
            new Paragraph({
              text: 'SIDE-BY-SIDE PROCEDURAL ERROR COMPARISON REPORT',
              heading: HeadingLevel.HEADING_1
            }),
            new Paragraph({ text: `Date: ${new Date().toLocaleDateString()}` }),
            new Paragraph({ text: `Case A: ${caseA.clientName} (${caseA.caseNumber}) - Total Errors: ${errorsA.length}` }),
            new Paragraph({ text: `Case B: ${caseB.clientName} (${caseB.caseNumber}) - Total Errors: ${errorsB.length}` }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'CASE A PROCEDURAL DEFECTS', heading: HeadingLevel.HEADING_2 }),
            ...errorsA.flatMap((e) => [
              new Paragraph({ text: `[${e.severity}] ${e.title}`, heading: HeadingLevel.HEADING_3 }),
              new Paragraph({ text: `Category: ${e.category} | Citation: ${e.standardViolated}` }),
              new Paragraph({ text: `Description: ${e.description}` }),
              new Paragraph({ text: `Quote: "${e.verbatimQuote}"` }),
              new Paragraph({ text: '' })
            ]),
            new Paragraph({ text: 'CASE B PROCEDURAL DEFECTS', heading: HeadingLevel.HEADING_2 }),
            ...errorsB.flatMap((e) => [
              new Paragraph({ text: `[${e.severity}] ${e.title}`, heading: HeadingLevel.HEADING_3 }),
              new Paragraph({ text: `Category: ${e.category} | Citation: ${e.standardViolated}` }),
              new Paragraph({ text: `Description: ${e.description}` }),
              new Paragraph({ text: `Quote: "${e.verbatimQuote}"` }),
              new Paragraph({ text: '' })
            ])
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `procedural_error_comparison_${caseA.id}_vs_${caseB.id}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      {/* Top Header & Export Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <GitCompare className="w-5 h-5 text-blue-700" />
            <h3 className="text-lg font-bold text-slate-900">
              Side-by-Side Case Comparison Analytics
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Compare procedural error frequency, defect severity distributions, and motion issue support score side-by-side across two cases.
          </p>
        </div>

        {/* Export & Action Buttons */}
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
            DOCX Report
          </button>
        </div>
      </div>

      {/* Case Selection Dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Case A Selector Card */}
        <div className="p-4 bg-blue-50/50 border-2 border-blue-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-700 mr-2"></span>
              Select Primary Case (Case A)
            </label>
            <span className="text-xs font-mono font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
              {errorsA.length} Defects Found
            </span>
          </div>

          <select
            value={caseAId}
            onChange={(e) => setCaseAId(e.target.value)}
            className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-600 mb-3"
          >
            {availableCases.map((c) => (
              <option key={`caseA_${c.id}`} value={c.id}>
                {c.clientName} - {c.caseNumber} ({c.court})
              </option>
            ))}
          </select>

          <div className="text-xs text-slate-600 space-y-1 bg-white p-3 rounded-lg border border-blue-100">
            <div><strong className="text-slate-800">Client:</strong> {caseA.clientName}</div>
            <div><strong className="text-slate-800">Charge:</strong> {caseA.charge}</div>
            <div><strong className="text-slate-800">Agency:</strong> {caseA.arrestingAgency}</div>
            <div><strong className="text-slate-800">Court:</strong> {caseA.court}</div>
          </div>
        </div>

        {/* Case B Selector Card */}
        <div className="p-4 bg-amber-50/50 border-2 border-amber-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600 mr-2"></span>
              Select Comparison Case (Case B)
            </label>
            <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
              {errorsB.length} Defects Found
            </span>
          </div>

          <select
            value={caseBId}
            onChange={(e) => setCaseBId(e.target.value)}
            className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-600 mb-3"
          >
            {availableCases.map((c) => (
              <option key={`caseB_${c.id}`} value={c.id}>
                {c.clientName} - {c.caseNumber} ({c.court})
              </option>
            ))}
          </select>

          <div className="text-xs text-slate-600 space-y-1 bg-white p-3 rounded-lg border border-amber-100">
            <div><strong className="text-slate-800">Client:</strong> {caseB.clientName}</div>
            <div><strong className="text-slate-800">Charge:</strong> {caseB.charge}</div>
            <div><strong className="text-slate-800">Agency:</strong> {caseB.arrestingAgency}</div>
            <div><strong className="text-slate-800">Court:</strong> {caseB.court}</div>
          </div>
        </div>
      </div>

      {/* Recharts Side-by-Side Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 1. Procedural Error Frequency by Category (Grouped Bar Chart) */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
              <ShieldAlert className="w-4 h-4 mr-1.5 text-blue-700" />
              Error Frequency by Category (Side-by-Side)
            </h4>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeCategoryChartData.length > 0 ? activeCategoryChartData : categoryChartData.slice(0, 6)}
                margin={{ top: 10, right: 20, left: -10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="shortCategory" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey={caseA.clientName} fill="#1d4ed8" radius={[4, 4, 0, 0]} name={`${caseA.clientName} (Case A)`} />
                <Bar dataKey={caseB.clientName} fill="#d97706" radius={[4, 4, 0, 0]} name={`${caseB.clientName} (Case B)`} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Defect Severity Level Frequency (Grouped Bar Chart) */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
              <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600" />
              Defect Severity Distribution
            </h4>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityChartData} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="severity" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey={caseA.clientName} fill="#2563eb" radius={[4, 4, 0, 0]} name={`${caseA.clientName} (Case A)`} />
                <Bar dataKey={caseB.clientName} fill="#f59e0b" radius={[4, 4, 0, 0]} name={`${caseB.clientName} (Case B)`} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Defense Pillar Defect Radar Overlaid Comparison */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
              <Scale className="w-4 h-4 mr-1.5 text-blue-700" />
              Defense Pillar Vulnerability Radar Overlay
            </h4>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={pillarRadarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="pillar" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', color: '#fff', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Radar
                  name={`${caseA.clientName} (Case A)`}
                  dataKey={caseA.clientName}
                  stroke="#1d4ed8"
                  fill="#3b82f6"
                  fillOpacity={0.4}
                />
                <Radar
                  name={`${caseB.clientName} (Case B)`}
                  dataKey={caseB.clientName}
                  stroke="#d97706"
                  fill="#f59e0b"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Motion Issue Support Score Comparison Bar Chart */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
              <Gavel className="w-4 h-4 mr-1.5 text-blue-700" />
              Motion Issue Support Score (%) Comparison
            </h4>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={motionComparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis dataKey="shortMotion" type="category" width={110} tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey={caseA.clientName} fill="#1d4ed8" radius={[0, 4, 4, 0]} name={`${caseA.clientName} (Case A)`} />
                <Bar dataKey={caseB.clientName} fill="#d97706" radius={[0, 4, 4, 0]} name={`${caseB.clientName} (Case B)`} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Side-by-Side Detailed Defect Breakdown Cards */}
      <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center justify-between">
          <span>Side-by-Side Specific Procedural Errors & Quotes</span>
          <span className="text-xs text-slate-500 font-normal normal-case">
            Showing {errorsA.length} defects in Case A vs {errorsB.length} defects in Case B
          </span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Case A Defects */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-blue-900 bg-blue-100 p-2 rounded-md flex justify-between items-center">
              <span>CASE A: {caseA.clientName} ({caseA.caseNumber})</span>
              <span>{errorsA.length} Errors</span>
            </div>

            {errorsA.length === 0 ? (
              <div className="p-4 bg-white rounded-lg border border-slate-200 text-xs text-slate-500 italic text-center">
                No procedural errors logged for this case.
              </div>
            ) : (
              errorsA.map((err) => (
                <div key={`errA_${err.id}`} className="bg-white border border-blue-200 rounded-lg p-3 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-700 text-white">
                      {err.severity} &bull; {err.category}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      p. {err.pageParagraphRef.pageNumber}, ¶ {err.pageParagraphRef.paragraphNumber}
                    </span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-900 mt-1">{err.title}</h5>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">{err.description}</p>
                  <div className="mt-2 text-[10px] font-mono bg-slate-50 border-l-2 border-blue-600 p-1.5 text-slate-800 rounded-r">
                    "{err.verbatimQuote}"
                  </div>
                  <div className="mt-2 text-[10px] font-semibold text-blue-900 bg-blue-50/80 p-1.5 rounded">
                    <strong>Authority:</strong> {err.standardViolated}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Case B Defects */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-amber-900 bg-amber-100 p-2 rounded-md flex justify-between items-center">
              <span>CASE B: {caseB.clientName} ({caseB.caseNumber})</span>
              <span>{errorsB.length} Errors</span>
            </div>

            {errorsB.length === 0 ? (
              <div className="p-4 bg-white rounded-lg border border-slate-200 text-xs text-slate-500 italic text-center">
                No procedural errors logged for this case.
              </div>
            ) : (
              errorsB.map((err) => (
                <div key={`errB_${err.id}`} className="bg-white border border-amber-200 rounded-lg p-3 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-600 text-white">
                      {err.severity} &bull; {err.category}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      p. {err.pageParagraphRef.pageNumber}, ¶ {err.pageParagraphRef.paragraphNumber}
                    </span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-900 mt-1">{err.title}</h5>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">{err.description}</p>
                  <div className="mt-2 text-[10px] font-mono bg-slate-50 border-l-2 border-amber-500 p-1.5 text-slate-800 rounded-r">
                    "{err.verbatimQuote}"
                  </div>
                  <div className="mt-2 text-[10px] font-semibold text-amber-900 bg-amber-50/80 p-1.5 rounded">
                    <strong>Authority:</strong> {err.standardViolated}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
