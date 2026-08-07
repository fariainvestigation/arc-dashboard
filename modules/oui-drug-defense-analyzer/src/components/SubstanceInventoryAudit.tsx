import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Filter,
  FlaskConical,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  X
} from 'lucide-react';
import { CaseData, SubstanceInventoryItem } from '../types';
import { extractSubstanceInventoryWithAI } from '../lib/geminiService';
import {
  createEmptyLabData,
  extractSubstanceInventoryFromCase,
  normalizeSubstanceInventoryItems
} from '../lib/substanceInventoryEngine';

interface SubstanceInventoryAuditProps {
  currentCase: CaseData;
  onUpdateCase?: (updatedCase: CaseData) => void;
}

const statusOptions: SubstanceInventoryItem['substanceStatus'][] = [
  'Alleged',
  'Suspected',
  'Field-Tested',
  'Laboratory-Tested',
  'Packaged',
  'Recovered',
  'Submitted',
  'Destroyed',
  'Assumed',
  'Visual'
];

const basisOptions: SubstanceInventoryItem['identificationBasis'][] = [
  'Visual',
  'Field-Test Based',
  'Laboratory Confirmed',
  'Assumed'
];

const emptyNewItem: Partial<SubstanceInventoryItem> = {
  substanceStatus: 'Alleged',
  reportedDrugName: '',
  exactOfficerWording: '',
  identificationBasis: 'Visual',
  fieldTestBrandOrMethod: 'None stated',
  labReportReference: 'No laboratory confirmation cited',
  weightOrQuantity: '',
  packagingDescription: '',
  evidenceItemNumber: '',
  citationPageAndParagraph: '',
  isUnsupportedIssue: true,
  unsupportedIssueReason: 'Visual or unconfirmed drug identification lacks laboratory chemical verification.'
};

function getInitialItems(currentCase: CaseData): SubstanceInventoryItem[] {
  if (currentCase.labResultData?.substanceInventory?.length) {
    return normalizeSubstanceInventoryItems(currentCase.labResultData.substanceInventory);
  }
  return extractSubstanceInventoryFromCase(currentCase);
}

