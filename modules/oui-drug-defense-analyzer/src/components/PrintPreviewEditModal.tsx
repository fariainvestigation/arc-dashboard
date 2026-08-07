import React, { useState, useEffect } from 'react';
import {
  Printer,
  X,
  Edit3,
  CheckCircle2,
  Copy,
  FileCode,
  Scale,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  Eye,
  ShieldCheck,
  Award,
  PenTool
} from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { CaseData, AttorneyInfo } from '../types';
import { ArcLogo } from './ArcLogo';
import { AttorneySettingsModal } from './AttorneySettingsModal';

export const getDefaultAttorneyInfo = (): AttorneyInfo => {
  const saved = localStorage.getItem('arc_oui_v1::attorney_info');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }
  return {
    attorneyName: 'Elena Rostova, Esq.',
    bboNumber: 'BBO #689123',
    firmName: 'ARC Investigations & Defense Counsel, P.C.',
    address: '100 Cambridge Street, Suite 1400, Boston, MA 02114',
    phone: '(617) 555-0199',
    email: 'erostova@arcinvestigations.com'
  };
};

export const saveAttorneyInfo = (info: AttorneyInfo) => {
  localStorage.setItem('arc_oui_v1::attorney_info', JSON.stringify(info));
};

interface PrintPreviewEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabKey:
    | 'intake'
    | 'procedural'
    | 'breathalyzer'
    | 'authorities'
    | 'analytics'
    | 'lab'
    | 'evidence'
    | 'legal'
    | 'workspace'
    | 'report';
  tabTitle: string;
  currentCase: CaseData;
  onUpdateCase?: (updated: CaseData) => void;
}

