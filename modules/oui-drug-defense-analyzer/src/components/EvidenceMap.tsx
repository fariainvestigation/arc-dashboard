import React, { useState } from 'react';
import {
  GitCommit,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Package,
  Tag,
  FileCheck,
  FlaskConical,
  Activity,
  Award,
  ArrowRight,
  ShieldAlert,
  Info,
  Scale,
  Search,
  Filter
} from 'lucide-react';
import { CaseData, ItemReconciliationNode, ItemReconciliationFlag } from '../types';

interface EvidenceMapProps {
  currentCase: CaseData;
  onUpdateCase?: (updated: CaseData) => void;
}

export const EvidenceMap: React.FC<EvidenceMapProps> = ({ currentCase }) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'HIGH_RISK' | 'DISCREPANCIES'>('ALL');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const drugItems = currentCase.labResultData?.drugSeizureItems || [];

  // Construct default reconciliation chains for the case
  const defaultNodes: ItemReconciliationNode[] = [
    {
      stage: 'seizure',
      label: '1. On-Scene Drug Seizure',
      itemNumber: 'Item #4',
      description: '76 glassine bags containing tan powder',
      packaging: 'Clear plastic evidence bag #WPD-9912',
      weightText: '28.5 grams (Gross field estimate)',
      handler: 'Off. J. Higgins #441',
      date: currentCase.incidentDate || '2026-03-14 01:20',
      sealStatus: 'Intact',
      sourceDocRef: 'Woburn_PD_Incident_Report_Miller.pdf (Page 1)'
    },
    {
      stage: 'police_packaging',
      label: '2. Police Station Packaging & Locker',
      itemNumber: 'Item #4a-4y',
      description: '76 tan glassine bundles in heat-sealed outer bag',
      packaging: 'WPD Locker Bag #4',
      weightText: '28.5 grams (Police Gross Weight)',
      handler: 'Det. M. Sullivan (Evidence Custodian)',
      date: '2026-03-14 03:45',
      sealStatus: 'Intact',
      sourceDocRef: 'WPD_Chain_Custody_Form_2026.pdf (Page 1)'
    },
    {
      stage: 'evidence_tag',
      label: '3. Evidence Tag Assignment',
      itemNumber: 'WPD-EV-2026-0418',
      description: '76 glassine envelopes',
      packaging: 'Red tamper-evident tape sealed envelope',
      weightText: '28.5 grams (Tag Gross)',
      handler: 'Det. M. Sullivan',
      date: '2026-03-14 08:30',
      sealStatus: 'Intact',
      sourceDocRef: 'Evidence_Property_Tag_418.pdf'
    },
    {
      stage: 'submission',
      label: '4. MSPCL Intake Submission',
      itemNumber: 'Sub-Item 004',
      description: '76 glassine bags tan powder',
      packaging: 'Heat-sealed plastic container',
      weightText: 'Weight Not Recorded on Intake Form',
      handler: 'Courier / Sgt. P. Walsh',
      date: '2026-03-17 11:15',
      sealStatus: 'Unspecified',
      sourceDocRef: 'MSPCL_Evidence_Submission_Form_4163.pdf'
    },
    {
      stage: 'lims_item',
      label: '5. LIMS System Item Entry',
      itemNumber: 'LIMS-2026-MA-009912-04',
      description: '76 glassine bags containing powder',
      packaging: 'Outer plastic envelope open for analysis',
      weightText: 'Lab Intake Weight: Not Listed',
      handler: 'LIMS Intake Clerk A. Vance',
      date: '2026-03-17 13:00',
      sealStatus: 'Broken',
      sourceDocRef: 'MSPCL_LIMS_Audit_Log_9912.pdf'
    },
    {
      stage: 'analyst_worksheet',
      label: '6. Bench Worksheet Analysis',
      itemNumber: 'Item 4 (Subsampled 4a-4h)',
      description: '8 of 76 glassine bags opened for testing',
      packaging: 'Individual plastic weigh boats',
      weightText: 'Reported Net Weight: 28.12 g ± 0.18 g',
      handler: 'Dr. Rebecca Vance, Ph.D.',
      date: '2026-03-20 09:15',
      sealStatus: 'Broken',
      sourceDocRef: 'Drug_Chemistry_Worksheet_Item4.pdf'
    },
    {
      stage: 'instrument_run',
      label: '7. Instrumental Analysis (FTIR / GC-MS)',
      itemNumber: 'Run ID: FTIR-20260320-09',
      description: 'Extract from 8 sampled bags (FTIR spectrum recorded)',
      packaging: 'ATR Sample Plate',
      weightText: 'Sample aliquot ~1.5 mg',
      handler: 'J. Reynolds, Chemist III',
      date: '2026-03-20 14:30',
      sealStatus: 'Unspecified',
      sourceDocRef: 'FTIR_Spectra_Data_Run09.pdf'
    },
    {
      stage: 'certificate',
      label: '8. Certificate of Analysis',
      itemNumber: 'Cert Item 1',
      description: 'Heroin and Fentanyl mixture',
      packaging: 'Repackaged heat-sealed evidence envelope',
      weightText: 'Net Weight: 28.12 grams (Uncertainty ±0.18g omitted from summary)',
      handler: 'Dr. Rebecca Vance, Ph.D.',
      date: '2026-03-22 16:00',
      sealStatus: 'Intact',
      sourceDocRef: 'MSPCL_Drug_Certificate_MA-9912.pdf'
    }
  ];

  const defaultFlags: ItemReconciliationFlag[] = [
    {
      id: 'flag_weight_change',
      flagType: 'UNEXPLAINED_WEIGHT_CHANGE',
      title: 'Gross Seizure Weight vs. Lab Net Weight Discrepancy',
      description: 'Police report recorded 28.5g gross weight. Certificate reports 28.12g net weight. No lab intake gross/tare weight was recorded upon receipt at MSPCL to confirm bag material subtraction.',
      severity: 'HIGH',
      nodesInvolved: ['seizure', 'submission', 'analyst_worksheet', 'certificate']
    },
    {
      id: 'flag_seal_intake',
      flagType: 'SEAL_DISCREPANCY',
      title: 'Unspecified Seal Status at MSPCL Intake',
      description: 'MSPCL Intake Form does not state whether Evidence Seal #WPD-9912 was intact upon courier delivery on March 17, 2026.',
      severity: 'HIGH',
      nodesInvolved: ['evidence_tag', 'submission', 'lims_item']
    },
    {
      id: 'flag_subsample_inference',
      flagType: 'MULTIPLE_ITEMS_COMBINED',
      title: 'Subsampling Inconsistency Across 76 Bags',
      description: '8 of 76 glassine bags were tested using Hypergeometric sampling ($k=0.7$). However, bench notes record non-identical color test results (Marquis test gave purple for 4a/4f and purple-orange for 4b/4c), voiding the hypergeometric inference under MSPCL SOP § 4.10.10.1.',
      severity: 'HIGH',
      nodesInvolved: ['analyst_worksheet', 'instrument_run', 'certificate']
    },
    {
      id: 'flag_missing_gcms',
      flagType: 'UNCONNECTED_TESTED_ITEM',
      title: 'Confirmatory GC-MS Missing for Street Drug Mixture',
      description: 'Bench worksheet notes FTIR was performed, but confirmatory GC-MS was not run on the complex street drug mixture (heroin + fentanyl adulterants). FTIR alone cannot distinguish optical isomers or low-concentration fentanyl.',
      severity: 'MEDIUM',
      nodesInvolved: ['instrument_run', 'certificate']
    },
    {
      id: 'flag_handler_gap',
      flagType: 'MISSING_HANDLER',
      title: '3-Day Courier Chain Custody Log Gap',
      description: 'Evidence was released from Woburn PD on March 14, 2026, but not entered into MSPCL LIMS until March 17, 2026. Intermediate storage facility and overnight handler logs are missing from discovery.',
      severity: 'HIGH',
      nodesInvolved: ['police_packaging', 'submission', 'lims_item']
    }
  ];

  const filteredFlags = defaultFlags.filter((flag) => {
    if (activeFilter === 'HIGH_RISK') return flag.severity === 'HIGH';
    if (activeFilter === 'DISCREPANCIES') return flag.flagType !== 'UNCONNECTED_TESTED_ITEM';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl border border-slate-800 shadow-sm space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <GitCommit className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white tracking-wide">
                Evidence-Item Reconciliation Map (Seizure to Certificate Chain)
              </h3>
            </div>
            <p className="text-xs text-indigo-200 mt-1 max-w-3xl leading-relaxed">
              Traces item identity, packaging integrity, handler logs, and weight modifications step-by-step from initial police seizure through LIMS intake, analyst bench worksheets, instrument runs, and final court certificates.
            </p>
          </div>
          <div className="flex items-center space-x-2 bg-indigo-900/60 p-2 rounded-lg border border-indigo-700/50">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono font-bold text-amber-300">
              {defaultFlags.length} Discrepancy Flags Detected
            </span>
          </div>
        </div>
      </div>

      {/* Item Reconciliation Chain Horizontal Flow */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2">
            <Package className="w-5 h-5 text-indigo-700" />
            <h4 className="font-bold text-sm text-slate-900">
              Complete Evidence Item Progression Lineage
            </h4>
          </div>
          <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
            8 Sequential Audit Nodes
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {defaultNodes.map((node, idx) => {
            const isSelected = selectedNodeId === node.stage;
            const nodeFlags = defaultFlags.filter((f) => f.nodesInvolved.includes(node.stage));
            const hasHighSeverityFlag = nodeFlags.some((f) => f.severity === 'HIGH');

            return (
              <div
                key={node.stage}
                onClick={() => setSelectedNodeId(node.stage)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 relative ${
                  isSelected
                    ? 'bg-indigo-50/90 border-indigo-600 shadow-xs ring-2 ring-indigo-500/20'
                    : hasHighSeverityFlag
                    ? 'bg-red-50/50 border-red-300 hover:border-red-400'
                    : 'bg-slate-50 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Stage {idx + 1}
                  </span>
                  {hasHighSeverityFlag ? (
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[9px] font-bold rounded border border-red-200 flex items-center">
                      <AlertTriangle className="w-3 h-3 mr-1 text-red-600" /> Flagged
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded border border-emerald-200 flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" /> Logged
                    </span>
                  )}
                </div>

                <div>
                  <h5 className="font-bold text-xs text-slate-900 leading-snug">{node.label}</h5>
                  <span className="text-[11px] font-mono font-bold text-indigo-700 block mt-0.5">
                    {node.itemNumber}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-600 pt-1 border-t border-slate-200/80">
                  <p className="line-clamp-2"><strong>Desc:</strong> {node.description}</p>
                  <p><strong>Weight:</strong> <span className="font-mono font-bold text-slate-800">{node.weightText}</span></p>
                  <p><strong>Handler:</strong> {node.handler}</p>
                  <p className="text-[10px] text-slate-500 font-mono"><strong>Date:</strong> {node.date}</p>
                </div>

                {node.sourceDocRef && (
                  <div className="pt-1 text-[10px] text-slate-500 flex items-center italic truncate">
                    <FileCheck className="w-3 h-3 mr-1 text-indigo-600 shrink-0" />
                    {node.sourceDocRef}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Structured Discrepancy & Item Map Audit Flags */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-red-700" />
            <h4 className="font-bold text-sm text-slate-900">
              Automated Item Reconciliation & Chain Discrepancy Audit Flags
            </h4>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-bold text-[11px]">Filter Flags:</span>
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                activeFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All ({defaultFlags.length})
            </button>
            <button
              onClick={() => setActiveFilter('HIGH_RISK')}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                activeFilter === 'HIGH_RISK' ? 'bg-red-700 text-white' : 'bg-red-100 text-red-900 hover:bg-red-200'
              }`}
            >
              High Severity Only
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {filteredFlags.map((flag) => (
            <div
              key={flag.id}
              className={`p-4 rounded-xl border space-y-2 ${
                flag.severity === 'HIGH'
                  ? 'bg-red-50/70 border-red-200 text-red-950'
                  : 'bg-amber-50/70 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 ${flag.severity === 'HIGH' ? 'text-red-600' : 'text-amber-600'}`}
                  />
                  <span className="font-bold text-xs">{flag.title}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono font-bold bg-white/80 px-2 py-0.5 rounded border border-slate-300">
                    Type: {flag.flagType}
                  </span>
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                      flag.severity === 'HIGH' ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
                    }`}
                  >
                    {flag.severity} RISK
                  </span>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-800">{flag.description}</p>

              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                <span className="font-bold text-slate-700">
                  Stages Impacted: <span className="font-mono">{flag.nodesInvolved.join(' ➔ ')}</span>
                </span>
                <span className="text-indigo-700 font-bold cursor-pointer hover:underline">
                  View Defense Motion Strategy ➔
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Defense Practice Note on Item Identity */}
      <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-2 text-xs">
        <div className="flex items-center space-x-2 text-amber-400 font-bold">
          <Info className="w-4 h-4" />
          <span>Massachusetts Defense Standard: Item Identity & Chain vs Certificate Conclusion</span>
        </div>
        <p className="text-slate-300 leading-relaxed">
          The Massachusetts Defense Framework treats proof of item identity and the complete chain of custody as strictly separate from the laboratory certificate's scientific conclusion. Under <em>Commonwealth v. Johnson</em> and <em>Commonwealth v. Estrella</em>, a failure of item identity or an unexplained weight/seal modification between seizure and analysis establishes that the Commonwealth cannot prove beyond a reasonable doubt that the evidence analyzed was the exact substance seized.
        </p>
      </div>
    </div>
  );
};
