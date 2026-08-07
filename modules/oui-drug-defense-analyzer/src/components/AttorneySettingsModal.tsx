import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  Award,
  Building2,
  MapPin,
  Phone,
  Mail,
  PenTool,
  Upload,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { AttorneyInfo } from '../types';
import { getDefaultAttorneyInfo, saveAttorneyInfo } from './PrintPreviewEditModal';

interface AttorneySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (updated: AttorneyInfo) => void;
}

export const AttorneySettingsModal: React.FC<AttorneySettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const [attorney, setAttorney] = useState<AttorneyInfo>(getDefaultAttorneyInfo);
  const [activeSigTab, setActiveSigTab] = useState<'draw' | 'upload'>('draw');
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAttorney(getDefaultAttorneyInfo());
      setIsSavedSuccess(false);
      // Initialize canvas if tab is draw
      setTimeout(() => initCanvas(), 50);
    }
  }, [isOpen]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1e293b'; // Slate 800 ink color
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const adoptCanvasSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    setAttorney((prev) => ({ ...prev, signatureDataUrl: dataUrl }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setAttorney((prev) => ({ ...prev, signatureDataUrl: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  const generateSampleCursiveSignature = () => {
    // Generate an elegant SVG cursive signature data URL
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80">
      <path d="M20 50 C 35 20, 45 15, 55 45 C 65 25, 75 35, 85 45 C 95 30, 110 20, 125 45 C 135 48, 150 42, 160 46 C 175 15, 185 20, 195 45 C 205 35, 215 40, 225 45 C 235 40, 245 42, 260 45 M15 52 L 275 52" stroke="#1e293b" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="25" y="70" font-family="cursive, Georgia, serif" font-size="14" font-style="italic" fill="#334155">${attorney.attorneyName || 'Elena Rostova, Esq.'}</text>
    </svg>`;
    const encoded = `data:image/svg+xml;base64,${btoa(svgString)}`;
    setAttorney((prev) => ({ ...prev, signatureDataUrl: encoded }));
  };

  const removeSignature = () => {
    setAttorney((prev) => ({ ...prev, signatureDataUrl: undefined }));
    clearCanvas();
  };

  const handleSave = () => {
    saveAttorneyInfo(attorney);
    setIsSavedSuccess(true);
    if (onSaved) {
      onSaved(attorney);
    }
    setTimeout(() => {
      setIsSavedSuccess(false);
      onClose();
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-300 shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/30 border border-blue-500/40 rounded-xl text-blue-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Attorney Profile &amp; Signature Settings</h3>
              <p className="text-xs text-slate-400">
                Global credentials automatically appended to header/footer &amp; court-ready pleadings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saved Success Notification */}
        {isSavedSuccess && (
          <div className="bg-emerald-600 text-white text-xs py-2 px-6 font-semibold flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Attorney Profile &amp; Signature updated and saved globally!
          </div>
        )}

        {/* Modal Content Form */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs max-h-[78vh]">
          {/* SECTION 1: COUNSEL CREDENTIALS */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-slate-900 font-bold border-b border-slate-200 pb-2">
              <User className="w-4 h-4 text-blue-700" />
              <span className="text-xs uppercase tracking-wider">Law Office &amp; Counsel Information</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Attorney Full Name</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={attorney.attorneyName}
                    onChange={(e) => setAttorney({ ...attorney, attorneyName: e.target.value })}
                    placeholder="e.g. Elena Rostova, Esq."
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">BBO / Bar Number</label>
                <div className="relative">
                  <Award className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={attorney.bboNumber}
                    onChange={(e) => setAttorney({ ...attorney, bboNumber: e.target.value })}
                    placeholder="e.g. BBO #689123"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Law Firm / Practice Name</label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={attorney.firmName}
                  onChange={(e) => setAttorney({ ...attorney, firmName: e.target.value })}
                  placeholder="e.g. ARC Investigations & Defense Counsel, P.C."
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Office Street Address</label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={attorney.address}
                  onChange={(e) => setAttorney({ ...attorney, address: e.target.value })}
                  placeholder="e.g. 100 Cambridge Street, Suite 1400, Boston, MA 02114"
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Telephone Number</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={attorney.phone}
                    onChange={(e) => setAttorney({ ...attorney, phone: e.target.value })}
                    placeholder="e.g. (617) 555-0199"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={attorney.email}
                    onChange={(e) => setAttorney({ ...attorney, email: e.target.value })}
                    placeholder="e.g. erostova@arcinvestigations.com"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: ATTORNEY SIGNATURE CAPTURE / UPLOAD */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center space-x-2 text-slate-900 font-bold">
                <PenTool className="w-4 h-4 text-blue-700" />
                <span className="text-xs uppercase tracking-wider">Court Motion Signature Capture</span>
              </div>
              <span className="text-[10px] text-slate-500">Appended to all court pleadings</span>
            </div>

            {/* Signature Input Mode Selection Tabs */}
            <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveSigTab('draw')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                  activeSigTab === 'draw'
                    ? 'bg-white text-blue-900 shadow-2xs font-bold border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PenTool className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                Draw Digital Signature
              </button>

              <button
                type="button"
                onClick={() => setActiveSigTab('upload')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                  activeSigTab === 'upload'
                    ? 'bg-white text-blue-900 shadow-2xs font-bold border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                Upload Image File
              </button>
            </div>

            {/* TAB 1: DRAW ON CANVAS */}
            {activeSigTab === 'draw' && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center text-slate-700">
                  <span className="text-[11px] font-medium">Use mouse or touchscreen to draw signature below:</span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="text-[10px] text-slate-600 hover:text-red-700 font-semibold px-2 py-1 bg-white border border-slate-300 rounded flex items-center"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Clear Box
                    </button>
                    <button
                      type="button"
                      onClick={generateSampleCursiveSignature}
                      className="text-[10px] text-blue-700 hover:text-blue-900 font-semibold px-2 py-1 bg-blue-50 border border-blue-200 rounded flex items-center"
                      title="Insert sample cursive attorney signature"
                    >
                      <Sparkles className="w-3 h-3 mr-1 text-blue-600" />
                      Auto-Sample
                    </button>
                  </div>
                </div>

                <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl overflow-hidden relative shadow-inner">
                  <canvas
                    ref={canvasRef}
                    width={540}
                    height={130}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-28 cursor-crosshair touch-none"
                  />
                  <div className="absolute bottom-2 left-4 right-4 border-b border-slate-200 pointer-events-none flex justify-between text-[9px] font-mono text-slate-400">
                    <span>X________________________________________________________</span>
                    <span>Attorney Signature Line</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={adoptCanvasSignature}
                  disabled={!hasDrawn}
                  className={`w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                    hasDrawn
                      ? 'bg-blue-700 hover:bg-blue-800 text-white shadow-xs'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Adopt Drawn Signature
                </button>
              </div>
            )}

            {/* TAB 2: FILE UPLOAD */}
            {activeSigTab === 'upload' && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <p className="text-[11px] text-slate-600">
                  Upload a scanned or saved image of your signature (PNG with transparent background recommended, JPG, or SVG).
                </p>

                <div className="relative border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-100 transition-colors cursor-pointer bg-white">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/svg+xml"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <ImageIcon className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <span className="font-bold text-slate-800 block text-xs">
                    Click to browse or drag signature image here
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Supports PNG, JPG, or SVG files up to 5MB
                  </span>
                </div>
              </div>
            )}

            {/* ACTIVE SIGNATURE PREVIEW & REMOVE BLOCK */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">
                  Active Signature Preview on Pleading
                </span>
                {attorney.signatureDataUrl && (
                  <button
                    type="button"
                    onClick={removeSignature}
                    className="text-[10px] text-red-400 hover:text-red-300 font-semibold flex items-center"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Remove Signature
                  </button>
                )}
              </div>

              <div className="bg-white rounded-lg p-3 text-slate-900 font-serif flex flex-col items-start border border-slate-200 min-h-[90px] justify-center">
                {attorney.signatureDataUrl ? (
                  <div className="space-y-1">
                    <img
                      src={attorney.signatureDataUrl}
                      alt="Attorney Signature"
                      className="max-h-16 max-w-xs object-contain"
                    />
                    <div className="border-t border-slate-800 w-64 pt-1 font-sans text-[11px]">
                      <span className="font-bold block text-slate-900">{attorney.attorneyName}</span>
                      <span className="text-slate-600 font-mono text-[10px] block">{attorney.bboNumber}</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full text-center py-2 text-slate-400 font-sans italic text-xs">
                    No signature attached. (A typed "/s/ {attorney.attorneyName}" will be printed if omitted).
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors text-xs"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg transition-all text-xs shadow-md flex items-center"
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            Save Profile &amp; Signature
          </button>
        </div>
      </div>
    </div>
  );
};
