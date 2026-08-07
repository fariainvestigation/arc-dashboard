import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import {
  Clock,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  FileText,
  Printer,
  FileJson,
  Code2,
  FileCode,
  ArrowUpDown,
  Search,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  ShieldAlert,
  Scale,
  HelpCircle,
  Copy,
  Check,
  MapPin,
  UserCheck,
  Car,
  Activity,
  ArrowLeftRight,
  Eye,
  Zap,
  Info,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  AlertOctagon,
  MoveHorizontal,
  Maximize2
} from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, HeadingLevel } from 'docx';
import { CaseData, TimelineEvent } from '../types';

interface CaseChronologyProps {
  currentCase: CaseData;
  onUpdateCase: (updated: CaseData) => void;
}

// Event Classification Types
export type TimelineCategory =
  | 'INCIDENT'
  | 'EXIT_ORDER'
  | 'SFST'
  | 'ARREST'
  | 'TRANSPORT'
  | 'BOOKING_ARRIVAL'
  | 'OBSERVATION'
  | 'BREATH_TEST'
  | 'OTHER';

export interface ProcessedEvent extends TimelineEvent {
  id: string;
  minutes: number;
  formattedTime: string;
  category: TimelineCategory;
  categoryLabel: string;
  color: string;
  index: number;
}

export interface TimelineSegment {
  id: string;
  ev1: ProcessedEvent;
  ev2: ProcessedEvent;
  startMin: number;
  endMin: number;
  duration: number;
  isExceeded: boolean;
  isModerate: boolean;
  color: string;
  statusLabel: string;
}

// Convert timestamp string (HH:MM or HH:MM:SS or ISO) to minutes from midnight
export const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;

  // Try Date object
  const d = new Date(timeStr);
  if (!isNaN(d.getTime())) {
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  // Try 24-hour or 12-hour HH:MM:SS or HH:MM match
  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    const ampm = match[4];

    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    return hours * 60 + minutes + seconds / 60;
  }
  return 0;
};

// Format minutes from midnight to readable 12-hour string (e.g., 01:12 AM)
export const formatMinutesToTime = (minutes: number): string => {
  let m = Math.floor(minutes) % 1440;
  if (m < 0) m += 1440;
  const h24 = Math.floor(m / 60);
  const mins = m % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
  const hStr = h12 < 10 ? `0${h12}` : `${h12}`;
  return `${hStr}:${minsStr} ${ampm}`;
};

// Classify event text into domain categories
export const classifyTimelineEvent = (eventText: string): { category: TimelineCategory; label: string; color: string } => {
  const text = eventText.toLowerCase();

  if (
    text.includes('booking officer') ||
    text.includes('arrived at station') ||
    text.includes('booking intake') ||
    text.includes('booking room') ||
    text.includes('booking procedure') ||
    text.includes('custody transfer') ||
    text.includes('booking officer arrival')
  ) {
    return { category: 'BOOKING_ARRIVAL', label: 'Booking Officer Arrival', color: '#059669' }; // Emerald
  }

  if (
    text.includes('observed') ||
    text.includes('stop') ||
    text.includes('patrol') ||
    text.includes('incident') ||
    text.includes('crash') ||
    text.includes('pull over') ||
    text.includes('dispatch') ||
    text.includes('initial contact')
  ) {
    return { category: 'INCIDENT', label: 'Incident / Traffic Stop', color: '#dc2626' }; // Ruby Red
  }

  if (text.includes('exit order') || text.includes('ordered out') || text.includes('exit vehicle') || text.includes('step out')) {
    return { category: 'EXIT_ORDER', label: 'Exit Order Issued', color: '#d97706' }; // Amber
  }

  if (
    text.includes('sfst') ||
    text.includes('sobriety') ||
    text.includes('walk and turn') ||
    text.includes('one leg') ||
    text.includes('hgn') ||
    text.includes('roadside test')
  ) {
    return { category: 'SFST', label: 'Roadside SFST Testing', color: '#7c3aed' }; // Violet
  }

  if (text.includes('arrest') || text.includes('handcuffed') || text.includes('placed under arrest') || text.includes('taken into custody')) {
    return { category: 'ARREST', label: 'Arrest & Handcuffs Applied', color: '#4f46e5' }; // Indigo
  }

  if (text.includes('transport') || text.includes('cruiser') || text.includes('en route') || text.includes('transit')) {
    return { category: 'TRANSPORT', label: 'Cruiser Transport', color: '#0284c7' }; // Sky Blue
  }

  if (text.includes('observation') || text.includes('15-minute') || text.includes('15 min') || text.includes('501 cmr')) {
    return { category: 'OBSERVATION', label: '15-Min Observation Window', color: '#ea580c' }; // Orange
  }

  if (
    text.includes('draeger') ||
    text.includes('breath') ||
    text.includes('alcotest') ||
    text.includes('bac') ||
    text.includes('blood sample') ||
    text.includes('chemical test')
  ) {
    return { category: 'BREATH_TEST', label: 'Chemical Breath/Blood Test', color: '#1d4ed8' }; // Cobalt Blue
  }

  return { category: 'OTHER', label: 'Chronology Event', color: '#64748b' }; // Slate
};

