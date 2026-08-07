import React, { useState } from 'react';
import {
  FolderPlus,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Building2,
  Calendar,
  Shield,
  Briefcase,
  Users,
  Search,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { CaseData, CaseDocument } from '../types';

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  casesList: CaseData[];
  selectedCaseId: string;
  onCreateCase: (newCaseData: Omit<CaseData, 'id' | 'lastUpdated'>, seedSampleDocs: boolean) => void;
  onDeleteCase: (caseId: string) => void;
  onSelectCase: (caseId: string) => void;
}

const MA_DISTRICT_COURTS = [
  'Worcester District Court',
  'Boston Municipal Court - Central',
  'Framingham District Court',
  'Lowell District Court',
  'Quincy District Court',
  'Brockton District Court',
  'Springfield District Court',
  'Lawrence District Court',
  'Lynn District Court',
  'Salem District Court',
  'Barnstable District Court',
  'Fall River District Court',
  'New Bedford District Court',
  'Waltham District Court',
  'Somerville District Court',
  'Cambridge District Court',
  'Other / Custom Venue'
];

const OUI_CHARGES = [
  'OUI-Liquor 1st Offense (M.G.L. c. 90 § 24)',
  'OUI-Liquor 2nd Offense (M.G.L. c. 90 § 24)',
  'OUI-Liquor 3rd Offense (Felony)',
  'OUI-Drugs (Marijuana / Cannabis, M.G.L. c. 90 § 24)',
  'OUI-Drugs (Narcotics / Prescription Controlled Substance)',
  'OUI-Liquor & Child Endangerment',
  'Motor Vehicle Homicide / Negligent Operation'
];

