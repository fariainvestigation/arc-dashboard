import React, { useState } from 'react';
import { Search, BookOpen, CheckCircle, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { MASSACHUSETTS_AUTHORITIES } from '../data/maAuthorities';
import { queryCitationWithAI } from '../lib/geminiService';
import { MAAuthority } from '../types';

export const CitationVerifier: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAuthority, setActiveAuthority] = useState<MAAuthority | null>(MASSACHUSETTS_AUTHORITIES[0]);
  const [modelResult, setModelResult] = useState<{
    title: string;
    citation: string;
    type: string;
    summary: string;
    keyHoldings: string[];
  } | null>(null);
  const [isSearchingModel, setIsSearchingModel] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const localMatches = MASSACHUSETTS_AUTHORITIES.filter((auth) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      auth.title.toLowerCase().includes(q) ||
      auth.citation.toLowerCase().includes(q) ||
      auth.summary.toLowerCase().includes(q)
    );
  });

  const handleSearchClick = async () => {
    if (!searchQuery.trim()) return;

    setSearchError(null);
    setModelResult(null);

    // First check local curated table
    const exactLocal = MASSACHUSETTS_AUTHORITIES.find((a) =>
      a.citation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (exactLocal) {
      setActiveAuthority(exactLocal);
      return;
    }

    // If not found in local table, query Gemini AI
    setIsSearchingModel(true);
    try {
      const res = await queryCitationWithAI(searchQuery);
      setModelResult(res);
      setActiveAuthority(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Citation verification request failed';
      setSearchError(msg);
    } finally {
      setIsSearchingModel(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-blue-700" />
            <h3 className="text-lg font-bold text-slate-900">Massachusetts Citation Verifier</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Curated Massachusetts legal authority table and AI legal research verification.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center space-x-2 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search M.G.L. statutes, 501 CMR, or MA case law (e.g., Gerhardt, Cruz, 501 CMR 2.13)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchClick()}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 bg-slate-50 focus:bg-white"
          />
        </div>

        <button
          onClick={handleSearchClick}
          disabled={isSearchingModel}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white font-medium text-xs rounded-lg transition-colors flex items-center shrink-0"
        >
          {isSearchingModel ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1.5" />}
          Verify Citation
        </button>
      </div>

      {searchError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between">
          <span>{searchError}</span>
          <button onClick={handleSearchClick} className="font-bold underline">
            Retry
          </button>
        </div>
      )}

      {/* Grid Display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Curated Table List */}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
            Curated MA Legal Table ({localMatches.length})
          </span>
          {localMatches.map((auth) => {
            const isSelected = activeAuthority?.id === auth.id;
            return (
              <div
                key={auth.id}
                onClick={() => {
                  setActiveAuthority(auth);
                  setModelResult(null);
                }}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50 border-blue-300 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                    {auth.type}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    VERIFIED
                  </span>
                </div>
                <h5 className="text-xs font-bold text-slate-900 truncate">{auth.title}</h5>
                <p className="text-[11px] font-mono text-slate-600 mt-0.5">{auth.citation}</p>
              </div>
            );
          })}
        </div>

        {/* Selected Authority / Model Result Detail */}
        <div className="lg:col-span-2 border border-slate-200 rounded-lg p-5 bg-slate-50/50">
          {activeAuthority && (
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 inline-block mb-1">
                    VERIFIED • CURATED MA TABLE
                  </span>
                  <h4 className="text-base font-bold text-slate-900">{activeAuthority.title}</h4>
                  <p className="text-xs font-mono font-semibold text-blue-700 mt-0.5">{activeAuthority.citation}</p>
                </div>
              </div>

              <div className="space-y-4 text-xs text-slate-800">
                <div>
                  <span className="font-bold text-slate-900 block mb-1">Authority Overview:</span>
                  <p className="bg-white p-3 rounded-md border border-slate-200 text-slate-700 leading-relaxed">
                    {activeAuthority.summary}
                  </p>
                </div>

                <div>
                  <span className="font-bold text-slate-900 block mb-1">Key Legal Holdings & Principles:</span>
                  <ul className="space-y-1.5 list-disc list-inside bg-white p-3 rounded-md border border-slate-200 text-slate-700">
                    {activeAuthority.keyHoldings.map((holding, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {holding}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="text-[10px] text-slate-400 border-t border-slate-200 pt-2 italic">
                  Verification Note: {activeAuthority.verificationNote}
                </div>
              </div>
            </div>
          )}

          {modelResult && (
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full border border-amber-300 inline-block mb-1">
                    UNVERIFIED, MODEL SOURCED
                  </span>
                  <h4 className="text-base font-bold text-slate-900">{modelResult.title}</h4>
                  <p className="text-xs font-mono font-semibold text-amber-800 mt-0.5">{modelResult.citation}</p>
                </div>
              </div>

              <div className="space-y-4 text-xs text-slate-800">
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-900 font-medium">
                  Caution: This citation was sourced dynamically via AI search because it was not in the local curated table. Counsel must independently verify volume and page numbers before court filing.
                </div>

                <div>
                  <span className="font-bold text-slate-900 block mb-1">AI Sourced Summary:</span>
                  <p className="bg-white p-3 rounded-md border border-slate-200 text-slate-700 leading-relaxed">
                    {modelResult.summary}
                  </p>
                </div>

                <div>
                  <span className="font-bold text-slate-900 block mb-1">Holdings:</span>
                  <ul className="space-y-1.5 list-disc list-inside bg-white p-3 rounded-md border border-slate-200 text-slate-700">
                    {modelResult.keyHoldings.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
