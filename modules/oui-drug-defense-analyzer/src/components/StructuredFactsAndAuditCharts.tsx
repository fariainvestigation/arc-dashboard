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
  ReferenceLine,
  Cell
} from 'recharts';
import {
  Scale,
  GitCommit,
  Layers,
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Info,
  ShieldAlert,
  Edit3,
  Check,
  X,
  FileCheck2,
  ArrowRight,
  FlaskConical
} from 'lucide-react';
import { CaseData, StructuredFactExtraction, StructuredIssueCard, DiscoveryCompletenessItem } from '../types';
import { SubstanceInventoryAudit } from './SubstanceInventoryAudit';

interface StructuredFactsAndAuditChartsProps {
  currentCase: CaseData;
  onUpdateCase?: (updated: CaseData) => void;
}

export const StructuredFactsAndAuditCharts: React.FC<StructuredFactsAndAuditChartsProps> = ({ currentCase, onUpdateCase }) => {
  const [activeEngineTab, setActiveEngineTab] = useState<
    'structured_facts' | 'substance_inventory' | 'weight_chart' | 'chain_timeline' | 'unit_testing' | 'discovery_completeness' | 'issue_cards'
  >('substance_inventory');

  const labData = currentCase.labResultData;
  const drugItem = labData?.drugSeizureItems?.[0];

  // 1. Structured Fact Extraction Data
  const factExtraction: StructuredFactExtraction = {
    policeDescribedSubstance: 'Suspected Heroin / Tan Powder',
    fieldTestResult: 'Not Listed (No Marquis Field Kit Administered)',
    complaintAllegation: 'Possession with Intent to Distribute Class A (Heroin)',
    labConfirmedSubstance: 'Heroin and Fentanyl Mixture',
    policeWeight: '28.5 g (Gross Field Estimate)',
    labIntakeWeight: 'Not Listed (Intake Form Gross Weight Blank)',
    certificateWeight: '28.12 g',
    weightClassification: 'Unclear (Certificate does not expressly state Net Weight)',
    netWeight: drugItem?.reportedNetWeightGrams ? `${drugItem.reportedNetWeightGrams} g` : '28.12 g',
    expandedUncertainty: drugItem?.weightUncertaintyGrams ? `±${drugItem.weightUncertaintyGrams} g` : '±0.18 g (In Bench Worksheet, Omitted from Cert)',
    lowerBoundAnalysisText:
      drugItem?.reportedNetWeightGrams && drugItem?.weightUncertaintyGrams
        ? `${drugItem.reportedNetWeightGrams} g − ${drugItem.weightUncertaintyGrams} g = ${(
            drugItem.reportedNetWeightGrams - drugItem.weightUncertaintyGrams
          ).toFixed(3)} g (Lower Bound spans 28.00 g statutory threshold)`
        : 'The record does not permit reliable lower-bound threshold analysis.'
  };

  // 2. Weight Comparison Chart Data
  const weightChartData = [
    { source: 'Police Estimate', weightGrams: 28.5, type: 'Gross Field', color: '#64748b' },
    { source: 'Complaint Allegation', weightGrams: 28.5, type: 'Alleged', color: '#94a3b8' },
    { source: 'Lab Intake', weightGrams: 0, type: 'Not Listed', color: '#cbd5e1' },
    { source: 'Bench Notes Net', weightGrams: 28.12, type: 'Net Weight', color: '#4f46e5' },
    { source: 'Certificate Report', weightGrams: 28.12, type: 'Summary', color: '#2563eb' },
    { source: 'Calculated Lower Bound', weightGrams: 27.94, type: 'Lower Bound', color: '#dc2626' }
  ];

  // 3. Chain Timeline Events
  const chainTimelineEvents = [
    { stage: 'Seizure', time: '2026-03-14 01:20', handler: 'Off. J. Higgins', detail: 'Seized 76 glassine bags (Item 4)', hasGap: false },
    { stage: 'Evidence Locker', time: '2026-03-14 03:45', handler: 'Det. M. Sullivan', detail: 'Placed in WPD Locker #4', hasGap: false },
    { stage: 'Transfers / Courier', time: '2026-03-14 to 03-17', handler: 'Unlisted Handler', detail: '3-Day Courier Transit Gap', hasGap: true, gapNote: 'MISSING LOG: Custody unrecorded for 72 hours' },
    { stage: 'Laboratory Receipt', time: '2026-03-17 11:15', handler: 'Intake Clerk A. Vance', detail: 'Delivered to MSPCL Sudbury', hasGap: false },
    { stage: 'Analyst Custody', time: '2026-03-17 13:00', handler: 'Dr. Rebecca Vance', detail: 'Entered LIMS System', hasGap: false },
    { stage: 'Testing', time: '2026-03-20 09:15', handler: 'Dr. Rebecca Vance', detail: 'Weighed & FTIR Analysis', hasGap: false },
    { stage: 'Review', time: '2026-03-21 14:00', handler: 'Peer Reviewer (Unsigned)', detail: 'Secondary Technical Review', hasGap: true, gapNote: 'MISSING SIGNATURE: Technical review line blank' },
    { stage: 'Certificate Issuance', time: '2026-03-22 16:00', handler: 'Dr. Rebecca Vance', detail: 'Certificate MA-9912 Released', hasGap: false }
  ];

  // 4. Unit Testing Data
  const unitTestingData = {
    totalUnits: drugItem?.totalItemCount || 76,
    visuallyInspected: 76,
    weighedUnits: 8,
    sampledUnits: 8,
    chemicallyTested: 8,
    untestedUnits: 68,
    unitsInReportedWeight: 76,
    unitsInSamplingInference: 68,
    samplingMethod: drugItem?.samplingPlanUsed || 'Hypergeometric (k=0.7)',
    homogeneityStatus: drugItem?.homogeneityVerified ? 'VERIFIED' : 'FAILED - Marquis Color Divergence'
  };

  // 5. Discovery Completeness Data
  const discoveryItems: DiscoveryCompletenessItem[] = [
    { category: 'Certificate', status: 'Produced', notes: 'Certificate MA-STATE-LAB-2026-9912 produced in primary discovery.' },
    { category: 'Chain', status: 'Partial', notes: 'Police chain form produced; 3-day courier transit custody log missing.' },
    { category: 'Bench notes', status: 'Produced', notes: 'Handwritten bench notes produced; Marquis color test variations noted.' },
    { category: 'Sampling', status: 'Partial', notes: 'Hypergeometric notice attached; individual unit weight worksheets missing.' },
    { category: 'Raw instrument data', status: 'Missing', notes: 'FTIR raw spectral file and GC-MS run files not produced in initial packet.' },
    { category: 'Controls', status: 'Missing', notes: 'Negative control blanks, reference standard spectra, and batch QC logs missing.' },
    { category: 'Weight and uncertainty', status: 'Partial', notes: 'Net weight reported on worksheet; balance ID and calibration logs missing.' },
    { category: 'Review records', status: 'Unclear', notes: 'Secondary reviewer signature box blank on bench worksheet.' },
    { category: 'SOPs', status: 'Produced', notes: 'MSPCL Item Analysis Policy ID 4163 Rev 6 available in library.' }
  ];

  // 6. Reviewable Issue Cards State
  const [issueCards, setIssueCards] = useState<StructuredIssueCard[]>([
    {
      id: 'issue_weight_threshold',
      priority: 'HIGH',
      category: 'Weight / threshold',
      sourceFact: 'Certificate reports 28.12 g net weight with bench worksheet expanded uncertainty of ±0.18 g.',
      weightType: 'Reported Net Weight vs Lower Bound',
      expandedUncertainty: '±0.18 g (95% Confidence Level)',
      policyQuestion: 'Whether reported weight is a true net weight and whether expanded balance uncertainty spans the 28.00 g statutory trafficking threshold.',
      problem: 'Subtracting expanded uncertainty (28.12 g − 0.18 g = 27.94 g) yields a lower bound below the 28.00 g statutory threshold under M.G.L. c. 94C § 32E.',
      defenseSignificance: 'The Commonwealth cannot prove beyond a reasonable doubt that the true net weight exceeds 28.00 grams required for trafficking.',
      neededDiscovery: ['Balance calibration logs', 'Tare weight records', 'Uncertainty budget calculation sheet', 'Daily verification log'],
      motionUse: 'Motion to Dismiss Trafficking Count / Motion to Reduce Charge to Possession with Intent.',
      crossTarget: 'Analyzing Chemist (Dr. Rebecca Vance) or Laboratory Balance Manager.',
      confidence: 'High',
      confidenceNote: 'Expanded uncertainty mathematically drops lower bound below 28.00 g.',
      status: 'ACCEPT'
    },
    {
      id: 'issue_sampling_limitation',
      priority: 'HIGH',
      category: 'Sampling limitation',
      sourceFact: 'Chemist sampled 8 of 76 glassine bags using Hypergeometric plan (k=0.7).',
      weightType: 'Extrapolated Population Weight',
      expandedUncertainty: 'N/A',
      policyQuestion: 'Whether non-identical Marquis color test reactions void hypergeometric statistical inference under MSPCL SOP § 4.10.10.1.',
      problem: 'Bench notes indicate Items 4a/4f yielded Purple while 4b/4c yielded Purple with Orange. SOP strictly requires identical color reactions prior to hypergeometric sampling.',
      defenseSignificance: 'The hypergeometric sampling inference is scientifically invalid. The Commonwealth can only prove drug identity for the 8 tested bags.',
      neededDiscovery: ['Individual bag color test photos', 'Subsampling bench notes', 'Sampling plan calculation worksheet'],
      motionUse: 'Motion in Limite to Exclude Statistical Extrapolation to Untested 68 Bags.',
      crossTarget: 'Analyzing Chemist / Lead Quality Manager.',
      confidence: 'High',
      confidenceNote: 'SOP § 4.10.10.1 explicitly prohibits hypergeometric extrapolation for non-homogeneous samples.',
      status: 'ACCEPT'
    },
    {
      id: 'issue_substance_identity',
      priority: 'MEDIUM',
      category: 'Substance identity',
      sourceFact: 'Primary identification performed via FTIR spectroscopy without confirmatory GC-MS.',
      weightType: 'N/A',
      expandedUncertainty: 'N/A',
      policyQuestion: 'Whether FTIR alone is scientifically sufficient to identify complex street drug mixtures containing adulterants and optical isomers.',
      problem: 'FTIR spectra of street drug mixtures show overlapping absorption bands. FTIR cannot distinguish optical isomers (L-methamphetamine vs D-methamphetamine).',
      defenseSignificance: 'Failure to run confirmatory GC-MS leaves chemical identity open to reasonable doubt under SWGDRUG Category A standards.',
      neededDiscovery: ['Raw FTIR spectral files (.asp / .sp)', 'Library match fit coefficients', 'GC-MS rerun logs'],
      motionUse: 'Rule 14 Motion to Compel Confirmatory GC-MS Re-analysis.',
      crossTarget: 'Forensic Chemist.',
      confidence: 'Medium',
      confidenceNote: 'FTIR is SWGDRUG Category A but compromised in complex mixtures.',
      status: 'ACCEPT'
    },
    {
      id: 'issue_chain_custody_gap',
      priority: 'HIGH',
      category: 'Chain & item identity',
      sourceFact: '3-day unrecorded delay between Woburn PD release and MSPCL intake logging.',
      weightType: 'Gross Seizure Weight',
      expandedUncertainty: 'N/A',
      policyQuestion: 'Whether unrecorded custody for 72 hours breaks the chain of custody required for admission under Mass. R. Evid. 901.',
      problem: 'Intermediate transit log is missing. Courier handler signature is absent from submission form.',
      defenseSignificance: 'Establishes lack of continuous custody proof, creating reasonable doubt regarding evidence tampering or substitution.',
      neededDiscovery: ['Courier transit log', 'Intermediate evidence locker sign-in sheets', 'Courier vehicle delivery receipts'],
      motionUse: 'Motion to Suppress / Exclude Lab Certificate for Chain Failure.',
      crossTarget: 'Police Evidence Custodian & MSPCL Intake Clerk.',
      confidence: 'High',
      confidenceNote: 'Record demonstrates 72-hour unverified custody gap.',
      status: 'ACCEPT'
    }
  ]);

  const handleUpdateCardStatus = (cardId: string, newStatus: 'ACCEPT' | 'REJECT' | 'EDITED') => {
    setIssueCards((prev) =>
      prev.map((card) => (card.id === cardId ? { ...card, status: newStatus } : card))
    );
  };

  const handleUpdateCardNotes = (cardId: string, notes: string) => {
    setIssueCards((prev) =>
      prev.map((card) => (card.id === cardId ? { ...card, attorneyNotes: notes } : card))
    );
  };

  return (
    <div className="space-y-6">
      {/* Engine Selection Sub-Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveEngineTab('substance_inventory')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
            activeEngineTab === 'substance_inventory'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5 mr-1.5 text-blue-300" />
          Substance Inventory &amp; Identification Audit
        </button>

        <button
          onClick={() => setActiveEngineTab('structured_facts')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
            activeEngineTab === 'structured_facts'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 mr-1.5" />
          Structured Fact Extraction
        </button>

        <button
          onClick={() => setActiveEngineTab('weight_chart')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
            activeEngineTab === 'weight_chart'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Scale className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
          Weight & Threshold Chart
        </button>

        <button
          onClick={() => setActiveEngineTab('chain_timeline')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
            activeEngineTab === 'chain_timeline'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <GitCommit className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
          Chain Timeline
        </button>

        <button
          onClick={() => setActiveEngineTab('unit_testing')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
            activeEngineTab === 'unit_testing'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <FileSearch className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
          Unit-Testing & Sampling Chart
        </button>

        <button
          onClick={() => setActiveEngineTab('discovery_completeness')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
            activeEngineTab === 'discovery_completeness'
              ? 'bg-blue-700 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <FileCheck2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
          Discovery Completeness Matrix
        </button>

        <button
          onClick={() => setActiveEngineTab('issue_cards')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
            activeEngineTab === 'issue_cards'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'bg-amber-100 text-amber-900 border border-amber-300 font-extrabold'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
          Reviewable Issue Cards ({issueCards.filter((c) => c.status === 'ACCEPT').length})
        </button>
      </div>

      {/* SUBSTANCE INVENTORY AUDIT TAB */}
      {activeEngineTab === 'substance_inventory' && (
        <SubstanceInventoryAudit currentCase={currentCase} onUpdateCase={onUpdateCase} />
      )}

      {/* 1. STRUCTURED FACT EXTRACTION TAB */}
      {activeEngineTab === 'structured_facts' && (
        <div className="space-y-5">
          <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2 border border-slate-800">
            <h4 className="text-sm font-bold text-white flex items-center">
              <Layers className="w-4 h-4 mr-2 text-blue-400" />
              Non-Merged Structured Fact Extraction Engine
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Extracts and displays source facts in strictly separate fields. Prevents police estimates, complaint allegations, or gross field weights from being erroneously treated as laboratory-confirmed net weights.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase">
                  <th className="p-3.5 w-1/3">Fact Category</th>
                  <th className="p-3.5 w-1/3">Extracted Source Value</th>
                  <th className="p-3.5 w-1/3">Audit Classification & Defense Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">Police-described substance</td>
                  <td className="p-3.5 font-mono text-slate-800">{factExtraction.policeDescribedSubstance}</td>
                  <td className="p-3.5 text-slate-600">Police Narrative / Offender Statement (Unverified)</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">Field-test result</td>
                  <td className="p-3.5 font-mono text-amber-700 font-bold">{factExtraction.fieldTestResult}</td>
                  <td className="p-3.5 text-slate-600">No roadside color test conducted by officer</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">Complaint allegation</td>
                  <td className="p-3.5 font-mono text-slate-800">{factExtraction.complaintAllegation}</td>
                  <td className="p-3.5 text-slate-600">Criminal Complaint Formal Charge</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">Lab-confirmed substance</td>
                  <td className="p-3.5 font-mono text-purple-700 font-bold">{factExtraction.labConfirmedSubstance}</td>
                  <td className="p-3.5 text-slate-600">MSPCL Certificate Conclusion (FTIR)</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">Police weight</td>
                  <td className="p-3.5 font-mono text-slate-800">{factExtraction.policeWeight}</td>
                  <td className="p-3.5 text-slate-600">Gross field weight including packaging material</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">Lab intake weight</td>
                  <td className="p-3.5 font-mono text-amber-700 font-bold">{factExtraction.labIntakeWeight}</td>
                  <td className="p-3.5 text-slate-600">Intake form failed to record initial gross weight</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">Certificate weight</td>
                  <td className="p-3.5 font-mono text-blue-700 font-bold">{factExtraction.certificateWeight}</td>
                  <td className="p-3.5 text-slate-600">Reported on Certificate MA-9912</td>
                </tr>
                <tr className="hover:bg-slate-50 bg-amber-50/50">
                  <td className="p-3.5 font-bold text-amber-950">Weight classification</td>
                  <td className="p-3.5 font-mono text-amber-800 font-bold">{factExtraction.weightClassification}</td>
                  <td className="p-3.5 text-amber-900 font-semibold">Flagged: Certificate summary omits "Net Weight" descriptor</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">Expanded uncertainty</td>
                  <td className="p-3.5 font-mono text-blue-700 font-bold">{factExtraction.expandedUncertainty}</td>
                  <td className="p-3.5 text-slate-600">Found in Bench Worksheet (Omitted from Cert)</td>
                </tr>
                <tr className="hover:bg-slate-50 bg-red-50/60">
                  <td className="p-3.5 font-bold text-red-950">Lower-bound threshold calculation</td>
                  <td className="p-3.5 font-mono text-red-700 font-bold" colSpan={2}>
                    {factExtraction.lowerBoundAnalysisText}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. WEIGHT & THRESHOLD COMPARISON CHART TAB */}
      {activeEngineTab === 'weight_chart' && (
        <div className="space-y-5">
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center">
                  <Scale className="w-4 h-4 mr-2 text-blue-700" />
                  Recorded Weight vs. MA Statutory Trafficking Thresholds Chart
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Plots recorded weights across discovery sources against M.G.L. c. 94C § 32E statutory trafficking thresholds (18g, 36g, 100g, 200g).
                </p>
              </div>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weightChartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="source" tick={{ fontSize: 11, fill: '#334155' }} />
                  <YAxis unit="g" domain={[0, 40]} tick={{ fontSize: 11, fill: '#334155' }} />
                  <Tooltip
                    formatter={(value: any) => [`${value} grams`, 'Recorded Weight']}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <ReferenceLine y={18} stroke="#dc2626" strokeDasharray="4 4" label={{ value: '18g Class A Threshold', fill: '#dc2626', fontSize: 10, position: 'top' }} />
                  <ReferenceLine y={28} stroke="#2563eb" strokeDasharray="2 2" label={{ value: '28g Class A Trafficking Threshold', fill: '#2563eb', fontSize: 10, position: 'top' }} />
                  <Bar dataKey="weightGrams" radius={[6, 6, 0, 0]} barSize={40}>
                    {weightChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-950 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                <strong>Statutory Defense Key:</strong> Lower bound calculated as 28.12g − 0.18g = <strong>27.94g</strong>. Because lower bound spans the 28.00g trafficking threshold, defense can move to dismiss the trafficking indictment under M.G.L. c. 94C § 32E.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. CHAIN TIMELINE TAB WITH VISIBLE GAPS */}
      {activeEngineTab === 'chain_timeline' && (
        <div className="space-y-5">
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center">
                  <GitCommit className="w-4 h-4 mr-2 text-indigo-700" />
                  Horizontal Chain of Custody Timeline (Showing Visible Discovery Gaps)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Traces custody transfers from initial seizure to final certificate. Gaps indicate missing custody logs or unverified signatures.
                </p>
              </div>
            </div>

            <div className="py-6 overflow-x-auto">
              <div className="flex items-center min-w-[750px] space-x-2">
                {chainTimelineEvents.map((evt, idx) => (
                  <React.Fragment key={idx}>
                    <div
                      className={`p-3 rounded-lg border flex-1 space-y-1 ${
                        evt.hasGap
                          ? 'bg-red-50 border-red-300 ring-2 ring-red-400/30'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Step {idx + 1}</span>
                        {evt.hasGap && (
                          <span className="text-[9px] font-extrabold bg-red-200 text-red-900 px-1.5 py-0.2 rounded">
                            GAP
                          </span>
                        )}
                      </div>
                      <h5 className="font-bold text-xs text-slate-900">{evt.stage}</h5>
                      <span className="text-[10px] font-mono text-slate-600 block">{evt.time}</span>
                      <p className="text-[11px] text-slate-700">{evt.detail}</p>
                      <span className="text-[10px] text-indigo-700 font-bold block">{evt.handler}</span>
                      {evt.gapNote && (
                        <p className="text-[10px] font-bold text-red-700 bg-red-100 p-1 rounded mt-1">
                          {evt.gapNote}
                        </p>
                      )}
                    </div>

                    {idx < chainTimelineEvents.length - 1 && (
                      <ArrowRight
                        className={`w-4 h-4 shrink-0 ${
                          chainTimelineEvents[idx + 1].hasGap ? 'text-red-500 stroke-[3]' : 'text-slate-300'
                        }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. UNIT-TESTING & SAMPLING CHART TAB */}
      {activeEngineTab === 'unit_testing' && (
        <div className="space-y-5">
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center">
                  <FileSearch className="w-4 h-4 mr-2 text-purple-700" />
                  Multi-Unit Evidence Sampling Breakdown
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tracks units inspected, weighed, tested, vs untested units included in reported weight.
                </p>
              </div>
              <span className="text-xs font-bold font-mono bg-purple-100 text-purple-900 px-3 py-1 rounded-full border border-purple-200">
                Method: {unitTestingData.samplingMethod}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Seized Units</span>
                <span className="text-lg font-mono font-bold text-slate-900">{unitTestingData.totalUnits} bags</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Chemically Tested</span>
                <span className="text-lg font-mono font-bold text-emerald-700">{unitTestingData.chemicallyTested} bags</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Untested Bags</span>
                <span className="text-lg font-mono font-bold text-amber-700">{unitTestingData.untestedUnits} bags</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Homogeneity Status</span>
                <span className="text-xs font-bold text-red-700 block mt-1">{unitTestingData.homogeneityStatus}</span>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 space-y-1">
              <span className="font-bold flex items-center text-amber-900">
                <ShieldAlert className="w-4 h-4 mr-1 text-amber-600" />
                Critical Defense Rule: Untested Unit Inferences
              </span>
              <p>
                The Commonwealth cannot automatically infer that untested bags contain controlled substances when homogeneity fails. Under MSPCL SOP § 4.10.10.1, because Marquis color testing yielded divergent colors across bags, hypergeometric extrapolation is legally and scientifically void!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. DISCOVERY COMPLETENESS MATRIX TAB */}
      {activeEngineTab === 'discovery_completeness' && (
        <div className="space-y-5">
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center">
                  <FileCheck2 className="w-4 h-4 mr-2 text-emerald-700" />
                  Discovery Completeness & Case Record Audit Matrix
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tracks production status across MSPCL case record categories. Notice: Absence from certificate generates "Not shown on certificate - request complete case record".
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {discoveryItems.map((item, idx) => (
                <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{item.category}</span>
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                        item.status === 'Produced'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'Partial'
                          ? 'bg-amber-100 text-amber-800'
                          : item.status === 'Missing'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-200 text-slate-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{item.notes}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. REVIEWABLE ISSUE CARDS TAB */}
      {activeEngineTab === 'issue_cards' && (
        <div className="space-y-5">
          <div className="p-4 bg-amber-950 text-white rounded-xl space-y-2 border border-amber-800 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Reviewable Audit Issue Cards Workspace
                </h4>
              </div>
              <span className="text-xs font-mono font-bold bg-amber-900 text-amber-200 px-2.5 py-1 rounded border border-amber-700">
                {issueCards.filter((c) => c.status === 'ACCEPT').length} Accepted | {issueCards.filter((c) => c.status === 'REJECT').length} Rejected
              </span>
            </div>
            <p className="text-xs text-amber-200 leading-relaxed">
              Every detected error and policy violation is converted into a reviewable card. Attorneys can review, edit notes, accept, or reject issues for inclusion in final Rule 14 motions and cross-examination packages.
            </p>
          </div>

          <div className="space-y-4">
            {issueCards.map((card) => (
              <div
                key={card.id}
                className={`p-5 rounded-xl border transition-all space-y-4 ${
                  card.status === 'ACCEPT'
                    ? 'bg-white border-slate-300 shadow-2xs'
                    : card.status === 'REJECT'
                    ? 'bg-slate-100/80 border-slate-200 opacity-60'
                    : 'bg-amber-50/50 border-amber-300'
                }`}
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded ${
                        card.priority === 'HIGH'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      Priority: {card.priority}
                    </span>
                    <span className="text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded">
                      Category: {card.category}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleUpdateCardStatus(card.id, 'ACCEPT')}
                      className={`px-3 py-1 rounded text-xs font-bold transition-colors flex items-center ${
                        card.status === 'ACCEPT'
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-emerald-100'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Accept
                    </button>

                    <button
                      onClick={() => handleUpdateCardStatus(card.id, 'REJECT')}
                      className={`px-3 py-1 rounded text-xs font-bold transition-colors flex items-center ${
                        card.status === 'REJECT'
                          ? 'bg-red-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-red-100'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Reject
                    </button>
                  </div>
                </div>

                {/* Card Fields Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Source Fact</span>
                      <p className="font-semibold text-slate-900">{card.sourceFact}</p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Policy Question</span>
                      <p className="text-slate-800">{card.policyQuestion}</p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Problem Identified</span>
                      <p className="text-red-700 font-semibold">{card.problem}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Defense Significance</span>
                      <p className="text-slate-800">{card.defenseSignificance}</p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Motion Use & Cross Target</span>
                      <p className="text-indigo-900 font-bold">{card.motionUse} (Target: {card.crossTarget})</p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Needed Discovery Checklist</span>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-700 text-[11px]">
                        {card.neededDiscovery.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Attorney Notes Input */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Attorney Strategy Notes / Custom Modifications
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Add custom notes for court pleadings or cross-examination..."
                    value={card.attorneyNotes || ''}
                    onChange={(e) => handleUpdateCardNotes(card.id, e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