export const NewCaseModal: React.FC<NewCaseModalProps> = ({
  isOpen,
  onClose,
  casesList,
  selectedCaseId,
  onCreateCase,
  onDeleteCase,
  onSelectCase
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');

  // Form State
  const [clientName, setClientName] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [court, setCourt] = useState('Worcester District Court');
  const [customCourt, setCustomCourt] = useState('');
  const [charge, setCharge] = useState(OUI_CHARGES[0]);
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split('T')[0]);
  const [arrestingAgency, setArrestingAgency] = useState('Massachusetts State Police');
  const [seedSampleDocs, setSeedSampleDocs] = useState(false);

  // Search & Delete Confirmation State
  const [searchQuery, setSearchQuery] = useState('');
  const [caseToDelete, setCaseToDelete] = useState<CaseData | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientName.trim()) {
      alert('Please enter a client name.');
      return;
    }

    const finalCourt = court === 'Other / Custom Venue' ? (customCourt || 'District Court') : court;
    const finalCaseNumber = caseNumber.trim() || `${new Date().getFullYear()}CR${Math.floor(1000 + Math.random() * 9000)}`;

    onCreateCase(
      {
        clientName: clientName.trim(),
        caseNumber: finalCaseNumber,
        court: finalCourt,
        charge,
        incidentDate,
        arrestingAgency,
        documents: []
      },
      seedSampleDocs
    );

    // Reset Form
    setClientName('');
    setCaseNumber('');
    onClose();
  };

  const filteredCases = casesList.filter(
    (c) =>
      c.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.court.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center font-bold text-white shadow-xs">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Case Management Hub</h3>
              <p className="text-xs text-slate-400">Create new criminal defense files or manage active client rosters</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Navigation Tabs inside Modal */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 space-x-2">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center border-b-2 ${
              activeTab === 'create'
                ? 'bg-white text-blue-700 border-blue-700 shadow-2xs'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            Create New Case Profile
          </button>

          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center border-b-2 ${
              activeTab === 'manage'
                ? 'bg-white text-blue-700 border-blue-700 shadow-2xs'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            <Briefcase className="w-4 h-4 mr-2" />
            All Active Cases ({casesList.length})
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {/* TAB 1: CREATE NEW CASE FORM */}
          {activeTab === 'create' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">New Case Intake Engine</span>
                  Initialize a new Massachusetts OUI / DUI defense file with automatic rule engine pre-audits, discovery timeline builders, and pleading document drafting.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client Name */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Client Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Users className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Michael R. Sullivan"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Docket / Case Number */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Docket / Case Number</label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="e.g. 2601CR009841"
                      value={caseNumber}
                      onChange={(e) => setCaseNumber(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Court Location */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Court Venue</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <select
                      value={court}
                      onChange={(e) => setCourt(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {MA_DISTRICT_COURTS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  {court === 'Other / Custom Venue' && (
                    <input
                      type="text"
                      placeholder="Enter custom court name..."
                      value={customCourt}
                      onChange={(e) => setCustomCourt(e.target.value)}
                      className="w-full mt-2 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  )}
                </div>

                {/* Primary Offense / Charge */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Primary Charge / Offense</label>
                  <div className="relative">
                    <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <select
                      value={charge}
                      onChange={(e) => setCharge(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {OUI_CHARGES.map((ch) => (
                        <option key={ch} value={ch}>
                          {ch}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Incident / Stop Date */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Incident / Arrest Date</label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="date"
                      value={incidentDate}
                      onChange={(e) => setIncidentDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Arresting Agency */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Arresting Law Enforcement Agency</label>
                  <input
                    type="text"
                    placeholder="e.g. Mass State Police - Troop C / Worcester PD"
                    value={arrestingAgency}
                    onChange={(e) => setArrestingAgency(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Discovery Seeding Option */}
              <div className="pt-2">
                <label className="flex items-start space-x-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={seedSampleDocs}
                    onChange={(e) => setSeedSampleDocs(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Seed with Default Sample Discovery Documents
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Include template police narrative report, Draeger 9510 test ticket, and booking logs so analysis rules run immediately. Uncheck for a completely empty vault.
                    </span>
                  </div>
                </label>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-2xs transition-colors flex items-center"
                >
                  <FolderPlus className="w-4 h-4 mr-1.5" />
                  Create Case File
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: ALL ACTIVE CASES ROSTER & DELETE */}
          {activeTab === 'manage' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by client name, docket number, or court..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50 focus:bg-white"
                  />
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {filteredCases.length} Total Case(s)
                </span>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredCases.map((c) => {
                  const isSelected = c.id === selectedCaseId;
                  const docCount = c.documents?.length || 0;
                  const errorCount = c.analysisResult?.proceduralErrors?.length || 0;

                  return (
                    <div
                      key={c.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-blue-50/80 border-blue-400 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-bold text-slate-900">{c.clientName}</h4>
                          {isSelected && (
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-700 text-white rounded-md">
                              Active Case
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                          Docket: {c.caseNumber} | Venue: {c.court}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Charge: {c.charge} | Docs: {docCount} | Defects: {errorCount}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {!isSelected && (
                          <button
                            onClick={() => {
                              onSelectCase(c.id);
                              onClose();
                            }}
                            className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-800 rounded-lg border border-slate-300 transition-colors flex items-center"
                          >
                            Switch to Case
                            <ArrowRight className="w-3.5 h-3.5 ml-1 text-slate-500" />
                          </button>
                        )}

                        <button
                          onClick={() => setCaseToDelete(c)}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg border border-red-200 transition-colors flex items-center"
                          title="Delete Case"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredCases.length === 0 && (
                  <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No cases match your search query.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DELETE CONFIRMATION MODAL OVERLAY */}
      {caseToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xl max-w-md w-full">
            <div className="flex items-center space-x-3 text-red-700 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-700" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Delete Case File Permanently?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Are you sure you want to delete <strong className="text-slate-900">{caseToDelete.clientName}</strong> (Docket: <span className="font-mono">{caseToDelete.caseNumber}</span>)?
              <br />
              All associated discovery records, procedural defect analyses, and draft pleadings will be removed from local storage.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => setCaseToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  onDeleteCase(caseToDelete.id);
                  setCaseToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-2xs transition-colors flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Yes, Delete Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
