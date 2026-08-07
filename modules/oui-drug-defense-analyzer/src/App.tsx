import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  FileText,
  BookOpen,
  FileCode,
  BarChart3,
  Users,
  FolderOpen,
  Scale,
  RefreshCw,
  AlertTriangle,
  FlaskConical,
  Image as ImageIcon,
  Gavel,
  Gauge,
  FolderPlus,
  Trash2,
  Plus,
  Printer,
  Edit3
} from 'lucide-react';
import { SAMPLE_MASSACHUSETTS_CASES } from './data/sampleCases';
import { CaseData, CaseDocument, ProceduralError } from './types';
import { runDeterministicRuleEngine } from './lib/ruleEngine';
import { analyzeCaseDocumentsWithAI } from './lib/geminiService';
import { UploadReadinessBanner } from './components/UploadReadinessBanner';
import { ExecutiveCaseDashboard } from './components/ExecutiveCaseDashboard';
import { DocumentVault } from './components/DocumentVault';
import { CaseChronology } from './components/CaseChronology';
import { ProceduralErrorDetector } from './components/ProceduralErrorDetector';
import { CitationVerifier } from './components/CitationVerifier';
import { DefenseReportGenerator } from './components/DefenseReportGenerator';
import { RiskOutcomeAnalytics } from './components/RiskOutcomeAnalytics';
import { CollaborativeWorkspace } from './components/CollaborativeWorkspace';
import { LabAnalytics } from './components/LabAnalytics';
import { EvidenceGallery } from './components/EvidenceGallery';
import { LegalPleadingsGenerator } from './components/LegalPleadingsGenerator';
import { BreathalyzerReview } from './components/BreathalyzerReview';
import { NewCaseModal } from './components/NewCaseModal';
import { PrintPreviewEditModal } from './components/PrintPreviewEditModal';
import { EvidenceMap } from './components/EvidenceMap';
import { StructuredFactsAndAuditCharts } from './components/StructuredFactsAndAuditCharts';

import { ArcLogo } from './components/ArcLogo';