export const SubstanceInventoryAudit: React.FC<SubstanceInventoryAuditProps> = ({
  currentCase,
  onUpdateCase
}) => {
  const [items, setItems] = useState<SubstanceInventoryItem[]>(() => getInitialItems(currentCase));
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [basisFilter, setBasisFilter] = useState<string>('ALL');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<Partial<SubstanceInventoryItem>>(emptyNewItem);

  useEffect(() => {
    setItems(getInitialItems(currentCase));
  }, [currentCase.id, currentCase.documents.length, currentCase.labResultData?.substanceInventory]);

  const persistItems = (updatedItems: SubstanceInventoryItem[]) => {
    const labResultData = currentCase.labResultData || createEmptyLabData(currentCase);
    onUpdateCase?.({
      ...currentCase,
      labResultData: {
        ...labResultData,
        substanceInventory: updatedItems,
        isSeizedDrugCase: labResultData.isSeizedDrugCase ?? true
      },
      lastUpdated: new Date().toISOString()
    });
  };

  const handleRunExtraction = async () => {
    setIsExtracting(true);
    setExtractionError(null);
    setExtractionMessage(null);

    try {
      // AI runs through the ARC AI gateway; no bundled key to check for.
      let extracted: SubstanceInventoryItem[] = [];

      if (currentCase.documents.length > 0) {
        extracted = await extractSubstanceInventoryWithAI(currentCase.documents, currentCase);
        setExtractionMessage(`AI extraction completed across ${currentCase.documents.length} discovery document(s).`);
      } else {
        extracted = extractSubstanceInventoryFromCase(currentCase);
        setExtractionMessage(
          'Local extraction completed from available lab data and parsed text. Upload discovery documents to enable full AI document review.'
        );
      }

      setItems(extracted);
      persistItems(extracted);
    } catch (err: unknown) {
      const fallback = extractSubstanceInventoryFromCase(currentCase);
      setItems(fallback);
      persistItems(fallback);
      const msg = err instanceof Error ? err.message : 'Substance extraction failed';
      setExtractionError(`${msg}. Local text extraction was used as a fallback.`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAddItem = () => {
    if (!newItem.reportedDrugName?.trim() && !newItem.exactOfficerWording?.trim()) return;

    const normalized = normalizeSubstanceInventoryItems([
      {
        ...newItem,
        id: `sub_manual_${Date.now()}`
      }
    ])[0];

    const updated = [normalized, ...items];
    setItems(updated);
    persistItems(updated);
    setShowAddModal(false);
    setNewItem(emptyNewItem);
  };

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const searchable = [
        item.reportedDrugName,
        item.exactOfficerWording,
        item.evidenceItemNumber,
        item.packagingDescription,
        item.labReportReference,
        item.citationPageAndParagraph
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || searchable.includes(query);
      const matchesStatus = statusFilter === 'ALL' || item.substanceStatus === statusFilter;
      const matchesBasis = basisFilter === 'ALL' || item.identificationBasis === basisFilter;
      const matchesIssues = !issuesOnly || item.isUnsupportedIssue;

      return matchesSearch && matchesStatus && matchesBasis && matchesIssues;
    });
  }, [items, searchQuery, statusFilter, basisFilter, issuesOnly]);

  const unsupportedCount = items.filter((i) => i.isUnsupportedIssue).length;
  const labConfirmedCount = items.filter((i) => i.identificationBasis === 'Laboratory Confirmed' && !i.isUnsupportedIssue).length;
  const fieldOnlyCount = items.filter((i) => i.identificationBasis === 'Field-Test Based').length;
  const visualOrAssumedCount = items.filter((i) => i.identificationBasis === 'Visual' || i.identificationBasis === 'Assumed').length;

  const handleExportCsv = () => {
    const header = [
      'Reported drug name',
      'Exact wording',
      'Substance status',
      'Identification basis',
      'Field-test brand or method',
      'Laboratory report reference',
      'Weight or quantity',
      'Packaging description',
      'Evidence item number',
      'Page and paragraph citation',
      'Unsupported issue',
      'Unsupported issue reason'
    ];

    const rows = items.map((item) => [
      item.reportedDrugName,
      item.exactOfficerWording,
      item.substanceStatus,
      item.identificationBasis,
      item.fieldTestBrandOrMethod,
      item.labReportReference,
      item.weightOrQuantity,
      item.packagingDescription,
      item.evidenceItemNumber,
      item.citationPageAndParagraph,
      item.isUnsupportedIssue ? 'Yes' : 'No',
      item.unsupportedIssueReason || ''
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `substance_inventory_${currentCase.caseNumber || currentCase.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="p-5 bg-slate-900 text-white rounded-2xl shadow-md border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-500/40 rounded-xl text-blue-300">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Substance Inventory & Identification Audit
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Extracts every alleged, suspected, field-tested, lab-tested, packaged, recovered, submitted, and destroyed substance with page and paragraph support.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunExtraction}
              disabled={isExtracting}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 text-xs font-extrabold rounded-xl transition-all shadow-xs flex items-center"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${isExtracting ? 'animate-spin' : ''}`} />
              {isExtracting ? 'Extracting Substances...' : 'Run Substance Extraction'}
            </button>
            <button
              onClick={handleExportCsv}
              disabled={items.length === 0}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:text-slate-500 text-blue-200 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Export CSV
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Record
            </button>
          </div>
        </div>

        <div className="p-3.5 bg-amber-950/80 border border-amber-600/50 rounded-xl text-xs text-amber-200 flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-amber-100 block">
              Mandatory Rule: Visual and Roadside Identification Is Not Lab Confirmation
            </span>
            <p className="text-amber-200/90 text-[11px] leading-relaxed">
              Officer visual impressions, odor statements, packaging similarity, training-and-experience wording, and field color tests remain unconfirmed unless a laboratory report independently confirms the substance.
            </p>
          </div>
        </div>

        {(extractionMessage || extractionError) && (
          <div className={`p-3 rounded-xl border text-xs ${extractionError ? 'bg-red-950/70 border-red-700 text-red-100' : 'bg-emerald-950/60 border-emerald-700 text-emerald-100'}`}>
            {extractionError || extractionMessage}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Substance Records" value={items.length} tone="blue" />
        <MetricCard label="Lab Confirmed" value={labConfirmedCount} tone="emerald" />
        <MetricCard label="Field-Test Only" value={fieldOnlyCount} tone="purple" />
        <MetricCard label="Unsupported IDs" value={unsupportedCount || visualOrAssumedCount} tone="red" />
      </div>

      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
        <div className="flex flex-col xl:flex-row items-center justify-between gap-3">
          <div className="relative w-full xl:w-96">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search drug, wording, item number, lab ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600 bg-slate-50 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto text-xs">
            <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-300 text-xs font-semibold rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <FileCheck2 className="w-3.5 h-3.5 text-slate-500 ml-1" />
              <select
                value={basisFilter}
                onChange={(e) => setBasisFilter(e.target.value)}
                className="bg-white border border-slate-300 text-xs font-semibold rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value="ALL">All Bases</option>
                {basisOptions.map((basis) => (
                  <option key={basis} value={basis}>{basis}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIssuesOnly(!issuesOnly)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center ${
                issuesOnly
                  ? 'bg-red-600 text-white shadow-2xs'
                  : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              Unsupported Only ({unsupportedCount})
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
            <Layers className="w-4 h-4 mr-2 text-blue-700" />
            Extracted Substance Audit Records ({filteredItems.length})
          </h4>
          <span className="text-[11px] font-mono text-slate-500">
            {unsupportedCount} unsupported identification issue(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[1180px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                <th className="p-3 w-28">Evidence Item</th>
                <th className="p-3 w-40">Reported Drug Name</th>
                <th className="p-3 w-64">Exact Wording</th>
                <th className="p-3 w-36">Identification Basis</th>
                <th className="p-3 w-40">Field-Test Method</th>
                <th className="p-3 w-48">Lab Report Reference</th>
                <th className="p-3 w-32">Weight / Quantity</th>
                <th className="p-3 w-44">Packaging</th>
                <th className="p-3 w-48">Page / Paragraph Citation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.map((item) => (
                <React.Fragment key={item.id}>
                  <tr className={`hover:bg-slate-50/80 transition-colors ${item.isUnsupportedIssue ? 'bg-red-50/40' : ''}`}>
                    <td className="p-3 font-mono font-bold text-slate-900 bg-slate-100/50">
                      {item.evidenceItemNumber}
                    </td>
                    <td className="p-3 font-bold text-slate-900 space-y-1">
                      <div>{item.reportedDrugName}</div>
                      <StatusBadge status={item.substanceStatus} />
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-800 italic bg-amber-50/30">
                      {item.exactOfficerWording}
                    </td>
                    <td className="p-3">
                      <BasisBadge item={item} />
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-700">
                      {item.fieldTestBrandOrMethod}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-blue-900 font-semibold">
                      {item.labReportReference}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-900 font-bold">
                      {item.weightOrQuantity}
                    </td>
                    <td className="p-3 text-[11px] text-slate-700">
                      {item.packagingDescription}
                    </td>
                    <td className="p-3 font-mono text-[10px] text-slate-600 bg-slate-50">
                      {item.citationPageAndParagraph}
                    </td>
                  </tr>

                  {item.isUnsupportedIssue && item.unsupportedIssueReason && (
                    <tr className="bg-red-100/60 border-b-2 border-red-200">
                      <td colSpan={9} className="p-3 text-xs text-red-950 font-medium">
                        <div className="flex items-start space-x-2">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-red-900 uppercase mr-2 text-[10px] bg-red-200 border border-red-300 px-1.5 py-0.5 rounded">
                              Unsupported Drug Identification Issue
                            </span>
                            <span>{item.unsupportedIssueReason}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No substance records match the selected filters. Run substance extraction after uploading discovery, or add a record manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <FlaskConical className="w-5 h-5 mr-2 text-blue-600" />
                Add Substance Audit Entry
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <TextInput label="Evidence Item Number" value={newItem.evidenceItemNumber} onChange={(value) => setNewItem({ ...newItem, evidenceItemNumber: value })} />
              <SelectInput
                label="Substance Status"
                value={newItem.substanceStatus || 'Alleged'}
                options={statusOptions}
                onChange={(value) => setNewItem({ ...newItem, substanceStatus: value as SubstanceInventoryItem['substanceStatus'] })}
              />
              <TextInput label="Reported Drug Name" required value={newItem.reportedDrugName} onChange={(value) => setNewItem({ ...newItem, reportedDrugName: value })} className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">Exact Wording Used by Officer / Source *</label>
                <textarea
                  rows={2}
                  value={newItem.exactOfficerWording || ''}
                  onChange={(e) => setNewItem({ ...newItem, exactOfficerWording: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 font-mono"
                />
              </div>
              <SelectInput
                label="Identification Basis"
                value={newItem.identificationBasis || 'Visual'}
                options={basisOptions}
                onChange={(value) => setNewItem({ ...newItem, identificationBasis: value as SubstanceInventoryItem['identificationBasis'] })}
              />
              <TextInput label="Field-Test Brand or Method" value={newItem.fieldTestBrandOrMethod} onChange={(value) => setNewItem({ ...newItem, fieldTestBrandOrMethod: value })} />
              <TextInput label="Laboratory Report Reference" value={newItem.labReportReference} onChange={(value) => setNewItem({ ...newItem, labReportReference: value })} />
              <TextInput label="Weight or Quantity" value={newItem.weightOrQuantity} onChange={(value) => setNewItem({ ...newItem, weightOrQuantity: value })} />
              <TextInput label="Packaging Description" value={newItem.packagingDescription} onChange={(value) => setNewItem({ ...newItem, packagingDescription: value })} />
              <TextInput label="Page and Paragraph Citation" required value={newItem.citationPageAndParagraph} onChange={(value) => setNewItem({ ...newItem, citationPageAndParagraph: value })} />

              {newItem.identificationBasis !== 'Laboratory Confirmed' && (
                <div className="sm:col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
                  <label className="font-bold text-red-900 block text-xs">
                    Unsupported Issue Defense Explanation
                  </label>
                  <textarea
                    rows={2}
                    value={newItem.unsupportedIssueReason || ''}
                    onChange={(e) => setNewItem({ ...newItem, unsupportedIssueReason: e.target.value })}
                    className="w-full text-xs p-2 border border-red-300 rounded-md focus:outline-none focus:border-red-500 bg-white"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold"
              >
                Save Substance Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function MetricCard({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'emerald' | 'purple' | 'red' }) {
  const toneMap = {
    blue: 'text-blue-700 bg-blue-50 border-blue-200',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    purple: 'text-purple-700 bg-purple-50 border-purple-200',
    red: 'text-red-700 bg-red-50 border-red-200'
  };
  return (
    <div className={`p-4 rounded-2xl border bg-white shadow-2xs ${toneMap[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider font-extrabold">{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: SubstanceInventoryItem['substanceStatus'] }) {
  const isLab = status === 'Laboratory-Tested';
  const isField = status === 'Field-Tested';
  return (
    <span className={`inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
      isLab ? 'bg-blue-100 text-blue-800' : isField ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'
    }`}>
      {status}
    </span>
  );
}

function BasisBadge({ item }: { item: SubstanceInventoryItem }) {
  const confirmed = item.identificationBasis === 'Laboratory Confirmed' && !item.isUnsupportedIssue;
  return (
    <span className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
      confirmed
        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
        : item.identificationBasis === 'Field-Test Based'
        ? 'bg-purple-100 text-purple-900 border border-purple-300'
        : item.identificationBasis === 'Visual'
        ? 'bg-amber-100 text-amber-900 border border-amber-300'
        : 'bg-red-100 text-red-900 border border-red-300'
    }`}>
      {confirmed ? <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-700" /> : <AlertTriangle className="w-3 h-3 mr-1 text-amber-700" />}
      {item.identificationBasis}
    </span>
  );
}

function TextInput({
  label,
  value,
  onChange,
  required,
  className = ''
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="font-bold text-slate-700 block mb-1">{label}{required ? ' *' : ''}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="font-bold text-slate-700 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}
