import React, { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, Upload, CheckCircle2, Trash2, Tag, Eye, X, Plus, Printer, FileJson, Code2, FileCode } from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { CaseData, ExtractedImage } from '../types';

interface EvidenceGalleryProps {
  currentCase: CaseData;
  onUpdateCase: (updatedCase: CaseData) => void;
}

export const EvidenceGallery: React.FC<EvidenceGalleryProps> = ({ currentCase, onUpdateCase }) => {
  const [images, setImages] = useState<ExtractedImage[]>(currentCase.extractedImages || []);

  useEffect(() => {
    setImages(currentCase.extractedImages || []);
  }, [currentCase.id, currentCase.extractedImages]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [lightboxImage, setLightboxImage] = useState<ExtractedImage | null>(null);

  // New Upload state
  const [newCaption, setNewCaption] = useState('');
  const [newCategory, setNewCategory] = useState<ExtractedImage['category']>('PHOTO_EVIDENCE');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggleReportInclusion = (imageId: string) => {
    const updated = images.map((img) =>
      img.id === imageId ? { ...img, selectedForReport: !img.selectedForReport } : img
    );
    setImages(updated);
    onUpdateCase({ ...currentCase, extractedImages: updated });
  };

  const handleRemoveImage = (imageId: string) => {
    const updated = images.filter((img) => img.id !== imageId);
    setImages(updated);
    onUpdateCase({ ...currentCase, extractedImages: updated });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) return;

        const newImg: ExtractedImage = {
          id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: file.name,
          dataUrl,
          sourceDocumentName: 'Uploaded Discovery Photo',
          caption: newCaption || file.name,
          category: newCategory,
          selectedForReport: true,
          timestamp: new Date().toLocaleDateString()
        };

        const updated = [newImg, ...images];
        setImages(updated);
        onUpdateCase({ ...currentCase, extractedImages: updated });
      };
      reader.readAsDataURL(file);
    });

    setNewCaption('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(images, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `evidence_gallery_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Extracted Photo & Image Evidence Gallery</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 30px; color: #1e293b; background: #f8fafc; }
    h1 { font-size: 20px; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
    .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
    .img-box { background: #0f172a; height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .img-box img { max-height: 100%; max-width: 100%; object-fit: contain; }
    .info { padding: 12px; }
    .caption { font-weight: bold; font-size: 14px; margin-bottom: 4px; }
    .source { font-size: 11px; color: #64748b; font-family: monospace; }
  </style>
</head>
<body>
  <h1>Extracted Photo & Image Evidence Gallery</h1>
  <p>Total Items: <strong>${images.length}</strong> | Selected for Report: <strong>${images.filter((i) => i.selectedForReport).length}</strong></p>
  <div class="grid">
    ${images
      .map(
        (img) => `
      <div class="card">
        <div class="img-box">
          <img src="${img.dataUrl}" alt="${img.caption}" />
        </div>
        <div class="info">
          <div class="caption">${img.caption}</div>
          <div class="source">${img.category} &bull; ${img.sourceDocumentName}</div>
        </div>
      </div>
    `
      )
      .join('')}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evidence_gallery_${Date.now()}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          children: [
            new Paragraph({ text: 'EVIDENCE GALLERY INDEX', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Total Evidence Items: ${images.length}` }),
            new Paragraph({ text: '' }),
            ...images.flatMap((img) => [
              new Paragraph({ text: `[${img.category}] ${img.caption}`, heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ text: `Source Document: ${img.sourceDocumentName}` }),
              new Paragraph({ text: `Timestamp: ${img.timestamp || 'N/A'}` }),
              new Paragraph({ text: '' })
            ])
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evidence_gallery_${Date.now()}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredImages = images.filter((img) => {
    if (selectedCategory === 'ALL') return true;
    return img.category === selectedCategory;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <ImageIcon className="w-5 h-5 text-blue-700" />
            <h3 className="text-lg font-bold text-slate-900">Extracted Photo & Image Evidence Gallery</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Extract, inspect, and select report images (dashcam stills, Draeger ticket scans, lab certificate photos).
          </p>
        </div>

        {/* Upload Button & Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.json,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.bmp,.docx,.txt,image/*"
            multiple
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload File (PDF/JSON/HTML/Pic/DOCX)
          </button>
        </div>
      </div>

      {/* Export & Print Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-6 print:hidden">
        <span className="text-xs font-bold text-slate-700 flex items-center">
          <ImageIcon className="w-4 h-4 mr-1.5 text-blue-700" />
          Evidence Asset Actions & Exports
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
            Print to PDF
          </button>
          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <FileJson className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
            JSON
          </button>
          <button
            onClick={handleExportHtml}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-md border border-slate-300 transition-colors flex items-center shadow-2xs"
          >
            <Code2 className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
            HTML
          </button>
          <button
            onClick={handleExportDocx}
            className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition-colors flex items-center shadow-2xs"
          >
            <FileCode className="w-3.5 h-3.5 mr-1.5" />
            DOCX Index
          </button>
        </div>
      </div>

      {/* Category Filter & Stats */}
      <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedCategory === 'ALL' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
            }`}
          >
            All Images ({images.length})
          </button>
          <button
            onClick={() => setSelectedCategory('PHOTO_EVIDENCE')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedCategory === 'PHOTO_EVIDENCE' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
            }`}
          >
            Evidence Photos
          </button>
          <button
            onClick={() => setSelectedCategory('DOCUMENT_SCAN')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedCategory === 'DOCUMENT_SCAN' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
            }`}
          >
            Ticket / Ticket Scans
          </button>
          <button
            onClick={() => setSelectedCategory('LAB_CERTIFICATE')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedCategory === 'LAB_CERTIFICATE' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
            }`}
          >
            Lab Certificates
          </button>
          <button
            onClick={() => setSelectedCategory('SCENE_PHOTO')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedCategory === 'SCENE_PHOTO' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
            }`}
          >
            Scene Photos
          </button>
        </div>

        <span className="text-xs font-bold text-emerald-700 flex items-center">
          <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
          {images.filter((i) => i.selectedForReport).length} Selected for Final Report
        </span>
      </div>

      {/* Image Grid */}
      {filteredImages.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-slate-500">
          <ImageIcon className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No Image Assets Found</p>
          <p className="text-xs text-slate-500 mt-1">Upload scene photos, booking ticket scans, or lab certificates above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredImages.map((img) => (
            <div
              key={img.id}
              className={`border rounded-xl overflow-hidden transition-all bg-white flex flex-col justify-between ${
                img.selectedForReport ? 'border-blue-500 ring-2 ring-blue-100 shadow-md' : 'border-slate-200'
              }`}
            >
              <div>
                {/* Image Preview Canvas / Frame */}
                <div className="relative bg-slate-900 group h-48 flex items-center justify-center overflow-hidden">
                  <img
                    src={img.dataUrl}
                    alt={img.caption}
                    className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                    onClick={() => setLightboxImage(img)}
                  />

                  {/* Top Category Badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold rounded-md border border-slate-700">
                    {img.category.replace('_', ' ')}
                  </div>

                  {/* Lightbox Zoom Button */}
                  <button
                    onClick={() => setLightboxImage(img)}
                    className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-md transition-colors"
                    title="View Full Size"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>

                {/* Info & Caption Area */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-slate-500 truncate">{img.sourceDocumentName}</span>
                    {img.timestamp && <span className="text-[10px] text-slate-400">{img.timestamp}</span>}
                  </div>

                  <h5 className="text-xs font-bold text-slate-900 mb-2 truncate">{img.name}</h5>

                  {/* Caption Input */}
                  <textarea
                    rows={2}
                    value={img.caption}
                    onChange={(e) => {
                      const updatedCaption = e.target.value;
                      const updated = images.map((i) => (i.id === img.id ? { ...i, caption: updatedCaption } : i));
                      setImages(updated);
                      onUpdateCase({ ...currentCase, extractedImages: updated });
                    }}
                    placeholder="Enter court report caption..."
                    className="w-full text-xs p-2 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 bg-slate-50"
                  />
                </div>
              </div>

              {/* Action Controls */}
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={img.selectedForReport}
                    onChange={() => handleToggleReportInclusion(img.id)}
                    className="rounded-xs border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span>Attach to Final Report</span>
                </label>

                <button
                  onClick={() => handleRemoveImage(img.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Delete Image Asset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold">{lightboxImage.name}</h4>
                <p className="text-xs text-slate-400">{lightboxImage.sourceDocumentName}</p>
              </div>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1 text-slate-400 hover:text-white rounded-md"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 bg-slate-950 flex-1 flex items-center justify-center overflow-auto">
              <img src={lightboxImage.dataUrl} alt={lightboxImage.caption} className="max-h-full max-w-full object-contain" />
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-800">
              <span className="font-bold text-slate-900 block mb-1">Caption / Court Explanation:</span>
              <p>{lightboxImage.caption}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
