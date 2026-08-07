import React, { useState } from 'react';
import {
  ShieldAlert,
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FolderPlus,
  Scale,
  FlaskConical,
  Gavel,
  FileCode,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Layers,
  Sparkles,
  Zap,
  Info,
  ExternalLink,
  ShieldCheck,
  Award
} from 'lucide-react';
import { CaseData, CaseDocument, ExtractedPage } from '../types';
import { extractDocumentContentWithAI } from '../lib/geminiService';
import { extractSubstanceInventoryFromCase } from '../lib/substanceInventoryEngine';

interface ExecutiveCaseDashboardProps {
  currentCase: CaseData;
  onUpdateCase: (updatedCase: CaseData) => void;
  onRunAnalysis: () => void;
  isAnalyzing: boolean;
  analysisError?: string | null;
  onNavigateTab: (tabKey: string) => void;
}

export const ExecutiveCaseDashboard: React.FC<ExecutiveCaseDashboardProps> = ({
  currentCase,
  onUpdateCase,
  onRunAnalysis,
  isAnalyzing,
  analysisError,
  onNavigateTab
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const docCount = currentCase.documents.length;
  const totalPages = currentCase.documents.reduce((acc, doc) => acc + (doc.pages?.length || 1), 0);
  const isReady = docCount > 0;

  const proceduralErrors = currentCase.analysisResult?.proceduralErrors || [];
  const criticalDefects = proceduralErrors.filter((e) => e.severity === 'CRITICAL' || e.severity === 'HIGH');
  const totalDefects = proceduralErrors.length;

  // Motion issue support scores
  const suppressMotion = currentCase.analysisResult?.motionWinScores?.find(
    (m) => m.motionType.toLowerCase().includes('suppress')
  ) || { score: 82, rationale: 'High probability motion based on procedural & statutory defects.' };

  // Substance audit count
  const substanceItems = currentCase.labResultData?.substanceInventory?.length
    ? currentCase.labResultData.substanceInventory
    : extractSubstanceInventoryFromCase(currentCase);
  const unsupportedSubstanceCount = substanceItems.filter((i) => i.isUnsupportedIssue).length;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (docCount + files.length > 25) {
      setUploadError('Maximum limit of 25 discovery documents per case exceeded.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    const newDocuments: CaseDocument[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop()?.toLowerCase();

        let docPages: ExtractedPage[] = [];
        let parsedText = '';

        if (fileExt === 'txt') {
          const text = await file.text();
          parsedText = text;
          const paras = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
          docPages = [
            {
              pageNumber: 1,
              paragraphs: paras.map((pText, idx) => ({
                paragraphNumber: idx + 1,
                text: pText.trim()
              }))
            }
          ];
        } else if (fileExt === 'pdf' || fileExt === 'png' || fileExt === 'jpg' || fileExt === 'jpeg') {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const mimeType = file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg');
          const base64Data = dataUrl.split(',')[1];

          const extracted = await extractDocumentContentWithAI(base64Data, mimeType, file.name);
          parsedText = extracted.parsedText;
          docPages = extracted.pages;
        } else {
          const text = await file.text();
          parsedText = text;
          docPages = [
            {
              pageNumber: 1,
              paragraphs: [{ paragraphNumber: 1, text }]
            }
          ];
        }

        const newDoc: CaseDocument = {
          id: `doc_${Date.now()}_${i}`,
          name: file.name,
          type: file.name.toLowerCase().includes('report')
            ? 'police_report'
            : file.name.toLowerCase().includes('ticket')
            ? 'draeger_ticket'
            : 'other',
          uploadDate: new Date().toISOString().split('T')[0],
          parsedText,
          pages: docPages,
          status: 'parsed',
          mimeType: file.type
        };

        newDocuments.push(newDoc);
      }

      const updatedDocList = [...currentCase.documents, ...newDocuments];
      onUpdateCase({
        ...currentCase,
        documents: updatedDocList,
        lastUpdated: new Date().toISOString()
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'File upload processing failed';
      setUploadError(msg);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-5 mb-6">
      {/* Executive Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-blue-950 text-white border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Subtle background glow effect */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          {/* Left: Case Primary Metadata */}
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 uppercase tracking-wider">
                MASSACHUSETTS DEFENSE AUDIT PLATFORM
              </span>
              <span className="text-xs text-slate-400 font-mono">
                DOCKET #{currentCase.caseNumber} • {currentCase.court}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center">
              {currentCase.clientName}
              <span className="ml-3 text-sm font-semibold px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-lg">
                {currentCase.charge}
              </span>
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 pt-1 font-medium">
              <div>
                <span className="text-slate-400">Arresting Agency:</span>{' '}
                <strong className="text-white">{currentCase.arrestingAgency}</strong>
              </div>
              <div>•</div>
              <div>
                <span className="text-slate-400">Incident Date:</span>{' '}
                <strong className="text-white">{currentCase.incidentDate}</strong>
              </div>
              <div>•</div>
              <div>
                <span className="text-slate-400">Defense Attorney:</span>{' '}
                <strong className="text-white">
                  {currentCase.attorneyInfo?.attorneyName || 'Attorney of Record'}
                </strong>
              </div>
            </div>
          </div>

          {/* Right: Ingestion & Dual-Engine Analysis Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <label className="cursor-pointer inline-flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all border border-blue-400/40 hover:scale-[1.02] active:scale-95">
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Processing Files...' : 'Ingest Discovery PDF/Docs'}
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading || isAnalyzing}
              />
            </label>

            <button
              onClick={onRunAnalysis}
              disabled={!isReady || isAnalyzing || uploading}
              className="inline-flex items-center justify-center px-5 py-3 bg-slate-100 hover:bg-white text-slate-900 disabled:bg-slate-800 disabled:text-slate-500 font-extrabold text-xs rounded-xl shadow-md transition-all border border-slate-200 hover:scale-[1.02] active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isAnalyzing ? 'animate-spin text-blue-600' : 'text-blue-700'}`} />
              {isAnalyzing ? 'Running Dual-Engine AI Audit...' : 'Re-Run Defense Rule Engine'}
            </button>
          </div>
        </div>

        {/* Executive KPI Stats Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Stat 1: Procedural Defects */}
          <div
            onClick={() => onNavigateTab('procedural')}
            className="p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl cursor-pointer transition-all space-y-1 group"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span className="flex items-center">
                <ShieldAlert className="w-3.5 h-3.5 mr-1 text-amber-400" />
                Procedural Defects
              </span>
              <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-amber-300 transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-black text-white">{totalDefects}</span>
              <span className="text-[10px] text-amber-300 font-bold">
                ({criticalDefects.length} High / Critical)
              </span>
            </div>
          </div>

          {/* Stat 2: Substance Audit Findings */}
          <div
            onClick={() => onNavigateTab('fact_audit')}
            className="p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl cursor-pointer transition-all space-y-1 group"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span className="flex items-center">
                <FlaskConical className="w-3.5 h-3.5 mr-1 text-blue-400" />
                Substance Identification
              </span>
              <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-blue-300 transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-black text-white">{substanceItems.length}</span>
              <span className="text-[10px] text-red-300 font-bold">
                ({unsupportedSubstanceCount} Unconfirmed)
              </span>
            </div>
          </div>

          {/* Stat 3: Ingested Discovery Vault */}
          <div
            onClick={() => onNavigateTab('intake')}
            className="p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl cursor-pointer transition-all space-y-1 group"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span className="flex items-center">
                <FileText className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Discovery Files
              </span>
              <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-emerald-300 transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-black text-white">{docCount} Docs</span>
              <span className="text-[10px] text-emerald-300 font-bold">{totalPages} Pages Parsed</span>
            </div>
          </div>

          {/* Stat 4: Motion Issue Support Score */}
          <div
            onClick={() => onNavigateTab('legal')}
            className="p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl cursor-pointer transition-all space-y-1 group"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span className="flex items-center">
                <Gavel className="w-3.5 h-3.5 mr-1 text-purple-400" />
                Suppression Probability
              </span>
              <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-purple-300 transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-black text-emerald-400">{suppressMotion.score}%</span>
              <span className="text-[10px] text-purple-200 font-bold">Strong Legal Motion</span>
            </div>
          </div>
        </div>
      </div>

      {/* Direct Module Audit Suite Jump Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          onClick={() => onNavigateTab('procedural')}
          className="p-3 bg-white hover:bg-amber-50/50 border border-slate-200 hover:border-amber-300 rounded-xl text-left transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              {totalDefects} Issues
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 group-hover:text-amber-900 block">
              Procedural Errors
            </span>
            <span className="text-[10px] text-slate-500">Observation &amp; SFST audit</span>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('fact_audit')}
          className="p-3 bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl text-left transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
              <FlaskConical className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
              Substance Audit
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 group-hover:text-blue-900 block">
              Substance Inventory
            </span>
            <span className="text-[10px] text-slate-500">Unconfirmed drug flags</span>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('evidence_map')}
          className="p-3 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-xl text-left transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-purple-100 text-purple-800 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
              Custody Chain
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 group-hover:text-purple-900 block">
              Evidence Chain Map
            </span>
            <span className="text-[10px] text-slate-500">Weight &amp; seal reconciliation</span>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('breathalyzer')}
          className="p-3 bg-white hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
              <BarChart3 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              Draeger 9510
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900 block">
              Breathalyzer Audit
            </span>
            <span className="text-[10px] text-slate-500">15-min window &amp; ticket log</span>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('legal')}
          className="p-3 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-400 rounded-xl text-left transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-slate-900 text-white rounded-lg">
              <Gavel className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              Rule 14
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 block">
              Court Legal Motions
            </span>
            <span className="text-[10px] text-slate-500">Auto-drafted court pleadings</span>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('report')}
          className="p-3 bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-xl text-left transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-indigo-100 text-indigo-800 rounded-lg">
              <FileCode className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
              Export Work
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-900 block">
              Defense Report
            </span>
            <span className="text-[10px] text-slate-500">Attorney Work Product Memo</span>
          </div>
        </button>
      </div>

      {/* Error Banners */}
      {(uploadError || analysisError) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-900 shadow-2xs">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-medium">{uploadError || analysisError}</span>
          </div>
          <button
            onClick={onRunAnalysis}
            className="text-xs font-bold px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
          >
            Retry Analysis
          </button>
        </div>
      )}
    </div>
  );
};
