import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';
import { BarChart3, TrendingUp, Sliders, AlertCircle, GitCompare } from 'lucide-react';
import { AnalysisRunHistory, CaseData, ProceduralError } from '../types';
import { CaseComparisonView } from './CaseComparisonView';

interface RiskOutcomeAnalyticsProps {
  currentCase: CaseData;
  proceduralErrors: ProceduralError[];
  availableCases?: CaseData[];
}

export const RiskOutcomeAnalytics: React.FC<RiskOutcomeAnalyticsProps> = ({
  currentCase,
  proceduralErrors,
  availableCases
}) => {
  const [analyticsMode, setAnalyticsMode] = useState<'single' | 'compare'>('single');
  // Elimination rate slider state (0.010 to 0.025 %/hr)
  const [eliminationRate, setEliminationRate] = useState<number>(0.015);

  // Persistent Run History
  const [history, setHistory] = useState<AnalysisRunHistory[]>(() => {
    const key = `arc_oui_v1::${currentCase.id}::run_history`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback initial
      }
    }
    return proceduralErrors.length > 0
      ? [
          {
            id: 'run_1',
            timestamp: 'Initial Ingestion',
            defectCount: proceduralErrors.length,
            riskScore: Math.min(95, 40 + proceduralErrors.length * 12),
            motionScores: []
          }
        ]
      : [];
  });

  // Re-sync history when active case changes
  useEffect(() => {
    const key = `arc_oui_v1::${currentCase.id}::run_history`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
        return;
      } catch {
        // fallback
      }
    }
    setHistory(
      proceduralErrors.length > 0
        ? [
            {
              id: 'run_1',
              timestamp: 'Initial Ingestion',
              defectCount: proceduralErrors.length,
              riskScore: Math.min(95, 40 + proceduralErrors.length * 12),
              motionScores: []
            }
          ]
        : []
    );
  }, [currentCase.id]);

  // Save run history when errors update
  useEffect(() => {
    if (proceduralErrors.length > 0) {
      const key = `arc_oui_v1::${currentCase.id}::run_history`;
      const newRun: AnalysisRunHistory = {
        id: `run_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        defectCount: proceduralErrors.length,
        riskScore: Math.min(95, 40 + proceduralErrors.length * 12),
        motionScores: currentCase.analysisResult?.motionWinScores.map((m) => ({
          motionType: m.motionType,
          score: m.score
        })) || []
      };

      setHistory((prev) => {
        const updated = [...prev, newRun].slice(-6); // Keep last 6 runs
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
    }
  }, [proceduralErrors.length, currentCase.id]);

  // 1. Motion Issue Support Score Data
  const motionData = currentCase.analysisResult?.motionWinScores || [
    { motionType: 'Suppress Exit Order', score: 75 },
    { motionType: 'Suppress Breath Test', score: 85 },
    { motionType: 'Exclude SFSTs', score: 90 },
    { motionType: 'Bar Refusal', score: 95 }
  ];

  // 2. Retrograde BAC Curve Calculation
  // Inputs: assume test taken 2 hours post-stop, test result 0.090 g/210L
  const testBAC = 0.090;
  const hoursElapsed = 2.0;

  // BAC at operation = testBAC + (eliminationRate * hoursElapsed)
  const estimatedBACAtOpMin = parseFloat((testBAC + (eliminationRate - 0.003) * hoursElapsed).toFixed(3));
  const estimatedBACAtOpMax = parseFloat((testBAC + (eliminationRate + 0.003) * hoursElapsed).toFixed(3));

  const bacCurveData = [
    { timeLabel: 'Drinking Start', bacMin: 0.0, bacMax: 0.0, threshold: 0.08 },
    { timeLabel: 'Stop Time (01:10)', bacMin: estimatedBACAtOpMin, bacMax: estimatedBACAtOpMax, threshold: 0.08 },
    { timeLabel: 'Arrest (01:15)', bacMin: estimatedBACAtOpMin - 0.005, bacMax: estimatedBACAtOpMax - 0.005, threshold: 0.08 },
    { timeLabel: 'Draeger Test (01:30)', bacMin: testBAC, bacMax: testBAC, threshold: 0.08 }
  ];

  // 3. Procedural Defect Radar Scores (Computed from 5 Pillars)
  const pillarScores = [
    {
      pillar: 'Observation & Timeline',
      score: proceduralErrors.some((e) => e.category === 'Observation Window') ? 90 : 30
    },
    {
      pillar: 'Exit Order Basis',
      score: proceduralErrors.some((e) => e.category === 'Exit Order') ? 85 : 25
    },
    {
      pillar: 'SFST Compliance',
      score: proceduralErrors.some((e) => e.category === 'SFST Administration' || e.category === 'Cannabis Impairment') ? 95 : 20
    },
    {
      pillar: 'Chemical Integrity',
      score: proceduralErrors.some((e) => e.category === 'Draeger Calibration') ? 80 : 35
    },
    {
      pillar: 'Statutory Rights',
      score: proceduralErrors.some((e) => e.category === 'Statutory Rights') ? 88 : 40
    }
  ];

  return (
    <div className="space-y-6 mb-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-blue-700" />
              <h3 className="text-lg font-bold text-slate-900">Defense Risk & Outcome Analytics</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Rule-engine motion issue support scores, retrograde BAC band modeling, and side-by-side case procedural error comparison.
            </p>
          </div>

          {/* Analytics Mode Toggle Buttons */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 shrink-0">
            <button
              onClick={() => setAnalyticsMode('single')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center ${
                analyticsMode === 'single'
                  ? 'bg-blue-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
              Single Case Modeling
            </button>
            <button
              onClick={() => setAnalyticsMode('compare')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center ${
                analyticsMode === 'compare'
                  ? 'bg-blue-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5 mr-1.5" />
              Side-by-Side 2-Case Comparison
            </button>
          </div>
        </div>

        {analyticsMode === 'compare' ? (
          <CaseComparisonView
            availableCases={availableCases}
            initialCaseAId={currentCase.id}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Motion Issue Support Score Bar Chart */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
            Motion Issue Support Score (%) - Rule Engine Indicator Only
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={motionData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="motionType" type="category" width={110} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', color: '#fff', fontSize: '11px' }}
                />
                <Bar dataKey="score" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Retrograde BAC Curve Band Modeling */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Retrograde BAC Modeling Range
            </h4>
            <div className="flex items-center space-x-2">
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] font-mono font-bold text-slate-700">
                Rate: {eliminationRate.toFixed(3)} %/hr
              </span>
            </div>
          </div>

          <div className="mb-3">
            <input
              type="range"
              min="0.010"
              max="0.025"
              step="0.001"
              value={eliminationRate}
              onChange={(e) => setEliminationRate(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-700"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Slow (0.010 %/hr)</span>
              <span>Standard (0.015 %/hr)</span>
              <span>Fast (0.025 %/hr)</span>
            </div>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bacCurveData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="timeLabel" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 0.15]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', color: '#fff', fontSize: '11px' }} />
                <Area type="monotone" dataKey="bacMax" stroke="#2563eb" fill="#93c5fd" fillOpacity={0.4} name="Upper BAC Band" />
                <Area type="monotone" dataKey="bacMin" stroke="#1d4ed8" fill="#3b82f6" fillOpacity={0.6} name="Lower BAC Band" />
                <Line type="monotone" dataKey="threshold" stroke="#dc2626" strokeDasharray="5 5" name="0.08 Statutory Threshold" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="text-[10px] text-slate-500 italic mt-2">
            Caption: Retrograde extrapolation requires qualified expert testimony. This chart is a defense planning aid only.
          </p>
        </div>

        {/* 3. Procedural Defect Radar */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
            Procedural Defect Radar (5 Defense Pillars)
          </h4>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={pillarScores}>
                <PolarGrid />
                <PolarAngleAxis dataKey="pillar" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Radar name="Defect Density" dataKey="score" stroke="#1d4ed8" fill="#3b82f6" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Trends Over Time Across Analysis Runs */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
            Analysis Run History & Defect Score Trends
          </h4>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', color: '#fff', fontSize: '11px' }} />
                <Line type="monotone" dataKey="defectCount" stroke="#d97706" strokeWidth={2} name="Defects Found" />
                <Line type="monotone" dataKey="riskScore" stroke="#2563eb" strokeWidth={2} name="Defense Strength Score" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    )}
  </div>
</div>
);
};