export default function App() {
  // All Cases Roster state persistent in localStorage
  const [casesList, setCasesList] = useState<CaseData[]>(() => {
    const savedList = localStorage.getItem('arc_oui_v1::case_list');
    if (savedList) {
      try {
        const parsed = JSON.parse(savedList);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter(
            (c: CaseData) => !c.clientName.toLowerCase().includes('shaka')
          );
          if (filtered.length > 0) {
            return filtered;
          }
        }
      } catch {
        // fallback
      }
    }
    return SAMPLE_MASSACHUSETTS_CASES.filter(
      (c) => !c.clientName.toLowerCase().includes('shaka')
    );
  });

  // Currently selected case ID
  const [selectedCaseId, setSelectedCaseId] = useState<string>(() => casesList[0]?.id || SAMPLE_MASSACHUSETTS_CASES[0].id);

  // Modal control states
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Per-case state rehydration from localStorage
  const [currentCase, setCurrentCase] = useState<CaseData>(() => {
    const defaultCase = casesList[0] || SAMPLE_MASSACHUSETTS_CASES[0];
    const key = `arc_oui_v1::${defaultCase.id}::case_data`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback to sample
      }
    }
    return defaultCase;
  });

  const [activeTab, setActiveTab] = useState<
    | 'intake'
    | 'procedural'
    | 'breathalyzer'
    | 'authorities'
    | 'report'
    | 'analytics'
    | 'lab'
    | 'fact_audit'
    | 'evidence_map'
    | 'evidence'
    | 'legal'
    | 'workspace'
  >('intake');

  const [printModalTab, setPrintModalTab] = useState<string | null>(null);

  const getTabTitle = (tabKey: string): string => {
    switch (tabKey) {
      case 'intake':
        return 'Discovery Vault & Intake';
      case 'procedural':
        return 'Procedural Errors';
      case 'breathalyzer':
        return 'Breathalyzer Review';
      case 'authorities':
        return 'MA Authority Verifier';
      case 'analytics':
        return 'Risk & Outcome Analytics';
      case 'lab':
        return 'Lab Results Analytics';
      case 'fact_audit':
        return 'Structured Fact & Charts';
      case 'evidence_map':
        return 'Evidence Chain Map';
      case 'evidence':
        return 'Picture Evidence';
      case 'legal':
        return 'Legacy Motion References';
      case 'workspace':
        return 'Team Workspace';
      case 'report':
        return 'Defense Report Generator';
      default:
        return 'Defense Audit';
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Persist case roster to localStorage whenever casesList changes
  useEffect(() => {
    localStorage.setItem('arc_oui_v1::case_list', JSON.stringify(casesList));
  }, [casesList]);

  // Switch Case handler with localStorage rehydration
  const handleCaseSelect = (caseId: string) => {
    setSelectedCaseId(caseId);
    setAnalysisError(null);

    const foundCase = casesList.find((c) => c.id === caseId) || SAMPLE_MASSACHUSETTS_CASES.find((c) => c.id === caseId) || casesList[0];
    const key = `arc_oui_v1::${caseId}::case_data`;
    const saved = localStorage.getItem(key);

    if (saved) {
      try {
        setCurrentCase(JSON.parse(saved));
        return;
      } catch {
        // fallback
      }
    }
    setCurrentCase(foundCase);
  };

  // Create New Case Handler
  const handleCreateNewCase = (newCaseData: Omit<CaseData, 'id' | 'lastUpdated'>, seedSampleDocs: boolean) => {
    const newId = `case_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const defaultDocs: CaseDocument[] = seedSampleDocs ? SAMPLE_MASSACHUSETTS_CASES[0].documents : [];

    const createdCase: CaseData = {
      ...newCaseData,
      id: newId,
      documents: defaultDocs,
      lastUpdated: new Date().toISOString()
    };

    if (defaultDocs.length > 0) {
      const { errors: ruleErrors, motionScores } = runDeterministicRuleEngine(defaultDocs);
      createdCase.analysisResult = {
        caseSummary: `Initial discovery intake completed for ${createdCase.clientName}. Rule engine flagged ${ruleErrors.length} procedural issue(s).`,
        clientBackground: `Client: ${createdCase.clientName}. Charge: ${createdCase.charge}. Venue: ${createdCase.court}.`,
        proceduralErrors: ruleErrors,
        timelineEvents: [
          { time: createdCase.incidentDate || 'Incident Date', event: `Arrest / Incident recorded for ${createdCase.clientName}`, documentRef: defaultDocs[0]?.name || 'Police Report' }
        ],
        defensePillars: [
          { pillar: 'Observation & Timeline', score: 85, rationale: 'Continuous observation window compliance review' },
          { pillar: 'Exit Order Basis', score: 80, rationale: 'Exit order based solely on odor of alcohol/marijuana' },
          { pillar: 'SFST Compliance', score: 90, rationale: 'Standardized field sobriety test instructions and ground conditions' }
        ],
        motionWinScores: motionScores,
        estimatedBACAtOperation: { min: 0.08, max: 0.12, calculationNotes: 'Standard estimated range' }
      };
    }

    const updatedList = [createdCase, ...casesList];
    setCasesList(updatedList);
    setSelectedCaseId(newId);
    setCurrentCase(createdCase);
    setActiveTab('intake');
  };

  // Delete Case Handler
  const handleDeleteCase = (caseIdToDelete: string) => {
    const remainingCases = casesList.filter((c) => c.id !== caseIdToDelete);
    localStorage.removeItem(`arc_oui_v1::${caseIdToDelete}::case_data`);

    if (remainingCases.length === 0) {
      const defaultBlankCase: CaseData = {
        id: `case_${Date.now()}`,
        clientName: 'New Client Intake',
        caseNumber: `${new Date().getFullYear()}01CR0001`,
        court: 'Worcester District Court',
        charge: 'OUI-Liquor 1st Offense',
        incidentDate: new Date().toISOString().split('T')[0],
        arrestingAgency: 'Police Department',
        documents: [],
        lastUpdated: new Date().toISOString()
      };
      setCasesList([defaultBlankCase]);
      setSelectedCaseId(defaultBlankCase.id);
      setCurrentCase(defaultBlankCase);
    } else {
      setCasesList(remainingCases);
      if (selectedCaseId === caseIdToDelete) {
        const nextCase = remainingCases[0];
        setSelectedCaseId(nextCase.id);
        setCurrentCase(nextCase);
      }
    }
  };

  // Persist currentCase state whenever updated
  useEffect(() => {
    const key = `arc_oui_v1::${currentCase.id}::case_data`;
    localStorage.setItem(key, JSON.stringify(currentCase));
  }, [currentCase]);

  // Initial rule engine run if case has no analysis result yet
  useEffect(() => {
    if (!currentCase.analysisResult && currentCase.documents.length > 0) {
      handleExecuteAnalysis();
    }
  }, [currentCase.id]);

  // Execute Analysis: Dual Layer Engine
  const handleExecuteAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      // Layer A: Deterministic Rule Engine (Instant, Trustworthy)
      const { errors: ruleErrors, motionScores } = runDeterministicRuleEngine(currentCase.documents);

      let aiErrors: ProceduralError[] = [];
      let aiSummary = '';
      let aiBackground = '';
      let aiPillars = [];
      let aiTimeline = [];
      let estimatedBAC = { min: 0.08, max: 0.12, calculationNotes: 'Standard BAC range' };

      // Layer B: Gemini model analysis, routed through the ARC AI gateway.
      // Availability is no longer tied to a bundled key; the gateway holds the
      // credential and returns 401/403 if the Access session cannot use it.
      if (true) {
        try {
          const aiResult = await analyzeCaseDocumentsWithAI(currentCase.documents, currentCase);
          aiErrors = aiResult.proceduralErrors || [];
          aiSummary = aiResult.caseSummary || '';
          aiBackground = aiResult.clientBackground || '';
          aiPillars = aiResult.defensePillars || [];
          aiTimeline = aiResult.timelineEvents || [];
          if (aiResult.estimatedBACAtOperation) {
            estimatedBAC = aiResult.estimatedBACAtOperation;
          }
        } catch (aiErr: unknown) {
          console.warn('Gemini Layer B analysis skipped or failed:', aiErr);
          // Deterministic Layer A still functions!
        }
      }

      // Combine Layer A and Layer B findings cleanly
      const allErrors = [...ruleErrors, ...aiErrors];

      const updatedCaseData: CaseData = {
        ...currentCase,
        lastUpdated: new Date().toISOString(),
        analysisResult: {
          caseSummary:
            aiSummary ||
            `Case analysis completed for ${currentCase.clientName}. Layer A deterministic rules identified ${ruleErrors.length} procedural error(s).`,
          clientBackground: aiBackground || `Driver: ${currentCase.clientName}. Charge: ${currentCase.charge}.`,
          proceduralErrors: allErrors,
          timelineEvents:
            aiTimeline.length > 0
              ? aiTimeline
              : currentCase.documents.length > 0
              ? [
                  {
                    time: currentCase.incidentDate || 'Incident Date',
                    event: `Initial discovery review for ${currentCase.clientName}`,
                    documentRef: currentCase.documents[0]?.name || 'Discovery File'
                  }
                ]
              : [],
          defensePillars:
            aiPillars.length > 0
              ? aiPillars
              : [
                  { pillar: 'Observation & Timeline', score: 85, rationale: 'Continuous observation window compliance review' },
                  { pillar: 'Exit Order Basis', score: 80, rationale: 'Exit order based solely on odor of alcohol/marijuana' },
                  { pillar: 'SFST Compliance', score: 90, rationale: 'Standardized field sobriety test administration compliance' }
                ],
          motionWinScores: motionScores,
          estimatedBACAtOperation: estimatedBAC
        }
      };

      setCurrentCase(updatedCaseData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Defense analysis failed';
      setAnalysisError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateCase = (updated: CaseData) => {
    setCurrentCase(updated);
    setCasesList((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleBatchAddDocuments = (newDocs: CaseDocument[]) => {
    const updatedDocs = [...currentCase.documents, ...newDocs];
    const updated = {
      ...currentCase,
      documents: updatedDocs,
      lastUpdated: new Date().toISOString()
    };
    setCurrentCase(updated);
  };

  const handleRemoveDocument = (docId: string) => {
    const updatedDocs = currentCase.documents.filter((d) => d.id !== docId);
    const updated = { ...currentCase, documents: updatedDocs, lastUpdated: new Date().toISOString() };
    setCurrentCase(updated);
  };

  const totalDefects = currentCase.analysisResult?.proceduralErrors.length || 0;

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col justify-between">
      {/* Top Professional Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <ArcLogo variant="full" />
            <div className="hidden md:block border-l border-slate-700 pl-3">
              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-900 text-blue-200 border border-blue-700 rounded-md">
                MA EDITION
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Massachusetts Defense & Investigation Platform
              </p>
            </div>
          </div>

          {/* Case Switcher & Case Management Controls */}
          <div className="flex flex-wrap items-center space-x-2 sm:space-x-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <select
                value={selectedCaseId}
                onChange={(e) => handleCaseSelect(e.target.value)}
                className="w-full text-xs font-bold bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              >
                {casesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.clientName} ({c.caseNumber}) - {c.court.split(' ')[0]}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Header Action Buttons: New Case, Print Preview & Delete Case */}
            <button
              onClick={() => setIsNewCaseModalOpen(true)}
              className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center shadow-xs"
              title="Create New Case Profile"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Case
            </button>

            <button
              onClick={() => setPrintModalTab(activeTab)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 hover:text-white border border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center"
              title="Configure Attorney Details & Print Preview Active View"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
              Print / Edit
            </button>

            <button
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-700 rounded-lg transition-colors"
              title="Delete Current Active Case"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <div className="text-right shrink-0 hidden lg:block border-l border-slate-800 pl-3">
              <span className="text-xs font-bold text-emerald-400 block">{totalDefects} Defects Identified</span>
              <span className="text-[10px] text-slate-400">Rule Engine &amp; AI Dual-Layer</span>
            </div>
          </div>
        </div>

        {/* Primary Workspace Category Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-800">
          <nav className="flex space-x-1 sm:space-x-2 py-2 overflow-x-auto text-xs font-bold text-slate-300">
            {/* Category 1: Discovery & Files */}
            <button
              onClick={() => setActiveTab('intake')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center whitespace-nowrap ${
                ['intake', 'evidence', 'workspace'].includes(activeTab)
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-white text-slate-300'
              }`}
            >
              <FolderOpen className="w-4 h-4 mr-2 text-blue-300" />
              1. Intake &amp; Discovery
            </button>

            {/* Category 2: Defect Audits */}
            <button
              onClick={() => setActiveTab('procedural')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center whitespace-nowrap ${
                ['procedural', 'breathalyzer', 'lab', 'authorities'].includes(activeTab)
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-white text-slate-300'
              }`}
            >
              <ShieldAlert className="w-4 h-4 mr-2 text-amber-400" />
              2. Defect Audits
              {totalDefects > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-amber-500/30 text-amber-200 border border-amber-400/40 rounded-full text-[10px] font-extrabold">
                  {totalDefects}
                </span>
              )}
            </button>

            {/* Category 3: Analytics */}
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-white text-slate-300'
              }`}
            >
              <BarChart3 className="w-4 h-4 mr-2 text-purple-300" />
              3. Risk Analytics
            </button>

            {/* Category 4: Motions & Reports */}
            <button
              onClick={() => setActiveTab('legal')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center whitespace-nowrap ${
                ['legal', 'report'].includes(activeTab)
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-white text-slate-300'
              }`}
            >
              <Gavel className="w-4 h-4 mr-2 text-emerald-300" />
              4. Motions &amp; Work Product
            </button>
          </nav>
        </div>

        {/* Sub-Navigation Sub-Pill Bar for Active Category Tools */}
        <div className="bg-slate-950 text-slate-200 border-t border-b border-slate-800 py-2 shadow-inner">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 shrink-0">
                Tools:
              </span>

              {/* Discovery Category Sub-Tools */}
              {['intake', 'evidence', 'workspace'].includes(activeTab) && (
                <>
                  <button
                    onClick={() => setActiveTab('intake')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'intake'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Discovery Vault &amp; Intake
                  </button>

                  <button
                    onClick={() => setActiveTab('evidence')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'evidence'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Picture Evidence Gallery
                  </button>

                  <button
                    onClick={() => setActiveTab('workspace')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'workspace'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Team Workspace
                  </button>
                </>
              )}

              {/* Defect Audits Category Sub-Tools */}
              {['procedural', 'breathalyzer', 'lab', 'fact_audit', 'evidence_map', 'authorities'].includes(activeTab) && (
                <>
                  <button
                    onClick={() => setActiveTab('procedural')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'procedural'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                    Procedural Errors ({totalDefects})
                  </button>

                  <button
                    onClick={() => setActiveTab('breathalyzer')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'breathalyzer'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Breathalyzer Review
                  </button>

                  <button
                    onClick={() => setActiveTab('lab')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'lab'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <FlaskConical className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Lab Results Analytics
                  </button>

                  <button
                    onClick={() => setActiveTab('fact_audit')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'fact_audit'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Structured Fact &amp; Charts
                  </button>

                  <button
                    onClick={() => setActiveTab('evidence_map')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'evidence_map'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Evidence Chain Map
                  </button>

                  <button
                    onClick={() => setActiveTab('authorities')}
                    className={`px-3.5 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'authorities'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    MA Authority Verifier
                  </button>
                </>
              )}

              {/* Analytics Category Sub-Tools */}
              {activeTab === 'analytics' && (
                <button
                  onClick={() => setActiveTab('analytics')}
                  className="px-3 py-1 rounded-md bg-blue-900/80 text-white font-bold border border-blue-600/60 flex items-center whitespace-nowrap"
                >
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5 text-purple-300" />
                  Case Risk &amp; Outcome Analytics
                </button>
              )}

              {/* Motion Issues & Work Product Category Sub-Tools */}
              {['legal', 'report'].includes(activeTab) && (
                <>
                  <button
                    onClick={() => setActiveTab('legal')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'legal'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Gavel className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                    Legacy Motion References
                  </button>

                  <button
                    onClick={() => setActiveTab('report')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center whitespace-nowrap ${
                      activeTab === 'report'
                        ? 'bg-blue-900/80 text-white font-bold border border-blue-600/60'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                    Defense Report Generator
                  </button>
                </>
              )}
            </div>

            <div className="hidden sm:flex items-center space-x-2 shrink-0">
              <span className="text-[11px] text-slate-400 font-medium">Viewing:</span>
              <span className="font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                {getTabTitle(activeTab)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main App Content View Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {/* Persistent Case Intake Surface on Top for Intake Tab */}
        {activeTab === 'intake' && (
          <>
            <ExecutiveCaseDashboard
              currentCase={currentCase}
              onUpdateCase={handleUpdateCase}
              onRunAnalysis={handleExecuteAnalysis}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              onNavigateTab={(tabKey) => setActiveTab(tabKey as any)}
            />
            <DocumentVault
              documents={currentCase.documents}
              onRemoveDocument={handleRemoveDocument}
              onBatchAddDocuments={handleBatchAddDocuments}
            />
            <CaseChronology currentCase={currentCase} onUpdateCase={handleUpdateCase} />
          </>
        )}

        {/* Tab 2: Procedural Errors */}
        {activeTab === 'procedural' && (
          <ProceduralErrorDetector
            errors={currentCase.analysisResult?.proceduralErrors || []}
            isAnalyzing={isAnalyzing}
            currentCase={currentCase}
            onUpdateCase={handleUpdateCase}
          />
        )}

        {/* Tab 3: Breathalyzer Records Review */}
        {activeTab === 'breathalyzer' && (
          <BreathalyzerReview currentCase={currentCase} onUpdateCase={handleUpdateCase} />
        )}

        {/* Tab 3: Authority Verifier */}
        {activeTab === 'authorities' && <CitationVerifier />}

        {/* Tab 4: Risk & Outcome Analytics */}
        {activeTab === 'analytics' && (
          <RiskOutcomeAnalytics
            currentCase={currentCase}
            proceduralErrors={currentCase.analysisResult?.proceduralErrors || []}
            availableCases={SAMPLE_MASSACHUSETTS_CASES}
          />
        )}

        {/* Tab 5: Lab Results Analytics */}
        {activeTab === 'lab' && <LabAnalytics currentCase={currentCase} onUpdateCase={handleUpdateCase} />}

        {/* Tab 5b: Structured Fact Engine & Audit Charts */}
        {activeTab === 'fact_audit' && (
          <StructuredFactsAndAuditCharts currentCase={currentCase} onUpdateCase={handleUpdateCase} />
        )}

        {/* Tab 5c: Evidence Chain Reconciliation Map */}
        {activeTab === 'evidence_map' && <EvidenceMap currentCase={currentCase} />}

        {/* Tab 6: Picture Evidence Gallery */}
        {activeTab === 'evidence' && <EvidenceGallery currentCase={currentCase} onUpdateCase={handleUpdateCase} />}

        {/* Tab 7: Legacy Motion References & Pleadings */}
        {activeTab === 'legal' && (
          <LegalPleadingsGenerator currentCase={currentCase} onUpdateCase={handleUpdateCase} />
        )}

        {/* Tab 8: Team Workspace */}
        {activeTab === 'workspace' && (
          <CollaborativeWorkspace currentCase={currentCase} onUpdateCase={handleUpdateCase} />
        )}

        {/* Tab 9: Defense Report Generator (LAST TAB) */}
        {activeTab === 'report' && (
          <DefenseReportGenerator
            currentCase={currentCase}
            proceduralErrors={currentCase.analysisResult?.proceduralErrors || []}
          />
        )}
      </main>

      {/* PERSISTENT FOOTER GUARDRIL ON EVERY PAGE */}
      <footer className="bg-slate-900 text-slate-400 py-4 px-4 text-center text-xs border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto leading-relaxed">
          This tool assists licensed Massachusetts counsel, output is attorney work product, all citations and quotes must be independently verified against the source discovery before filing, and no output constitutes legal advice.
        </div>
      </footer>

      {/* NEW CASE MODAL & CASE ROSTER HUB */}
      <NewCaseModal
        isOpen={isNewCaseModalOpen}
        onClose={() => setIsNewCaseModalOpen(false)}
        casesList={casesList}
        selectedCaseId={selectedCaseId}
        onCreateCase={handleCreateNewCase}
        onDeleteCase={handleDeleteCase}
        onSelectCase={handleCaseSelect}
      />

      {/* QUICK DELETE ACTIVE CASE CONFIRMATION MODAL */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xl max-w-md w-full">
            <div className="flex items-center space-x-3 text-red-700 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-700" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Delete Current Active Case?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Are you sure you want to delete <strong className="text-slate-900">{currentCase.clientName}</strong> (Docket: <span className="font-mono">{currentCase.caseNumber}</span>)?
              <br />
              This will permanently delete this case profile and all associated discovery documents from local storage.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  handleDeleteCase(currentCase.id);
                  setIsDeleteConfirmOpen(false);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-2xs transition-colors flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Yes, Delete Active Case
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Print Preview & Edit Modal */}
      {printModalTab && (
        <PrintPreviewEditModal
          isOpen={printModalTab !== null}
          onClose={() => setPrintModalTab(null)}
          tabKey={printModalTab as any}
          tabTitle={getTabTitle(printModalTab)}
          currentCase={currentCase}
          onUpdateCase={handleUpdateCase}
        />
      )}
    </div>
  );
}