export const CaseChronology: React.FC<CaseChronologyProps> = ({ currentCase, onUpdateCase }) => {
  // Primary View Mode
  const [viewMode, setViewMode] = useState<'graphical' | 'records'>('graphical');

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');

  // Selected event for detail spotlight in graphical mode
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Custom delay threshold setting in minutes (Default: 20 mins)
  const [delayThreshold, setDelayThreshold] = useState<number>(20);

  // Custom gap endpoint overrides (index in processed list)
  const [customIncidentIndex, setCustomIncidentIndex] = useState<number | null>(null);
  const [customBookingIndex, setCustomBookingIndex] = useState<number | null>(null);

  // Focus request passed down to D3 SVG component
  const [requestedFocusRange, setRequestedFocusRange] = useState<{ startMin: number; endMin: number } | null>(null);

  // Inline Editing State (Records Tab)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTime, setEditTime] = useState('');
  const [editEventText, setEditEventText] = useState('');
  const [editDocRef, setEditDocRef] = useState('');
  const [editPage, setEditPage] = useState<number | undefined>(undefined);
  const [editParagraph, setEditParagraph] = useState<number | undefined>(undefined);

  // New Event Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [newEventText, setNewEventText] = useState('');
  const [newDocRef, setNewDocRef] = useState(currentCase.documents[0]?.name || 'Police Incident Report');
  const [newPage, setNewPage] = useState<string>('1');
  const [newParagraph, setNewParagraph] = useState<string>('1');

  // Copy Feedback State
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const rawEventsList: TimelineEvent[] = currentCase.analysisResult?.timelineEvents || [];

  // Helper to commit updated timeline events to parent case state
  const updateTimelineEvents = (newEvents: TimelineEvent[]) => {
    const updatedCase: CaseData = {
      ...currentCase,
      lastUpdated: new Date().toISOString(),
      analysisResult: {
        caseSummary: currentCase.analysisResult?.caseSummary || '',
        clientBackground: currentCase.analysisResult?.clientBackground || '',
        proceduralErrors: currentCase.analysisResult?.proceduralErrors || [],
        defensePillars: currentCase.analysisResult?.defensePillars || [],
        motionWinScores: currentCase.analysisResult?.motionWinScores || [],
        estimatedBACAtOperation: currentCase.analysisResult?.estimatedBACAtOperation || {
          min: 0.08,
          max: 0.12,
          calculationNotes: ''
        },
        timelineEvents: newEvents
      }
    };
    onUpdateCase(updatedCase);
  };

  // Process raw events: add IDs, compute numeric minutes, classify categories
  const processedEvents: ProcessedEvent[] = useMemo(() => {
    return rawEventsList.map((ev, idx) => {
      const minutes = parseTimeToMinutes(ev.time);
      const { category, label, color } = classifyTimelineEvent(ev.event);
      return {
        ...ev,
        id: `ev_${idx}_${minutes}`,
        minutes,
        formattedTime: formatMinutesToTime(minutes) || ev.time,
        category,
        categoryLabel: label,
        color,
        index: idx
      };
    }).sort((a, b) => a.minutes - b.minutes);
  }, [rawEventsList]);

  // Compute consecutive timeline segments & evaluate against delay threshold
  const consecutiveSegments: TimelineSegment[] = useMemo(() => {
    const segments: TimelineSegment[] = [];
    for (let i = 0; i < processedEvents.length - 1; i++) {
      const ev1 = processedEvents[i];
      const ev2 = processedEvents[i + 1];
      let duration = ev2.minutes - ev1.minutes;
      if (duration < 0) duration += 1440; // Handle midnight rollover

      const isExceeded = duration >= delayThreshold;
      const isModerate = !isExceeded && duration >= 15;

      let color = '#10b981'; // Green / Acceptable
      let statusLabel = 'Normal Window';
      if (isExceeded) {
        color = '#ef4444'; // Red threshold exceeded
        statusLabel = `CRITICAL DELAY (${Math.round(duration)}m ≥ ${delayThreshold}m THRESHOLD)`;
      } else if (isModerate) {
        color = '#f59e0b'; // Amber warning
        statusLabel = `MODERATE GAP (${Math.round(duration)}m)`;
      }

      segments.push({
        id: `seg_${ev1.id}_${ev2.id}`,
        ev1,
        ev2,
        startMin: ev1.minutes,
        endMin: ev2.minutes,
        duration: Math.round(duration),
        isExceeded,
        isModerate,
        color,
        statusLabel
      });
    }
    return segments;
  }, [processedEvents, delayThreshold]);

  // Exceeded / Flagged segments
  const flaggedSegments = useMemo(() => {
    return consecutiveSegments.filter((s) => s.isExceeded);
  }, [consecutiveSegments]);

  // Determine Incident Event & Booking Officer Arrival Event
  const incidentEvent = useMemo(() => {
    if (processedEvents.length === 0) return null;
    if (customIncidentIndex !== null && processedEvents[customIncidentIndex]) {
      return processedEvents[customIncidentIndex];
    }
    // Auto-detect: first event with category INCIDENT or first overall
    const detected = processedEvents.find((e) => e.category === 'INCIDENT');
    return detected || processedEvents[0];
  }, [processedEvents, customIncidentIndex]);

  const bookingEvent = useMemo(() => {
    if (processedEvents.length === 0) return null;
    if (customBookingIndex !== null && processedEvents[customBookingIndex]) {
      return processedEvents[customBookingIndex];
    }
    // Auto-detect: first event with category BOOKING_ARRIVAL, or containing "booking"/"station"
    const detected = processedEvents.find((e) => e.category === 'BOOKING_ARRIVAL');
    if (detected) return detected;

    const fallback = processedEvents.find(
      (e) =>
        e.event.toLowerCase().includes('booking') ||
        e.event.toLowerCase().includes('station') ||
        e.event.toLowerCase().includes('arrived')
    );
    return fallback || processedEvents[processedEvents.length - 1];
  }, [processedEvents, customBookingIndex]);

  // Calculate Incident-to-Booking Time Gap
  const gapMetrics = useMemo(() => {
    if (!incidentEvent || !bookingEvent) return null;

    let gapMinutes = bookingEvent.minutes - incidentEvent.minutes;
    if (gapMinutes < 0) gapMinutes += 1440; // Handle midnight crossover

    let gapSeverity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'NORMAL' = 'NORMAL';
    let gapLabel = 'Standard Transit Window';

    if (gapMinutes >= delayThreshold) {
      gapSeverity = 'CRITICAL';
      gapLabel = `CRITICAL UNMONITORED GAP (≥${delayThreshold} MINS THRESHOLD EXCEEDED)`;
    } else if (gapMinutes >= 25) {
      gapSeverity = 'HIGH';
      gapLabel = 'SIGNIFICANT CUSTODY GAP (25-39 MINS)';
    } else if (gapMinutes >= 15) {
      gapSeverity = 'MODERATE';
      gapLabel = 'MODERATE GAP (15-24 MINS)';
    }

    return {
      gapMinutes,
      gapSeverity,
      gapLabel,
      incidentTime: incidentEvent.formattedTime,
      bookingTime: bookingEvent.formattedTime,
      incidentDesc: incidentEvent.event,
      bookingDesc: bookingEvent.event
    };
  }, [incidentEvent, bookingEvent, delayThreshold]);

  // Currently focused event details
  const activeSpotlightEvent = useMemo(() => {
    if (!selectedEventId) return processedEvents[0] || null;
    return processedEvents.find((e) => e.id === selectedEventId) || processedEvents[0] || null;
  }, [processedEvents, selectedEventId]);

  // Filtered list for search
  const filteredEvents = processedEvents.filter(
    (ev) =>
      ev.time.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.documentRef.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Copy helper
  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Start Editing an Event
  const handleStartEdit = (index: number, ev: TimelineEvent) => {
    setEditingIndex(index);
    setEditTime(ev.time);
    setEditEventText(ev.event);
    setEditDocRef(ev.documentRef);
    setEditPage(ev.pageParagraphRef?.pageNumber);
    setEditParagraph(ev.pageParagraphRef?.paragraphNumber);
  };

  // Save Inline Edit
  const handleSaveEdit = (index: number) => {
    if (!editTime.trim() || !editEventText.trim()) return;

    const updated = [...rawEventsList];
    updated[index] = {
      ...updated[index],
      time: editTime.trim(),
      event: editEventText.trim(),
      documentRef: editDocRef.trim() || 'Police Report',
      pageParagraphRef:
        editPage !== undefined && editParagraph !== undefined
          ? { pageNumber: Number(editPage), paragraphNumber: Number(editParagraph) }
          : updated[index].pageParagraphRef
    };

    updateTimelineEvents(updated);
    setEditingIndex(null);
  };

  // Delete Event
  const handleDeleteEvent = (index: number) => {
    const updated = rawEventsList.filter((_, i) => i !== index);
    updateTimelineEvents(updated);
  };

  // Add New Event
  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTime.trim() || !newEventText.trim()) return;

    const newEv: TimelineEvent = {
      time: newTime.trim(),
      event: newEventText.trim(),
      documentRef: newDocRef.trim() || 'Police Report',
      pageParagraphRef: {
        pageNumber: parseInt(newPage) || 1,
        paragraphNumber: parseInt(newParagraph) || 1
      }
    };

    const updated = [...rawEventsList, newEv];
    updateTimelineEvents(updated);

    // Reset Form
    setNewTime('');
    setNewEventText('');
    setNewPage('1');
    setNewParagraph('1');
    setShowAddModal(false);
  };

  // Auto-Sort Chronologically
  const handleSortChronologically = () => {
    const sorted = [...rawEventsList].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
    updateTimelineEvents(sorted);
  };

  // Focus segment on graph
  const handleFocusSegmentOnChart = (startMin: number, endMin: number) => {
    setRequestedFocusRange({ startMin, endMin });
  };

  // Cross-Exam Lead Generator regarding Incident-to-Booking Gap
  const generateGapCrossExamQuestions = () => {
    if (!gapMetrics) return [];
    return [
      `"Officer, your narrative establishes that you initiated the traffic stop at ${gapMetrics.incidentTime}, correct?"`,
      `"However, the booking video and station log show that the booking officer did not take custody of my client until ${gapMetrics.bookingTime}, correct?"`,
      `"That constitutes an unmonitored duration of exactly ${gapMetrics.gapMinutes} minutes between initial contact and booking officer intake, correct?"`,
      `"During those ${gapMetrics.gapMinutes} minutes, you were driving the cruiser, watching traffic, and operating the police radio, meaning your eyes were not continuously fixed on my client, correct?"`,
      `"And you cannot swear under oath that my client did not belch, regurgitate, or clear their throat during that ${gapMetrics.gapMinutes}-minute window prior to station booking?"`
    ];
  };

  // Motion Paragraph Generator for Time Gap
  const generateGapMotionParagraph = () => {
    if (!gapMetrics) return '';
    return `DEFENDANT'S MOTION IN LIMINE / MOTION TO SUPPRESS REGARDING ${gapMetrics.gapMinutes}-MINUTE UNMONITORED TRANSPORT GAP

NOW COMES Defendant, ${currentCase.clientName}, and moves this Honorable Court to suppress all breath test results and officer lay opinion testimony based upon the ${gapMetrics.gapMinutes}-minute gap between initial traffic stop (${gapMetrics.incidentTime}) and booking officer station intake (${gapMetrics.bookingTime}).

GROUNDS & LEGAL AUTHORITY:
1. UNMONITORED CUSTODY GAP:
   The prosecution records confirm that ${gapMetrics.gapMinutes} minutes elapsed between initial police contact at ${gapMetrics.incidentTime} and station booking at ${gapMetrics.bookingTime}. During this transit window, the officer was actively driving, navigating traffic, and completing mobile dispatch tasks.

2. VIOLATION OF MANDATORY 501 CMR 2.13 OBSERVATION:
   Under 501 CMR 2.13 and Commonwealth v. Pierre, 72 Mass. App. Ct. 230, the Commonwealth must prove uninterrupted 1:1 visual observation for 15 minutes prior to chemical testing. An unobserved ${gapMetrics.gapMinutes}-minute transport window invalidates the prerequisite scientific foundation of breath alcohol analysis.

3. RETROGRADE EXTRAPOLATION UNCERTAINTY:
   The substantial delay between reported operation at ${gapMetrics.incidentTime} and chemical testing introduces unquantifiable error under retrograde extrapolation modeling (Commonwealth v. Colturi, 448 Mass. 809).`;
  };

  // Exports
  const handleExportJson = () => {
    const payload = {
      clientName: currentCase.clientName,
      caseNumber: currentCase.caseNumber,
      court: currentCase.court,
      chronologyDate: new Date().toISOString(),
      delayThresholdMinutes: delayThreshold,
      gapMetrics,
      flaggedProceduralDelays: flaggedSegments.map((s) => ({
        fromEvent: s.ev1.event,
        fromTime: s.ev1.formattedTime,
        toEvent: s.ev2.event,
        toTime: s.ev2.formattedTime,
        durationMinutes: s.duration,
        exceededThreshold: delayThreshold
      })),
      timelineEvents: processedEvents
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `case_chronology_gap_${currentCase.caseNumber}.json`;
    a.click();
  };

  const handleExportHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Case Chronology & Delay Threshold Analysis - ${currentCase.clientName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 30px; color: #0f172a; line-height: 1.5; }
    h1 { font-size: 20px; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; color: #1e293b; }
    .gap-banner { background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #991b1b; }
    .timeline { border-left: 3px solid #1d4ed8; padding-left: 20px; margin-top: 20px; }
    .card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .time-badge { background: #1d4ed8; color: #fff; font-weight: bold; font-size: 11px; padding: 3px 8px; border-radius: 4px; display: inline-block; }
    .flagged-badge { background: #dc2626; color: #fff; font-weight: bold; font-size: 11px; padding: 3px 8px; border-radius: 4px; margin-left: 8px; }
  </style>
</head>
<body>
  <h1>GRAPHICAL CASE CHRONOLOGY & PROCEDURAL DELAY REPORT</h1>
  <p><strong>Client:</strong> ${currentCase.clientName} | <strong>Docket:</strong> ${currentCase.caseNumber} | <strong>Delay Threshold:</strong> ${delayThreshold} Mins</p>

  ${
    gapMetrics
      ? `<div class="gap-banner">
          <h2 style="margin: 0 0 6px 0; font-size: 16px;">INCIDENT TO BOOKING OFFICER ARRIVAL GAP: ${gapMetrics.gapMinutes} MINUTES</h2>
          <p style="margin: 0; font-size: 13px;">Incident Stop Time: <strong>${gapMetrics.incidentTime}</strong> &bull; Booking Officer Arrival: <strong>${gapMetrics.bookingTime}</strong></p>
        </div>`
      : ''
  }

  ${
    flaggedSegments.length > 0
      ? `<div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #9f1239; margin-top: 0;">⚠️ Flagged Procedural Delay Intervals (Exceeding ${delayThreshold}m Threshold)</h3>
          <ul>
            ${flaggedSegments
              .map(
                (s) => `<li><strong>${s.duration} MIN DELAY:</strong> From ${s.ev1.formattedTime} (${s.ev1.categoryLabel}) to ${s.ev2.formattedTime} (${s.ev2.categoryLabel})</li>`
              )
              .join('')}
          </ul>
        </div>`
      : ''
  }

  <div class="timeline">
    ${processedEvents
      .map(
        (ev) => `
      <div class="card">
        <div><span class="time-badge">${ev.formattedTime}</span> <strong>[${ev.categoryLabel}]</strong></div>
        <p style="font-weight: 600; font-size: 13px; margin: 6px 0;">${ev.event}</p>
        <div style="font-size: 11px; color: #64748b; font-family: monospace;">Source: ${ev.documentRef} ${
          ev.pageParagraphRef ? `(Page ${ev.pageParagraphRef.pageNumber}, Paragraph ${ev.pageParagraphRef.paragraphNumber})` : ''
        }</div>
      </div>
    `
      )
      .join('')}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `case_chronology_gap_${currentCase.caseNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          children: [
            new Paragraph({ text: `CASE CHRONOLOGY & UNMONITORED TIME GAP REPORT`, heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Client: ${currentCase.clientName} (${currentCase.caseNumber}) | Delay Threshold: ${delayThreshold} Mins` }),
            ...(gapMetrics
              ? [
                  new Paragraph({ text: '' }),
                  new Paragraph({ text: `INCIDENT TO BOOKING OFFICER ARRIVAL TIME GAP ANALYSIS`, heading: HeadingLevel.HEADING_2 }),
                  new Paragraph({ text: `Incident Stop Time: ${gapMetrics.incidentTime}` }),
                  new Paragraph({ text: `Booking Officer Arrival: ${gapMetrics.bookingTime}` }),
                  new Paragraph({ text: `Total Unmonitored Gap Duration: ${gapMetrics.gapMinutes} Minutes` }),
                  new Paragraph({ text: `Gap Severity: ${gapMetrics.gapLabel}` })
                ]
              : []),
            new Paragraph({ text: '' }),
            new Paragraph({ text: `CHRONOLOGICAL EVENT REGISTRY`, heading: HeadingLevel.HEADING_2 }),
            ...processedEvents.flatMap((ev) => [
              new Paragraph({ text: `[${ev.formattedTime}] (${ev.categoryLabel}) - ${ev.event}`, heading: HeadingLevel.HEADING_3 }),
              new Paragraph({
                text: `Reference: ${ev.documentRef} ${
                  ev.pageParagraphRef ? `(Page ${ev.pageParagraphRef.pageNumber}, Paragraph ${ev.pageParagraphRef.paragraphNumber})` : ''
                }`
              }),
              new Paragraph({ text: '' })
            ])
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `case_chronology_gap_${currentCase.caseNumber}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      {/* Top Banner Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-6 h-6 text-blue-700" />
            <h3 className="text-xl font-bold text-slate-900">
              Case Incident Chronology & Time Gap Visualizer
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            D3-powered graphical timeline engine with interactive zoom/pan and auto-color-coded procedural delay thresholds.
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Event
          </button>
          <button
            onClick={handleSortChronologically}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center border border-slate-300"
            title="Auto-sort timeline chronologically"
          >
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
            Auto-Sort
          </button>

          <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block"></div>

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Print
          </button>
          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <FileJson className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            JSON
          </button>
          <button
            onClick={handleExportHtml}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <Code2 className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            HTML
          </button>
          <button
            onClick={handleExportDocx}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center shadow-2xs"
          >
            <FileCode className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            DOCX Gap Report
          </button>
        </div>
      </div>

      {/* Mode View Navigation Tabs & Delay Threshold Controller */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-3 mb-6 gap-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('graphical')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
              viewMode === 'graphical'
                ? 'bg-blue-700 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Activity className="w-4 h-4 mr-2" />
            Graphical Timeline & Zoom Chart
          </button>

          <button
            onClick={() => setViewMode('records')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center ${
              viewMode === 'records'
                ? 'bg-blue-700 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Layers className="w-4 h-4 mr-2" />
            Chronological Registry & Edit ({processedEvents.length})
          </button>
        </div>

        {/* Delay Threshold Interactive Control */}
        <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-lg border border-slate-300 text-xs">
          <span className="font-bold text-slate-700 flex items-center pl-1">
            <Sliders className="w-3.5 h-3.5 text-red-600 mr-1.5" />
            Delay Threshold:
          </span>
          {[15, 20, 25, 30].map((mins) => (
            <button
              key={`thresh_${mins}`}
              onClick={() => setDelayThreshold(mins)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                delayThreshold === mins
                  ? 'bg-red-600 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {mins}m
            </button>
          ))}
          <div className="flex items-center ml-1 border-l border-slate-300 pl-2">
            <input
              type="number"
              min="5"
              max="120"
              value={delayThreshold}
              onChange={(e) => setDelayThreshold(Math.max(1, Number(e.target.value)))}
              className="w-12 px-1.5 py-0.5 text-[11px] font-mono font-bold bg-white border border-slate-300 rounded-md focus:outline-none focus:border-red-600 text-center"
            />
            <span className="text-[10px] text-slate-500 ml-1 font-semibold">mins</span>
          </div>
        </div>
      </div>

      {/* PROCEDURAL ERROR DELAY WARNING BANNER (When segments exceed threshold) */}
      {flaggedSegments.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-xl space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-red-800 font-bold text-sm">
              <AlertOctagon className="w-5 h-5 text-red-600 shrink-0" />
              <span>
                PROCEDURAL ALERT: {flaggedSegments.length} Interval(s) Exceed Booking Delay Threshold ({delayThreshold} Mins)
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase bg-red-600 text-white px-2.5 py-0.5 rounded-full">
              Red Color-Coded Violation
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {flaggedSegments.map((seg) => (
              <div
                key={`alert_${seg.id}`}
                onClick={() => handleFocusSegmentOnChart(seg.startMin, seg.endMin)}
                className="p-3 bg-white border border-red-200 rounded-lg hover:border-red-400 cursor-pointer transition-all flex items-start justify-between gap-2 group shadow-2xs"
              >
                <div>
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-red-700">
                    <span>
                      [{seg.ev1.formattedTime}] {seg.ev1.categoryLabel}
                    </span>
                    <MoveHorizontal className="w-3.5 h-3.5 text-red-400" />
                    <span>
                      [{seg.ev2.formattedTime}] {seg.ev2.categoryLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 line-clamp-1">
                    From: "{seg.ev1.event}" to "{seg.ev2.event}"
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block px-2 py-0.5 bg-red-600 text-white font-mono font-black text-xs rounded-md">
                    {seg.duration} MINS
                  </span>
                  <span className="block text-[10px] text-red-600 font-semibold mt-0.5">
                    +{seg.duration - delayThreshold}m over max
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 1: GRAPHICAL D3 TIMELINE CHART & TIME GAP VISUALIZER */}
      {viewMode === 'graphical' && (
        <div className="space-y-6">
          {/* Tactical Time Gap Banner */}
          {gapMetrics ? (
            <div
              className={`p-5 rounded-xl border transition-all ${
                gapMetrics.gapSeverity === 'CRITICAL' || gapMetrics.gapMinutes >= delayThreshold
                  ? 'bg-red-500/10 border-red-300'
                  : gapMetrics.gapSeverity === 'HIGH'
                  ? 'bg-amber-500/10 border-amber-300'
                  : 'bg-blue-500/10 border-blue-300'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-3 rounded-xl text-white shadow-xs ${
                      gapMetrics.gapSeverity === 'CRITICAL' || gapMetrics.gapMinutes >= delayThreshold
                        ? 'bg-red-600'
                        : gapMetrics.gapSeverity === 'HIGH'
                        ? 'bg-amber-600'
                        : 'bg-blue-600'
                    }`}
                  >
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Incident to Booking Officer Arrival Gap
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider text-white ${
                          gapMetrics.gapSeverity === 'CRITICAL' || gapMetrics.gapMinutes >= delayThreshold
                            ? 'bg-red-600'
                            : gapMetrics.gapSeverity === 'HIGH'
                            ? 'bg-amber-600'
                            : 'bg-blue-600'
                        }`}
                      >
                        {gapMetrics.gapMinutes >= delayThreshold
                          ? `CRITICAL DELAY (≥${delayThreshold}M THRESHOLD)`
                          : gapMetrics.gapLabel}
                      </span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mt-0.5">
                      {gapMetrics.gapMinutes} Minutes Unmonitored Transport Window
                    </h3>
                  </div>
                </div>

                {/* Endpoint Controls & Quick Override Dropdowns */}
                <div className="flex flex-wrap items-center gap-3 bg-white/80 p-2.5 rounded-lg border border-slate-300 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                      Incident Endpoint
                    </label>
                    <select
                      value={processedEvents.findIndex((e) => e.id === incidentEvent?.id)}
                      onChange={(e) => setCustomIncidentIndex(Number(e.target.value))}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 font-semibold text-slate-800 text-xs focus:outline-none focus:border-blue-600"
                    >
                      {processedEvents.map((ev, i) => (
                        <option key={`inc_opt_${i}`} value={i}>
                          [{ev.formattedTime}] {ev.event.substring(0, 30)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <ArrowLeftRight className="w-4 h-4 text-slate-400 shrink-0 self-end mb-1" />

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                      Booking Arrival Endpoint
                    </label>
                    <select
                      value={processedEvents.findIndex((e) => e.id === bookingEvent?.id)}
                      onChange={(e) => setCustomBookingIndex(Number(e.target.value))}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 font-semibold text-slate-800 text-xs focus:outline-none focus:border-blue-600"
                    >
                      {processedEvents.map((ev, i) => (
                        <option key={`book_opt_${i}`} value={i}>
                          [{ev.formattedTime}] {ev.event.substring(0, 30)}...
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Endpoint Highlights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-white/90 rounded-lg border border-slate-200">
                  <div className="flex items-center text-red-700 font-bold mb-1">
                    <Car className="w-4 h-4 mr-1.5" />
                    Initial Incident / Stop Time ({gapMetrics.incidentTime})
                  </div>
                  <p className="text-slate-800 font-medium leading-relaxed">{gapMetrics.incidentDesc}</p>
                </div>

                <div className="p-3 bg-white/90 rounded-lg border border-slate-200">
                  <div className="flex items-center text-emerald-700 font-bold mb-1">
                    <UserCheck className="w-4 h-4 mr-1.5" />
                    Booking Officer Station Intake ({gapMetrics.bookingTime})
                  </div>
                  <p className="text-slate-800 font-medium leading-relaxed">{gapMetrics.bookingDesc}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
              Add timeline events with timestamps to compute incident-to-booking gap.
            </div>
          )}

          {/* D3 GRAPHICAL SVG CANVAS CONTAINER */}
          <div className="p-6 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-sm overflow-hidden">
            {/* D3 Render Component with Zoom & Thresholds */}
            {processedEvents.length > 0 ? (
              <D3TimelineSvg
                events={processedEvents}
                incidentEvent={incidentEvent}
                bookingEvent={bookingEvent}
                selectedEventId={selectedEventId}
                delayThreshold={delayThreshold}
                requestedFocusRange={requestedFocusRange}
                onSelectEvent={(id) => setSelectedEventId(id)}
              />
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                No timeline events available to render on D3 canvas.
              </div>
            )}
          </div>

          {/* ACTIVE SPOTLIGHT EVENT DETAIL CARD */}
          {activeSpotlightEvent && (
            <div className="p-5 bg-slate-50 border-2 border-blue-300 rounded-xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center space-x-2">
                  <span
                    className="text-xs font-bold text-white px-2.5 py-0.5 rounded-md font-mono"
                    style={{ backgroundColor: activeSpotlightEvent.color }}
                  >
                    {activeSpotlightEvent.formattedTime}
                  </span>
                  <span className="text-xs font-bold text-slate-800 bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                    {activeSpotlightEvent.categoryLabel}
                  </span>
                </div>

                <span className="text-xs font-mono text-blue-800 font-bold bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                  {activeSpotlightEvent.documentRef}{' '}
                  {activeSpotlightEvent.pageParagraphRef &&
                    `(p. ${activeSpotlightEvent.pageParagraphRef.pageNumber}, ¶ ${activeSpotlightEvent.pageParagraphRef.paragraphNumber})`}
                </span>
              </div>

              <h4 className="text-base font-bold text-slate-900">{activeSpotlightEvent.event}</h4>

              {/* Tactical Context Note */}
              <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs leading-relaxed text-slate-700">
                <span className="font-bold text-blue-900 block mb-1 flex items-center">
                  <Info className="w-3.5 h-3.5 mr-1 text-blue-700" />
                  Tactical Defense Impact:
                </span>
                {activeSpotlightEvent.category === 'BOOKING_ARRIVAL' && (
                  <span>
                    Official custody transfer time to booking officer. Marks conclusion of transit gap and commencement of station booking procedure.
                  </span>
                )}
                {activeSpotlightEvent.category === 'INCIDENT' && (
                  <span>
                    Initial police contact timestamp. Critical baseline for computing total delay prior to chemical testing and testing retrograde absorption curve shifts.
                  </span>
                )}
                {activeSpotlightEvent.category === 'OBSERVATION' && (
                  <span>
                    Prerequisite 15-minute observation window under 501 CMR 2.13. Requires unbroken 1:1 visual monitoring.
                  </span>
                )}
                {activeSpotlightEvent.category === 'BREATH_TEST' && (
                  <span>
                    Chemical test timestamp. Breath/blood BAC result subject to 501 CMR 2.00 calibration and temperature tolerances.
                  </span>
                )}
                {['EXIT_ORDER', 'SFST', 'ARREST', 'TRANSPORT', 'OTHER'].includes(activeSpotlightEvent.category) && (
                  <span>
                    Chronological milestone recorded in police discovery. Evaluated for narrative internal consistency and CAD dispatch timestamp matches.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* TIME GAP CROSS-EXAMINATION & LEGAL MOTION GENERATOR */}
          {gapMetrics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Cross-Exam Lead Questions */}
              <div className="p-5 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-sm font-bold text-amber-400 flex items-center">
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Cross-Examination Questions: {gapMetrics.gapMinutes}-Min Gap
                  </h4>
                  <button
                    onClick={() =>
                      handleCopyText('cross_exam_gap', generateGapCrossExamQuestions().join('\n\n'))
                    }
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-md transition-colors flex items-center shadow-2xs"
                  >
                    {copiedId === 'cross_exam_gap' ? (
                      <>
                        <Check className="w-3 h-3 mr-1 text-emerald-300" />
                        Copied Questions!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1" />
                        Copy Questions
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-2 font-mono text-[11px] text-slate-200">
                  {generateGapCrossExamQuestions().map((q, idx) => (
                    <div key={`q_${idx}`} className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700 leading-relaxed">
                      {q}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Case Motion Paragraph */}
              <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                  <h4 className="text-sm font-bold text-blue-950 flex items-center">
                    <Scale className="w-4 h-4 mr-2 text-blue-700" />
                    Motion in Limine Paragraph (Formatted for Counsel)
                  </h4>
                  <button
                    onClick={() => handleCopyText('motion_gap', generateGapMotionParagraph())}
                    className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white font-bold text-[11px] rounded-md transition-colors flex items-center shadow-2xs"
                  >
                    {copiedId === 'motion_gap' ? (
                      <>
                        <Check className="w-3 h-3 mr-1 text-emerald-300" />
                        Copied Motion!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1" />
                        Copy Motion Text
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-3 bg-white border border-blue-200 rounded-lg font-mono text-[11px] text-slate-800 leading-relaxed overflow-x-auto whitespace-pre-wrap select-all max-h-56">
                  {generateGapMotionParagraph()}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: CHRONOLOGICAL REGISTRY & INLINE EDITING */}
      {viewMode === 'records' && (
        <div className="space-y-6">
          {/* Search Bar & Stats */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search events, documents, or timestamps..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <span className="text-xs font-mono font-bold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
              {filteredEvents.length} Events Logged
            </span>
          </div>

          {/* Event List / Table */}
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <Clock className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No Chronology Events Found</p>
              <p className="text-xs text-slate-500 mt-1">Click "Add Event" above to add new incident timestamps.</p>
            </div>
          ) : (
            <div className="relative pl-6 sm:pl-8 border-l-2 border-blue-600 space-y-6 my-4">
              {filteredEvents.map((ev, idx) => {
                const isEditing = editingIndex === ev.index;

                // Check delay from previous event in list
                const prevEv = filteredEvents[idx - 1];
                let delayFromPrev = 0;
                if (prevEv) {
                  delayFromPrev = ev.minutes - prevEv.minutes;
                  if (delayFromPrev < 0) delayFromPrev += 1440;
                }
                const isDelayExceeded = delayFromPrev >= delayThreshold;

                return (
                  <div key={`registry_${ev.id}`} className="relative group">
                    {/* Node Dot */}
                    <div
                      className="absolute -left-[31px] sm:-left-[39px] top-1.5 w-5 h-5 rounded-full border-4 border-white shadow-xs flex items-center justify-center text-white"
                      style={{ backgroundColor: isDelayExceeded ? '#ef4444' : ev.color }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    </div>

                    {isEditing ? (
                      /* Inline Edit Form Card */
                      <div className="bg-blue-50/80 border-2 border-blue-400 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-blue-200">
                          <span className="text-xs font-bold text-blue-900 flex items-center">
                            <Edit2 className="w-3.5 h-3.5 mr-1.5 text-blue-700" />
                            Edit Timeline Event
                          </span>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleSaveEdit(ev.index)}
                              className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition-colors flex items-center"
                            >
                              <Save className="w-3.5 h-3.5 mr-1" />
                              Save
                            </button>
                            <button
                              onClick={() => setEditingIndex(null)}
                              className="px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">Time (24h/HH:MM)</label>
                            <input
                              type="text"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">Source Document Reference</label>
                            <input
                              type="text"
                              value={editDocRef}
                              onChange={(e) => setEditDocRef(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">Event Description</label>
                            <textarea
                              rows={2}
                              value={editEventText}
                              onChange={(e) => setEditEventText(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">Page #</label>
                            <input
                              type="number"
                              value={editPage ?? ''}
                              onChange={(e) => setEditPage(e.target.value ? Number(e.target.value) : undefined)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">Paragraph #</label>
                            <input
                              type="number"
                              value={editParagraph ?? ''}
                              onChange={(e) => setEditParagraph(e.target.value ? Number(e.target.value) : undefined)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Standard Card View */
                      <div className={`bg-slate-50 border rounded-xl p-3.5 transition-all shadow-2xs flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                        isDelayExceeded ? 'border-red-300 bg-red-50/40' : 'hover:bg-blue-50/40 border-slate-200 hover:border-blue-300'
                      }`}>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span
                              className="px-2.5 py-0.5 text-white font-mono font-bold text-xs rounded-md shadow-2xs flex items-center"
                              style={{ backgroundColor: ev.color }}
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              {ev.formattedTime}
                            </span>

                            <span className="text-[10px] font-bold px-2 py-0.5 bg-white text-slate-800 rounded-md border border-slate-300 uppercase">
                              {ev.categoryLabel}
                            </span>

                            {isDelayExceeded && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-red-600 text-white rounded-md flex items-center">
                                <AlertOctagon className="w-3 h-3 mr-1" />
                                {Math.round(delayFromPrev)}M Delay from prev event (≥{delayThreshold}m max)
                              </span>
                            )}

                            <span className="text-[11px] font-semibold text-slate-500 flex items-center">
                              <FileText className="w-3 h-3 mr-1 text-slate-400" />
                              {ev.documentRef}
                              {ev.pageParagraphRef && (
                                <span className="ml-1 text-slate-400 font-mono">
                                  (p. {ev.pageParagraphRef.pageNumber}, ¶ {ev.pageParagraphRef.paragraphNumber})
                                </span>
                              )}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-slate-800 pt-1 leading-normal">{ev.event}</p>
                        </div>

                        {/* Edit & Delete Actions */}
                        <div className="flex items-center space-x-1 shrink-0 self-end sm:self-start">
                          <button
                            onClick={() => handleStartEdit(ev.index, ev)}
                            className="px-2.5 py-1 bg-white hover:bg-blue-100 text-slate-600 hover:text-blue-800 text-xs font-medium rounded-md border border-slate-300 transition-colors flex items-center"
                            title="Edit event details"
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(ev.index)}
                            className="p-1 hover:bg-red-100 text-slate-400 hover:text-red-700 rounded-md transition-colors"
                            title="Delete event"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Event Modal / Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h4 className="text-base font-bold text-slate-900 flex items-center">
                <Plus className="w-4 h-4 mr-2 text-blue-700" />
                Add Chronology Event
              </h4>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Timestamp (e.g. 01:15, 01:52, 02:10)</label>
                <input
                  type="text"
                  required
                  placeholder="01:15"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Event Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Booking officer Off. J. Higgins arrived at station cell block and assumed custody..."
                  value={newEventText}
                  onChange={(e) => setNewEventText(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Source Document</label>
                <input
                  type="text"
                  placeholder="Police Incident Report"
                  value={newDocRef}
                  onChange={(e) => setNewDocRef(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Page #</label>
                  <input
                    type="number"
                    min="1"
                    value={newPage}
                    onChange={(e) => setNewPage(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Paragraph #</label>
                  <input
                    type="number"
                    min="1"
                    value={newParagraph}
                    onChange={(e) => setNewParagraph(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors shadow-2xs"
                >
                  Add Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// D3 SVG TIMELINE GRAPHICAL CANVAS SUBCOMPONENT (WITH ZOOM & PAN & THRESHOLDS)
// ============================================================================

interface D3TimelineSvgProps {
  events: ProcessedEvent[];
  incidentEvent: ProcessedEvent | null;
  bookingEvent: ProcessedEvent | null;
  selectedEventId: string | null;
  delayThreshold: number;
  requestedFocusRange?: { startMin: number; endMin: number } | null;
  onSelectEvent: (id: string) => void;
}

const D3TimelineSvg: React.FC<D3TimelineSvgProps> = ({
  events,
  incidentEvent,
  bookingEvent,
  selectedEventId,
  delayThreshold,
  requestedFocusRange,
  onSelectEvent
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // D3 Zoom Transform state
  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

  // Dimension settings
  const width = 940;
  const height = 340;
  const paddingX = 70;
  const axisY = 180;

  // Compute time domain in minutes
  const minutesList = events.map((e) => e.minutes);
  const minMin = Math.min(...minutesList);
  const maxMin = Math.max(...minutesList);

  const domainStart = Math.max(0, minMin - 10);
  const domainEnd = maxMin + 15 > domainStart ? maxMin + 15 : domainStart + 60;

  // Base D3 Linear Scale
  const xScale = useMemo(() => {
    return d3.scaleLinear().domain([domainStart, domainEnd]).range([paddingX, width - paddingX]);
  }, [domainStart, domainEnd, width, paddingX]);

  // Rescaled X Mapping incorporating D3 zoom/pan transform
  const rescaledX = useMemo(() => {
    return zoomTransform.rescaleX(xScale);
  }, [zoomTransform, xScale]);

  // Attach D3 Zoom Behavior to SVG Canvas
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 10]) // Zoom scale range: 0.6x to 10x
      .translateExtent([[-600, -100], [width + 600, height + 100]])
      .on('zoom', (event) => {
        setZoomTransform(event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Prevent full browser page zoom when scrolling wheel over timeline SVG
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    const node = svgRef.current;
    node.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      node.removeEventListener('wheel', handleWheel);
      svg.on('.zoom', null);
    };
  }, [width, height]);

  // Handle external focus requests (e.g. clicking a flagged delay alert)
  useEffect(() => {
    if (requestedFocusRange && svgRef.current && zoomBehaviorRef.current) {
      focusRange(requestedFocusRange.startMin, requestedFocusRange.endMin);
    }
  }, [requestedFocusRange]);

  // Zoom control helpers
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.4);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.7);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(400).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  const focusRange = (startMin: number, endMin: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const x1 = xScale(startMin);
    const x2 = xScale(endMin);
    const rangeSpan = Math.max(10, Math.abs(x2 - x1));
    const availableSpan = width - 2 * paddingX;
    const scale = Math.min(6, Math.max(1, availableSpan / rangeSpan));
    const midX = (x1 + x2) / 2;
    const targetX = width / 2 - scale * midX;

    const t = d3.zoomIdentity.translate(targetX, 0).scale(scale);
    d3.select(svgRef.current).transition().duration(500).call(zoomBehaviorRef.current.transform, t);
  };

  // Compute consecutive interval segments
  const consecutiveSegments: TimelineSegment[] = useMemo(() => {
    const segments: TimelineSegment[] = [];
    for (let i = 0; i < events.length - 1; i++) {
      const ev1 = events[i];
      const ev2 = events[i + 1];
      let duration = ev2.minutes - ev1.minutes;
      if (duration < 0) duration += 1440;

      const isExceeded = duration >= delayThreshold;
      const isModerate = !isExceeded && duration >= 15;

      let color = '#10b981'; // Emerald/Normal
      let statusLabel = 'Normal Window';
      if (isExceeded) {
        color = '#ef4444'; // Red threshold exceeded
        statusLabel = `CRITICAL DELAY (${Math.round(duration)}m ≥ ${delayThreshold}m THRESHOLD)`;
      } else if (isModerate) {
        color = '#f59e0b'; // Amber warning
        statusLabel = `MODERATE GAP (${Math.round(duration)}m)`;
      }

      segments.push({
        id: `seg_${ev1.id}_${ev2.id}`,
        ev1,
        ev2,
        startMin: ev1.minutes,
        endMin: ev2.minutes,
        duration: Math.round(duration),
        isExceeded,
        isModerate,
        color,
        statusLabel
      });
    }
    return segments;
  }, [events, delayThreshold]);

  const flaggedSegments = consecutiveSegments.filter((s) => s.isExceeded);

  // Compute positions for Incident & Booking Event
  const incidentX = incidentEvent ? rescaledX(incidentEvent.minutes) : null;
  const bookingX = bookingEvent ? rescaledX(bookingEvent.minutes) : null;

  // Incident-to-Booking gap minutes
  const overallGapMinutes = incidentEvent && bookingEvent ? bookingEvent.minutes - incidentEvent.minutes : 0;
  const isOverallGapExceeded = overallGapMinutes >= delayThreshold;

  // Dynamic D3 Ticks on rescaled domain
  const timeTicks = rescaledX.ticks(10).map((m) => {
    return {
      minutes: m,
      x: rescaledX(m),
      label: formatMinutesToTime(m)
    };
  });

  return (
    <div className="space-y-3">
      {/* ZOOM & PAN TOOLBAR & QUICK FOCUS PRESETS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-slate-800/90 rounded-xl border border-slate-700 text-xs">
        {/* Left: Quick Focus Presets */}
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Focus Presets:
          </span>

          <button
            onClick={handleResetZoom}
            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-[11px] rounded-md transition-colors flex items-center"
            title="Reset zoom to full timeline view"
          >
            <Maximize2 className="w-3 h-3 mr-1 text-blue-400" />
            Full Chronology
          </button>

          {incidentEvent && (
            <button
              onClick={() => {
                const stopMin = incidentEvent.minutes;
                const endMin = stopMin + 20;
                focusRange(stopMin, endMin);
              }}
              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-[11px] rounded-md transition-colors flex items-center"
            >
              <Car className="w-3 h-3 mr-1 text-red-400" />
              Traffic Stop & SFSTs
            </button>
          )}

          {incidentEvent && bookingEvent && (
            <button
              onClick={() => focusRange(incidentEvent.minutes, bookingEvent.minutes)}
              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-[11px] rounded-md transition-colors flex items-center"
            >
              <Clock className="w-3 h-3 mr-1 text-amber-400" />
              Station Transit Gap
            </button>
          )}

          {flaggedSegments.length > 0 && (
            <button
              onClick={() => {
                const minF = Math.min(...flaggedSegments.map((s) => s.startMin));
                const maxF = Math.max(...flaggedSegments.map((s) => s.endMin));
                focusRange(minF, maxF);
              }}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-md transition-colors flex items-center shadow-2xs"
            >
              <AlertOctagon className="w-3 h-3 mr-1" />
              Flagged Delays ({flaggedSegments.length})
            </button>
          )}
        </div>

        {/* Right: Manual Zoom Buttons & Indicator */}
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono text-slate-300 font-bold bg-slate-900 px-2.5 py-1 rounded-md border border-slate-700">
            🔍 Scale: {zoomTransform.k.toFixed(1)}x
          </span>

          <div className="flex items-center bg-slate-900 rounded-md border border-slate-700 p-0.5">
            <button
              onClick={handleZoomIn}
              className="p-1 hover:bg-slate-700 text-slate-200 hover:text-white rounded-md transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1 hover:bg-slate-700 text-slate-200 hover:text-white rounded-md transition-colors"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1 hover:bg-slate-700 text-slate-200 hover:text-white rounded-md transition-colors"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="hidden sm:inline-block text-[10px] text-slate-400 font-medium italic pl-1">
            Drag to pan • Scroll wheel to zoom
          </span>
        </div>
      </div>

      {/* SVG CANVAS RENDER */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none overflow-hidden cursor-grab active:cursor-grabbing rounded-xl bg-slate-950 border border-slate-800"
        style={{ minWidth: '700px' }}
      >
        <defs>
          {/* Pattern / Gradient for Unmonitored Gap Area */}
          <linearGradient id="gapGradientRed" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#dc2626" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.3" />
          </linearGradient>

          <linearGradient id="gapGradientNormal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
          </linearGradient>

          {/* Marker Arrows for Gap Dimension Line */}
          <marker id="arrowLeftRed" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>
          <marker id="arrowRightRed" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>

          <marker id="arrowLeftNorm" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
          <marker id="arrowRightNorm" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>

          {/* Glow Filter for Active Node */}
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* BACKGROUND AXIS GRID LINES */}
        {timeTicks.map((tick, i) => (
          <g key={`tick_${i}`}>
            <line
              x1={tick.x}
              y1={30}
              x2={tick.x}
              y2={axisY + 40}
              stroke="#1e293b"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={tick.x}
              y={axisY + 55}
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* SHADED UNMONITORED GAP REGION */}
        {incidentX !== null && bookingX !== null && bookingX > incidentX && (
          <g>
            {/* Shaded Rectangle */}
            <rect
              x={incidentX}
              y={45}
              width={bookingX - incidentX}
              height={axisY - 45}
              fill={isOverallGapExceeded ? 'url(#gapGradientRed)' : 'url(#gapGradientNormal)'}
              stroke={isOverallGapExceeded ? '#ef4444' : '#f59e0b'}
              strokeWidth={isOverallGapExceeded ? '2' : '1.5'}
              strokeDasharray={isOverallGapExceeded ? 'none' : '4 2'}
              rx="6"
            />

            {/* Gap Double Arrow Dimension Line */}
            <line
              x1={incidentX + 10}
              y1={60}
              x2={bookingX - 10}
              y2={60}
              stroke={isOverallGapExceeded ? '#ef4444' : '#f59e0b'}
              strokeWidth="2"
              markerStart={isOverallGapExceeded ? 'url(#arrowLeftRed)' : 'url(#arrowLeftNorm)'}
              markerEnd={isOverallGapExceeded ? 'url(#arrowRightRed)' : 'url(#arrowRightNorm)'}
            />

            {/* Gap Duration Label Badge */}
            <rect
              x={(incidentX + bookingX) / 2 - 85}
              y={48}
              width={170}
              height={24}
              fill="#0f172a"
              stroke={isOverallGapExceeded ? '#ef4444' : '#f59e0b'}
              strokeWidth="2"
              rx="12"
            />
            <text
              x={(incidentX + bookingX) / 2}
              y={64}
              textAnchor="middle"
              fill={isOverallGapExceeded ? '#fca5a5' : '#fbbf24'}
              fontSize="10"
              fontWeight="black"
              fontFamily="monospace"
            >
              {isOverallGapExceeded ? '⚠️ GAP EXCEEDED: ' : 'GAP: '}
              {Math.round(overallGapMinutes)} MINS
            </text>
          </g>
        )}

        {/* COLOR-CODED SEGMENT TRACK BANDS (AUTOMATIC PROCEDURAL DELAY THRESHOLD HIGHLIGHTS) */}
        {consecutiveSegments.map((seg) => {
          const x1 = rescaledX(seg.startMin);
          const x2 = rescaledX(seg.endMin);
          const bandWidth = Math.max(2, x2 - x1);

          return (
            <g key={`seg_band_${seg.id}`}>
              {/* Colored Track Bar on Timeline Axis */}
              <rect
                x={x1}
                y={axisY - 5}
                width={bandWidth}
                height={10}
                fill={seg.color}
                opacity={seg.isExceeded ? 0.95 : 0.65}
                rx={3}
              />

              {/* Red Procedural Error Warning Badge for Exceeded Segments */}
              {seg.isExceeded && bandWidth > 20 && (
                <g transform={`translate(${(x1 + x2) / 2}, ${axisY + 22})`}>
                  <rect
                    x={-55}
                    y={-9}
                    width={110}
                    height={18}
                    fill="#dc2626"
                    stroke="#ffffff"
                    strokeWidth="1"
                    rx="9"
                  />
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="black"
                    fontFamily="monospace"
                  >
                    ⚠️ DELAY: {seg.duration}M
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* MAIN HORIZONTAL TIMELINE AXIS LINE */}
        <line
          x1={rescaledX(domainStart) - 50}
          y1={axisY}
          x2={rescaledX(domainEnd) + 50}
          y2={axisY}
          stroke="#3b82f6"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* EVENT MILESTONE NODES & CALLOUT STAGGERING */}
        {events.map((ev, idx) => {
          const x = rescaledX(ev.minutes);
          const isSelected = selectedEventId === ev.id;
          const isUp = idx % 2 === 0; // Stagger labels above/below line
          const lineY2 = isUp ? axisY - 50 : axisY + 50;
          const cardY = isUp ? axisY - 95 : axisY + 60;

          return (
            <g
              key={`node_${ev.id}`}
              onClick={() => onSelectEvent(ev.id)}
              className="cursor-pointer group"
            >
              {/* Vertical Leader Line */}
              <line
                x1={x}
                y1={axisY}
                x2={x}
                y2={lineY2}
                stroke={isSelected ? '#60a5fa' : ev.color}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                strokeDasharray={isSelected ? 'none' : '2 2'}
              />

              {/* Circle Node on Axis */}
              <circle
                cx={x}
                cy={axisY}
                r={isSelected ? '10' : '7'}
                fill={ev.color}
                stroke="#ffffff"
                strokeWidth="2.5"
                filter={isSelected ? 'url(#glow)' : undefined}
              />

              {/* Inner Core Point */}
              <circle cx={x} cy={axisY} r="2.5" fill="#ffffff" />

              {/* Label Callout Badge Card */}
              <g transform={`translate(${Math.max(60, Math.min(width - 140, x - 55))}, ${cardY})`}>
                <rect
                  width={110}
                  height={32}
                  fill={isSelected ? '#1e293b' : '#0f172a'}
                  stroke={isSelected ? '#60a5fa' : ev.color}
                  strokeWidth={isSelected ? '2' : '1'}
                  rx="6"
                  className="transition-all group-hover:stroke-blue-400"
                />
                <text x={8} y={14} fill={ev.color} fontSize="9" fontWeight="bold" fontFamily="monospace">
                  {ev.formattedTime}
                </text>
                <text x={8} y={25} fill="#f8fafc" fontSize="9" fontWeight="semibold" className="truncate">
                  {ev.categoryLabel.length > 16 ? `${ev.categoryLabel.substring(0, 14)}...` : ev.categoryLabel}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
