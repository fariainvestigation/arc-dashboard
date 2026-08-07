import React, { useState } from 'react';
import { FileText, Upload, AlertCircle, CheckCircle, RefreshCw, FolderPlus } from 'lucide-react';
import { CaseData, CaseDocument, ExtractedPage } from '../types';
import { extractDocumentContentWithAI } from '../lib/geminiService';

interface UploadReadinessBannerProps {
  currentCase: CaseData;
  onUpdateCase: (updatedCase: CaseData) => void;
  onRunAnalysis: () => void;
  isAnalyzing: boolean;
  analysisError?: string | null;
}

export const UploadReadinessBanner: React.FC<UploadReadinessBannerProps> = ({
  currentCase,
  onUpdateCase,
  onRunAnalysis,
  isAnalyzing,
  analysisError
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const docCount = currentCase.documents.length;
  const isReady = docCount > 0;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (docCount + files.length > 20) {
      setUploadError('Maximum limit of 20 discovery documents per case exceeded.');
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
          // Read as base64 for Gemini multimodal extraction
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const mimeType = file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg');
          const base64Data = dataUrl.split(',')[1];

          // Use Gemini multimodal extraction
          const extracted = await extractDocumentContentWithAI(base64Data, mimeType, file.name);
          parsedText = extracted.parsedText;
          docPages = extracted.pages;
        } else {
          // Default fallback text reading
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
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              CASE INTAKE & DISCOVERY
            </span>
            <span className="text-xs text-slate-500 font-medium">
              ID: {currentCase.caseNumber} | {currentCase.court}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            {currentCase.clientName} - {currentCase.charge}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Arresting Agency: {currentCase.arrestingAgency} | Incident Date: {currentCase.incidentDate}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="cursor-pointer inline-flex items-center justify-center px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium text-sm rounded-lg shadow-xs transition-colors border border-blue-800">
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Processing Documents...' : 'Ingest Discovery Files'}
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
            className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium text-sm rounded-lg shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
            {isAnalyzing ? 'Analyzing Case Discovery...' : 'Execute Defense Analysis'}
          </button>
        </div>
      </div>

      {/* Discovery Readiness Status Strip */}
      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center space-x-2">
          {isReady ? (
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          ) : (
            <FolderPlus className="w-4 h-4 text-amber-500" />
          )}
          <span>
            {isReady
              ? `Ingested ${docCount} discovery file(s) - Target structured page/paragraph extraction complete.`
              : 'No discovery files loaded for this case. Upload files or select sample case.'}
          </span>
        </div>

        <div className="text-slate-500">Max 20 documents per case | PDF, DOCX, TXT, PNG, JPG</div>
      </div>

      {/* Upload or Analysis Error Banner */}
      {(uploadError || analysisError) && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-sm text-red-800">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{uploadError || analysisError}</span>
          </div>
          <button
            onClick={onRunAnalysis}
            className="text-xs font-semibold px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-md border border-red-300 transition-colors"
          >
            Retry Request
          </button>
        </div>
      )}
    </div>
  );
};