export const PrintPreviewEditModal: React.FC<PrintPreviewEditModalProps> = ({
  isOpen,
  onClose,
  tabKey,
  tabTitle,
  currentCase,
  onUpdateCase
}) => {
  const [attorney, setAttorney] = useState<AttorneyInfo>(getDefaultAttorneyInfo);
  const [reportDate, setReportDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customSubtitle, setCustomSubtitle] = useState<string>('');
  const [customExecutiveNotes, setCustomExecutiveNotes] = useState<string>('');
  const [showCaseHeader, setShowCaseHeader] = useState(true);
  const [showAttorneyBlock, setShowAttorneyBlock] = useState(true);
  const [showStatutoryCitations, setShowStatutoryCitations] = useState(true);
  const [showExecutiveNotes, setShowExecutiveNotes] = useState(true);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Initialize title defaults whenever tab or currentCase changes
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setReportDate(today);

    switch (tabKey) {
      case 'intake':
        setCustomTitle('DISCOVERY VAULT & INTAKE AUDIT REPORT');
        setCustomSubtitle('Comprehensive Discovery Inventory, File Status & Master Chronology');
        setCustomExecutiveNotes(
          `Initial discovery intake audit completed for ${currentCase.clientName}. Total discovery records cataloged: ${currentCase.documents.length}. Case Docket #${currentCase.caseNumber}.`
        );
        break;
      case 'procedural':
        setCustomTitle('PROCEDURAL DEFECT & EVIDENTIARY EXCLUSION REPORT');
        setCustomSubtitle('Massachusetts Statutory & CMR Defect Matrix with Pinpoint Record Cites');
        setCustomExecutiveNotes(
          `Forensic procedural audit identified ${currentCase.analysisResult?.proceduralErrors.length || 0} defects in Commonwealth discovery. Recommended grounds for Rule 13 Motion to Suppress/Dismiss.`
        );
        break;
      case 'breathalyzer':
        setCustomTitle('BREATHALYZER RECORDS & CALIBRATION AUDIT REPORT');
        setCustomSubtitle('501 CMR 2.13 Observation Window & Draeger Alcotest 9510 Verification');
        setCustomExecutiveNotes(
          `Audit of Draeger Alcotest 9510 ticket and booking video sequence logs for ${currentCase.clientName}. Verified compliance with 15-minute continuous visual observation standards.`
        );
        break;
      case 'authorities':
        setCustomTitle('MASSACHUSETTS STATUTORY & CASE LAW AUTHORITY VERIFIER');
        setCustomSubtitle('Table of Verified Binding Judicial Precedents & Regulatory Standards');
        setCustomExecutiveNotes(
          `Compilation of binding Massachusetts Supreme Judicial Court, Appeals Court, and M.G.L. c. 90 authorities governing pending defense motions.`
        );
        break;
      case 'analytics':
        setCustomTitle('RISK & OUTCOME DEFENSE ANALYTICS AUDIT');
        setCustomSubtitle('Defense Pillar Scoring, Motion Issue Support Score & Retrograde BAC Assessment');
        setCustomExecutiveNotes(
          `Risk analytics for ${currentCase.clientName}. Estimated BAC at operation: ${
            currentCase.analysisResult?.estimatedBACAtOperation.min || 0.08
          }% - ${currentCase.analysisResult?.estimatedBACAtOperation.max || 0.12}%.`
        );
        break;
      case 'lab':
        setCustomTitle('FORENSIC LABORATORY RESULTS & CHAIN-OF-CUSTODY AUDIT');
        setCustomSubtitle('Toxicology Component Analysis, Testing Method Validation & Storage Delays');
        setCustomExecutiveNotes(
          `Forensic toxicology audit for certificate #${currentCase.labResultData?.labCertificateId || '2026-LAB-019'}. Chain-of-custody delay: ${
            currentCase.labResultData?.chainOfCustodyDelayDays || 42
          } days.`
        );
        break;
      case 'evidence':
        setCustomTitle('PICTURE & PHOTOGRAPHIC EVIDENCE GALLERY AUDIT');
        setCustomSubtitle('Visual Evidence Catalog, Scene Documentation & Booking Video Screenshots');
        setCustomExecutiveNotes(
          `Photographic evidence inventory for ${currentCase.clientName}. Total cataloged visual assets: ${
            currentCase.extractedImages?.length || 0
          }.`
        );
        break;
      case 'legal':
        setCustomTitle('COURT LEGAL MOTION & PLEADING WORK PRODUCT');
        setCustomSubtitle('Massachusetts District Court Formal Pleading pursuant to Mass. R. Crim. P. 13');
        setCustomExecutiveNotes(
          `Pre-trial motion draft and memorandum of law prepared for filing in ${currentCase.court}.`
        );
        break;
      case 'workspace':
        setCustomTitle('DEFENSE TEAM COLLABORATIVE WORKSPACE NOTES');
        setCustomSubtitle('Attorney Work Product, Pinned Discovery Cites & Task Assignments');
        setCustomExecutiveNotes(
          `Internal defense counsel and investigative team work product for Case #${currentCase.caseNumber}.`
        );
        break;
      case 'report':
        setCustomTitle('COMPREHENSIVE MASTER DEFENSE INVESTIGATION REPORT');
        setCustomSubtitle('Full-Scope Trial Strategy, Procedural Defects & Chemical Test Evaluation');
        setCustomExecutiveNotes(
          `Master investigation report for ${currentCase.clientName} (${currentCase.caseNumber}). Prepared for lead defense counsel trial preparation.`
        );
        break;
      default:
        setCustomTitle(`${tabTitle.toUpperCase()} REPORT`);
        setCustomSubtitle(`Massachusetts OUI Defense Audit for ${currentCase.clientName}`);
        setCustomExecutiveNotes(`Audit report for ${currentCase.clientName}.`);
        break;
    }
  }, [tabKey, currentCase]);

  if (!isOpen) return null;

  const handleAttorneyChange = (field: keyof AttorneyInfo, val: string) => {
    const updated = { ...attorney, [field]: val };
    setAttorney(updated);
    saveAttorneyInfo(updated);
  };

  const errors = currentCase.analysisResult?.proceduralErrors || [];

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    const content = `
================================================================================
${customTitle}
${customSubtitle}
================================================================================
Client: ${currentCase.clientName}
Docket: ${currentCase.caseNumber}
Court: ${currentCase.court}
Charge: ${currentCase.charge}
Incident Date: ${currentCase.incidentDate}
Agency: ${currentCase.arrestingAgency}
Date of Report: ${reportDate}

EXECUTIVE OVERVIEW & ATTORNEY NOTES:
${customExecutiveNotes}

ATTORNEY OF RECORD:
${attorney.attorneyName} (${attorney.bboNumber})
${attorney.firmName}
${attorney.address}
Phone: ${attorney.phone} | Email: ${attorney.email}

IDENTIFIED DEFECTS & FINDINGS (${errors.length}):
${errors
  .map(
    (e, idx) =>
      `[${idx + 1}] ${e.severity} - ${e.title}\nDoc: ${e.pageParagraphRef.documentName || 'Police Report'}, Page ${e.pageParagraphRef.pageNumber}, ¶ ${
        e.pageParagraphRef.paragraphNumber
      }\nQuote: "${e.verbatimQuote}"\nViolation: ${e.standardViolated}\nStrategy: ${e.evidentiaryExclusionStrategy}\n`
  )
  .join('\n')}
`;
    navigator.clipboard.writeText(content);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
  };

  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: 'ARC INVESTIGATIONS & DEFENSE COUNSEL • WORK PRODUCT',
              heading: HeadingLevel.HEADING_3,
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: customTitle,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              text: customSubtitle,
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({ text: `CLIENT: ${currentCase.clientName}\t\t`, bold: true }),
                new TextRun({ text: `DOCKET #: ${currentCase.caseNumber}\n`, bold: true }),
                new TextRun({ text: `COURT: ${currentCase.court}\t\t` }),
                new TextRun({ text: `CHARGE: ${currentCase.charge}\n` }),
                new TextRun({ text: `INCIDENT DATE: ${currentCase.incidentDate}\t\t` }),
                new TextRun({ text: `REPORT DATE: ${reportDate}` })
              ]
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'EXECUTIVE OVERVIEW & ATTORNEY NOTES',
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph({ text: customExecutiveNotes }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: `KEY FINDINGS & AUDIT DETAILS (${errors.length})`,
              heading: HeadingLevel.HEADING_2
            }),
            ...errors.flatMap((e, idx) => [
              new Paragraph({
                children: [
                  new TextRun({ text: `${idx + 1}. [${e.severity}] ${e.title}`, bold: true })
                ]
              }),
              new Paragraph({
                text: `Location: ${e.pageParagraphRef.documentName || 'Police Report'}, Page ${e.pageParagraphRef.pageNumber}, ¶ ${e.pageParagraphRef.paragraphNumber}`
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Verbatim Quote: "${e.verbatimQuote}"`, italics: true })
                ]
              }),
              new Paragraph({ text: `Potential Standard / Authority: ${e.standardViolated}` }),
              new Paragraph({ text: `Exclusion Strategy: ${e.evidentiaryExclusionStrategy}` }),
              new Paragraph({ text: '' })
            ]),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({ text: 'RESPECTFULLY SUBMITTED,\n', italics: true }),
                new TextRun({ text: `${attorney.attorneyName}\n`, bold: true }),
                new TextRun({ text: `${attorney.bboNumber}\n` }),
                new TextRun({ text: `${attorney.firmName}\n` }),
                new TextRun({ text: `${attorney.address}\n` }),
                new TextRun({ text: `Tel: ${attorney.phone} | Email: ${attorney.email}` })
              ]
            })
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tabKey.toUpperCase()}_REPORT_${currentCase.clientName.replace(/\s+/g, '_')}_${reportDate}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-300 shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto print:max-w-none print:max-h-none print:shadow-none print:border-0 print:rounded-none">
        {/* Top Modal Navigation Header (Hidden when printing) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 print:hidden shrink-0">
          <div className="flex items-center space-x-3">
            <ArcLogo variant="full" size="md" />
            <div className="border-l border-slate-700 pl-3">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-900 text-blue-200 border border-blue-700 rounded">
                  PRINT PREVIEW &amp; EDIT
                </span>
                <span className="text-xs text-slate-400 font-mono">Tab: {tabTitle}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">{customTitle}</h3>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center"
              title="Copy formatted document text"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copy Text
            </button>

            <button
              onClick={handleExportDocx}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center"
              title="Download Microsoft Word document"
            >
              <FileCode className="w-3.5 h-3.5 mr-1.5" />
              Export DOCX
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center shadow-xs"
              title="Print directly or save as PDF"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print Directly
            </button>

            <button
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors ml-2"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {copiedNotification && (
          <div className="bg-emerald-600 text-white text-xs py-2 px-6 font-semibold flex items-center justify-center print:hidden shrink-0">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Document text copied to clipboard!
          </div>
        )}

        {/* Modal Main Body Split: Left Editor Panel | Right Paper Preview */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-slate-100">
          {/* LEFT COLUMN: EDITABLE CONTROLS (Hidden when printing) */}
          <div className="lg:col-span-5 p-5 overflow-y-auto border-r border-slate-200 space-y-4 print:hidden text-xs">
            {/* 1. ATTORNEY & COUNSEL INFORMATION BLOCK */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center space-x-2 text-slate-900 font-bold">
                  <User className="w-4 h-4 text-blue-700" />
                  <span className="text-xs uppercase tracking-wider">Attorney &amp; Firm Information</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Auto-Saved
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Attorney Name</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={attorney.attorneyName}
                    onChange={(e) => handleAttorneyChange('attorneyName', e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">BBO / Bar Number</label>
                  <div className="relative">
                    <Award className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={attorney.bboNumber}
                      onChange={(e) => handleAttorneyChange('bboNumber', e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Filing / Report Date</label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Law Firm / Practice Name</label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={attorney.firmName}
                    onChange={(e) => handleAttorneyChange('firmName', e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Office Address</label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={attorney.address}
                    onChange={(e) => handleAttorneyChange('address', e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Telephone Number</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={attorney.phone}
                      onChange={(e) => handleAttorneyChange('phone', e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={attorney.email}
                      onChange={(e) => handleAttorneyChange('email', e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-slate-700">
                  <PenTool className="w-3.5 h-3.5 text-blue-700" />
                  <span className="text-[10px] font-semibold">
                    {attorney.signatureDataUrl ? 'Signature Attached' : 'No Signature'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-2 py-1 rounded transition-colors"
                >
                  Manage Signature &amp; Profile
                </button>
              </div>
            </div>

            {/* 2. CUSTOM DOCUMENT TITLES & EXECUTIVE OVERVIEW NOTES */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center space-x-2 text-slate-900 font-bold pb-2 border-b border-slate-100">
                <Edit3 className="w-4 h-4 text-blue-700" />
                <span className="text-xs uppercase tracking-wider">Document Headings &amp; Custom Notes</span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Main Document Title</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-bold focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Document Subtitle / Descriptor</label>
                <input
                  type="text"
                  value={customSubtitle}
                  onChange={(e) => setCustomSubtitle(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">
                  Executive Overview &amp; Attorney Analysis Notes
                </label>
                <textarea
                  rows={4}
                  value={customExecutiveNotes}
                  onChange={(e) => setCustomExecutiveNotes(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 leading-relaxed font-sans text-xs"
                  placeholder="Enter custom findings, case summary notes, or instructions..."
                />
              </div>
            </div>

            {/* 3. SECTION VISIBILITY TOGGLES */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center space-x-2 text-slate-900 font-bold pb-2 border-b border-slate-100">
                <Eye className="w-4 h-4 text-blue-700" />
                <span className="text-xs uppercase tracking-wider">Print Section Visibility Toggles</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCaseHeader}
                    onChange={(e) => setShowCaseHeader(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-700 font-medium">Case Caption Header</span>
                </label>

                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExecutiveNotes}
                    onChange={(e) => setShowExecutiveNotes(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-700 font-medium">Executive Overview</span>
                </label>

                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showStatutoryCitations}
                    onChange={(e) => setShowStatutoryCitations(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-700 font-medium">Statutory Citations Map</span>
                </label>

                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAttorneyBlock}
                    onChange={(e) => setShowAttorneyBlock(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-700 font-medium">Attorney Signature Block</span>
                </label>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: REAL-TIME COURT-READY PAPER PREVIEW */}
          <div className="lg:col-span-7 p-6 overflow-y-auto bg-slate-200 flex justify-center print:col-span-12 print:p-0 print:bg-white">
            <div
              id="printable-paper-view"
              className="bg-white border border-slate-300 shadow-xl rounded-xl p-8 max-w-2xl w-full text-slate-900 font-serif leading-relaxed text-xs space-y-6 print:border-0 print:shadow-none print:p-0 print:max-w-none"
            >
              {/* TOP BRAND & WORK PRODUCT BANNER */}
              <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ArcLogo size="sm" variant="icon" />
                  <div>
                    <span className="font-bold font-sans text-xs text-slate-900 tracking-wider uppercase block">
                      ARC INVESTIGATIONS &amp; DEFENSE COUNSEL
                    </span>
                    <span className="text-[9px] font-sans text-slate-500 block">
                      Massachusetts District Court Forensic Audit &amp; Legal Work Product
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 block">
                    COURT-READY PREVIEW
                  </span>
                  <span className="text-[9px] font-sans text-slate-400 mt-0.5 block">{reportDate}</span>
                </div>
              </div>

              {/* CASE CAPTION BLOCK */}
              {showCaseHeader && (
                <div className="bg-slate-50 border border-slate-300 rounded-lg p-4 font-sans text-xs space-y-2">
                  <div className="flex justify-between items-start border-b border-slate-200 pb-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">COMMONWEALTH OF MASSACHUSETTS</span>
                      <span className="font-bold text-slate-900 text-sm">{currentCase.court}</span>
                    </div>
                    <div className="text-right font-mono font-bold text-slate-800">
                      <div>DOCKET NO. {currentCase.caseNumber}</div>
                      <div className="text-[10px] text-slate-500 font-normal">Charge: {currentCase.charge}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Client / Defendant:</span>
                      <span className="font-bold text-slate-900">{currentCase.clientName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Arresting Agency:</span>
                      <span className="font-bold text-slate-900">{currentCase.arrestingAgency}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Incident Date:</span>
                      <span className="font-medium text-slate-800">{currentCase.incidentDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Total Discovery Documents:</span>
                      <span className="font-medium text-slate-800">{currentCase.documents.length} Files</span>
                    </div>
                  </div>
                </div>
              )}

              {/* DOCUMENT MAIN HEADING */}
              <div className="text-center space-y-1">
                <h1 className="font-sans font-extrabold text-base uppercase text-slate-900 tracking-wide">
                  {customTitle}
                </h1>
                <p className="font-sans text-xs text-slate-600 italic">{customSubtitle}</p>
              </div>

              {/* EXECUTIVE OVERVIEW & NOTES */}
              {showExecutiveNotes && customExecutiveNotes && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-800">
                    I. EXECUTIVE OVERVIEW &amp; ATTORNEY NOTES
                  </h3>
                  <p className="text-slate-800 leading-relaxed whitespace-pre-wrap font-sans text-xs p-3 bg-slate-50 rounded-lg border border-slate-200">
                    {customExecutiveNotes}
                  </p>
                </div>
              )}

              {/* TAB-SPECIFIC CONTENT AUDIT SUMMARY */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-800">
                  II. TAB AUDIT FINDINGS &amp; DISCOVERY DETAILS ({tabTitle})
                </h3>

                {tabKey === 'intake' && (
                  <div className="space-y-2 font-sans text-xs">
                    <p className="text-slate-700">Cataloged discovery documents in vault:</p>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 font-bold border-b border-slate-200 text-slate-700">
                          <tr>
                            <th className="p-2">Document Name</th>
                            <th className="p-2">Type</th>
                            <th className="p-2">Upload Date</th>
                            <th className="p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {currentCase.documents.map((doc) => (
                            <tr key={doc.id}>
                              <td className="p-2 font-medium">{doc.name}</td>
                              <td className="p-2 font-mono text-[10px] uppercase">{doc.type}</td>
                              <td className="p-2 text-slate-500">{doc.uploadDate}</td>
                              <td className="p-2">
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800">
                                  {doc.status.toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {tabKey === 'procedural' && (
                  <div className="space-y-3 font-sans text-xs">
                    <p className="text-slate-700">Identified procedural errors and statutory violations:</p>
                    {errors.length === 0 ? (
                      <p className="italic text-slate-500">No procedural defects recorded.</p>
                    ) : (
                      errors.map((e, idx) => (
                        <div key={e.id || idx} className="p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-900">
                              {idx + 1}. {e.title}
                            </span>
                            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-red-100 text-red-800">
                              {e.severity}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[11px]">{e.description}</p>
                          <div className="text-[10px] font-mono text-slate-700 bg-white p-1.5 rounded border border-slate-200 italic">
                            "{e.verbatimQuote}"
                          </div>
                          <p className="text-[10px] font-semibold text-blue-900">
                            Potential Standard / Authority: {e.standardViolated}
                          </p>
                          <p className="text-[10px] text-slate-700">
                            Exclusion Strategy: {e.evidentiaryExclusionStrategy}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {tabKey === 'breathalyzer' && (
                  <div className="space-y-2 font-sans text-xs">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                      <span className="font-bold block">501 CMR 2.13 Compliance Audit</span>
                      <p className="text-[11px] mt-1">
                        Draeger Alcotest 9510 test sequence logs evaluated for 15-minute continuous observation compliance. Interrupted observation periods support mandatory chemical test suppression under Commonwealth v. Pierre.
                      </p>
                    </div>
                  </div>
                )}

                {tabKey === 'authorities' && (
                  <div className="space-y-2 font-sans text-xs">
                    <p className="text-slate-700">Verified Massachusetts Authority Table:</p>
                    <ul className="list-disc pl-5 space-y-1 text-slate-800">
                      <li><strong>501 CMR 2.13:</strong> 15-minute continuous visual observation requirement.</li>
                      <li><strong>Commonwealth v. Pierre, 72 Mass. App. Ct. 230:</strong> Strict compliance mandatory for admissibility.</li>
                      <li><strong>Commonwealth v. Gerhardt, 477 Mass. 775:</strong> Field sobriety opinion limits.</li>
                      <li><strong>Commonwealth v. McGrail, 419 Mass. 774:</strong> Refusal evidence absolute exclusion.</li>
                    </ul>
                  </div>
                )}

                {tabKey === 'analytics' && (
                  <div className="space-y-2 font-sans text-xs">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
                      <span className="font-bold block">Defense Score &amp; BAC Range</span>
                      <p className="text-[11px] mt-1">
                        Estimated BAC at Operation: {currentCase.analysisResult?.estimatedBACAtOperation.min || 0.08}% - {currentCase.analysisResult?.estimatedBACAtOperation.max || 0.12}%.
                        <br />
                        Note: {currentCase.analysisResult?.estimatedBACAtOperation.calculationNotes || 'Standard elimination calculation'}.
                      </p>
                    </div>
                  </div>
                )}

                {tabKey === 'lab' && (
                  <div className="space-y-2 font-sans text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="font-bold text-slate-900 block">Forensic Laboratory Audit Summary</span>
                      <p className="text-[11px] text-slate-700 mt-1">
                        Certificate ID: {currentCase.labResultData?.labCertificateId || '2026-LAB-019'}<br />
                        Chain of Custody Delay: {currentCase.labResultData?.chainOfCustodyDelayDays || 42} Days<br />
                        Testing Method: {currentCase.labResultData?.components?.[0]?.testingMethod || 'GC-FID (Infrared)'}
                      </p>
                    </div>
                  </div>
                )}

                {tabKey === 'evidence' && (
                  <div className="space-y-2 font-sans text-xs">
                    <p className="text-slate-700">Cataloged Evidence Assets: {currentCase.extractedImages?.length || 0} Images.</p>
                  </div>
                )}

                {tabKey === 'legal' && (
                  <div className="space-y-2 font-sans text-xs">
                    <p className="text-slate-700">Pre-Trial Motion Work Product generated under Mass. R. Crim. P. 13.</p>
                  </div>
                )}

                {tabKey === 'workspace' && (
                  <div className="space-y-2 font-sans text-xs">
                    <p className="text-slate-700">Total Defense Work Product Notes: {currentCase.notes?.length || 0} Active Entries.</p>
                  </div>
                )}

                {tabKey === 'report' && (
                  <div className="space-y-2 font-sans text-xs">
                    <p className="text-slate-700">Master Investigation Defense Audit Report finalized for defense counsel.</p>
                  </div>
                )}
              </div>

              {/* STATUTORY CITATIONS INDEX CHIPS */}
              {showStatutoryCitations && (
                <div className="pt-3 border-t border-slate-200 font-sans">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Verified Massachusetts Legal Authorities:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                      501 CMR 2.13
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                      M.G.L. c. 90 § 24K
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                      Commonwealth v. Pierre (2008)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                      Mass. R. Crim. P. 13
                    </span>
                  </div>
                </div>
              )}

              {/* FORMAL ATTORNEY SIGNATURE BLOCK */}
              {showAttorneyBlock && (
                <div className="pt-4 border-t border-slate-300 font-sans text-xs space-y-1 text-slate-800">
                  <p className="italic mb-2">Respectfully submitted by Counsel for Defendant,</p>
                  {attorney.signatureDataUrl && (
                    <div className="my-2">
                      <img
                        src={attorney.signatureDataUrl}
                        alt="Attorney Signature"
                        className="max-h-16 max-w-xs object-contain"
                      />
                    </div>
                  )}
                  <p className="font-bold text-sm text-slate-900">{attorney.attorneyName}</p>
                  <p className="text-slate-600 font-mono text-[11px]">{attorney.bboNumber}</p>
                  <p className="text-slate-700 font-medium">{attorney.firmName}</p>
                  <p className="text-slate-600">{attorney.address}</p>
                  <p className="text-slate-600">
                    Tel: {attorney.phone} | Email: {attorney.email}
                  </p>
                  <p className="text-slate-400 text-[10px] pt-1">Date: {reportDate}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AttorneySettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSaved={(updated) => setAttorney(updated)}
      />
    </div>
  );
};
