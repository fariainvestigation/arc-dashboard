import React, { useState, useEffect } from 'react';
import { Users, MessageSquare, Pin, CheckCircle2, Bot, Send, AlertCircle, RefreshCw } from 'lucide-react';
import { CaseData, WorkspaceNote } from '../types';
import { chatDefenseAssistantWithAI } from '../lib/geminiService';

interface CollaborativeWorkspaceProps {
  currentCase: CaseData;
  onUpdateCase: (updatedCase: CaseData) => void;
}

export const CollaborativeWorkspace: React.FC<CollaborativeWorkspaceProps> = ({
  currentCase,
  onUpdateCase
}) => {
  const [notes, setNotes] = useState<WorkspaceNote[]>(() => {
    const key = `arc_oui_v1::${currentCase.id}::notes`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return currentCase.notes || [];
  });

  const [newNoteText, setNewNoteText] = useState('');
  const [selectedRole, setSelectedRole] = useState<'Lead Attorney' | 'Associate' | 'Investigator' | 'Paralegal'>('Lead Attorney');
  const [filterResolved, setFilterResolved] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ACTIVE');

  // Pin picker state
  const [selectedDocId, setSelectedDocId] = useState<string>(currentCase.documents[0]?.id || '');
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);
  const [selectedParaNum, setSelectedParaNum] = useState<number>(1);
  const [attachPin, setAttachPin] = useState<boolean>(false);

  // Chat Assistant State
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>>([
    {
      role: 'model',
      parts: [
        {
          text: 'Welcome counsel. I am your Massachusetts Legal Defense Assistant. Ask me any tactical question regarding M.G.L. c. 90 § 24, 501 CMR regulations, or Supreme Judicial Court precedent. All legal assertions are strictly tied to our verified Massachusetts Authority table.'
        }
      ]
    }
  ]);

  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Persist notes
  useEffect(() => {
    const key = `arc_oui_v1::${currentCase.id}::notes`;
    localStorage.setItem(key, JSON.stringify(notes));
  }, [notes, currentCase.id]);

  const handleAddNote = () => {
    if (!newNoteText.trim()) return;

    let pinnedRef = undefined;
    if (attachPin) {
      const targetDoc = currentCase.documents.find((d) => d.id === selectedDocId);
      const targetPage = targetDoc?.pages?.find((p) => p.pageNumber === selectedPageNum);
      const targetPara = targetPage?.paragraphs.find((p) => p.paragraphNumber === selectedParaNum);

      if (targetDoc) {
        pinnedRef = {
          documentId: targetDoc.id,
          documentName: targetDoc.name,
          pageNumber: selectedPageNum,
          paragraphNumber: selectedParaNum,
          quoteSnippet: targetPara?.text.slice(0, 80) || 'Pinned discovery reference'
        };
      }
    }

    const note: WorkspaceNote = {
      id: `note_${Date.now()}`,
      authorRole: selectedRole,
      content: newNoteText,
      timestamp: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      resolved: false,
      pinnedRef
    };

    const updated = [note, ...notes];
    setNotes(updated);
    setNewNoteText('');
    setAttachPin(false);
  };

  const handleToggleResolve = (noteId: string) => {
    const updated = notes.map((n) => (n.id === noteId ? { ...n, resolved: !n.resolved } : n));
    setNotes(updated);
  };

  // AI Chat Assistant Send
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatError(null);

    const updatedHistory = [
      ...chatMessages,
      { role: 'user' as const, parts: [{ text: userMessage }] }
    ];

    setChatMessages(updatedHistory);
    setChatLoading(true);

    try {
      const reply = await chatDefenseAssistantWithAI(userMessage, chatMessages);
      setChatMessages([
        ...updatedHistory,
        { role: 'model' as const, parts: [{ text: reply }] }
      ]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Chat request failed';
      setChatError(errorMsg);
    } finally {
      setChatLoading(false);
    }
  };

  const filteredNotes = notes.filter((n) => {
    if (filterResolved === 'ACTIVE') return !n.resolved;
    if (filterResolved === 'RESOLVED') return n.resolved;
    return true;
  });

  const selectedDocObj = currentCase.documents.find((d) => d.id === selectedDocId) || currentCase.documents[0];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-700" />
            <h3 className="text-lg font-bold text-slate-900">Collaborative Defense Workspace</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Team task feed, page/paragraph discovery pinning, and AI Legal Defense Assistant.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Team Notes & Task Feed */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Defense Team Notes & Tasks ({filteredNotes.length})
              </h4>

              <div className="flex items-center space-x-1 bg-white p-1 rounded-md border border-slate-200 text-xs">
                <button
                  onClick={() => setFilterResolved('ACTIVE')}
                  className={`px-2 py-0.5 rounded-xs ${filterResolved === 'ACTIVE' ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-600'}`}
                >
                  Active
                </button>
                <button
                  onClick={() => setFilterResolved('RESOLVED')}
                  className={`px-2 py-0.5 rounded-xs ${filterResolved === 'RESOLVED' ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-600'}`}
                >
                  Resolved
                </button>
                <button
                  onClick={() => setFilterResolved('ALL')}
                  className={`px-2 py-0.5 rounded-xs ${filterResolved === 'ALL' ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-600'}`}
                >
                  All
                </button>
              </div>
            </div>

            {/* Note Input Box */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                  className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-800"
                >
                  <option value="Lead Attorney">Lead Attorney</option>
                  <option value="Associate">Associate</option>
                  <option value="Investigator">Investigator</option>
                  <option value="Paralegal">Paralegal</option>
                </select>

                <label className="text-xs text-slate-600 flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachPin}
                    onChange={(e) => setAttachPin(e.target.checked)}
                    className="rounded-xs border-slate-300 text-blue-600"
                  />
                  <Pin className="w-3.5 h-3.5 text-blue-700" />
                  <span>Pin Discovery Ref</span>
                </label>
              </div>

              {/* Pin Picker dropdowns if attachPin checked */}
              {attachPin && selectedDocObj && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-md grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-500 block">Doc</label>
                    <select
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      className="w-full text-xs border rounded-xs bg-white p-1"
                    >
                      {currentCase.documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name.slice(0, 15)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 block">Page</label>
                    <select
                      value={selectedPageNum}
                      onChange={(e) => setSelectedPageNum(Number(e.target.value))}
                      className="w-full text-xs border rounded-xs bg-white p-1"
                    >
                      {(selectedDocObj.pages || [{ pageNumber: 1, paragraphs: [] }]).map((p) => (
                        <option key={p.pageNumber} value={p.pageNumber}>
                          Page {p.pageNumber}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 block">Paragraph</label>
                    <select
                      value={selectedParaNum}
                      onChange={(e) => setSelectedParaNum(Number(e.target.value))}
                      className="w-full text-xs border rounded-xs bg-white p-1"
                    >
                      {(
                        selectedDocObj.pages?.find((p) => p.pageNumber === selectedPageNum)?.paragraphs || [
                          { paragraphNumber: 1, text: '' }
                        ]
                      ).map((pr) => (
                        <option key={pr.paragraphNumber} value={pr.paragraphNumber}>
                          ¶ {pr.paragraphNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <textarea
                rows={2}
                placeholder="Type team defense directive, investigation task, or legal motion note..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                className="w-full text-xs p-2 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
              />

              <div className="flex justify-end">
                <button
                  onClick={handleAddNote}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                >
                  Post Defense Note
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className={`p-3 rounded-lg border transition-all ${
                    note.resolved ? 'bg-slate-100 opacity-60 border-slate-200' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md border">
                      {note.authorRole}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-slate-400">{note.timestamp}</span>
                      <button
                        onClick={() => handleToggleResolve(note.id)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                          note.resolved ? 'bg-slate-200 text-slate-600' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {note.resolved ? 'Resolved' : 'Mark Resolved'}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-800 leading-relaxed mb-2">{note.content}</p>

                  {note.pinnedRef && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-[11px] text-blue-900 font-mono">
                      <span className="font-bold flex items-center mb-0.5">
                        <Pin className="w-3 h-3 mr-1 text-blue-700" />
                        Pinned: {note.pinnedRef.documentName} (p. {note.pinnedRef.pageNumber}, ¶ {note.pinnedRef.paragraphNumber})
                      </span>
                      &ldquo;{note.pinnedRef.quoteSnippet}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: AI Legal Defense Assistant */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Bot className="w-4 h-4 text-purple-700" />
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                AI Defense Assistant (MA Legal Table Constrained)
              </h4>
            </div>

            {/* Chat Feed */}
            <div className="max-h-72 overflow-y-auto space-y-3 bg-white border border-slate-200 rounded-lg p-3 mb-3 text-xs">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-50 text-blue-900 ml-6 border border-blue-200'
                      : 'bg-slate-50 text-slate-800 mr-6 border border-slate-200'
                  }`}
                >
                  <span className="text-[10px] font-bold block mb-1 uppercase tracking-wider text-slate-400">
                    {msg.role === 'user' ? 'Counsel' : 'AI Assistant'}
                  </span>
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.parts[0].text}</p>
                </div>
              ))}

              {chatLoading && (
                <div className="text-center py-2 text-slate-500 text-xs italic flex items-center justify-center">
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin text-purple-700" />
                  Researching Massachusetts legal authority table...
                </div>
              )}
            </div>

            {chatError && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-center justify-between">
                <span>{chatError}</span>
                <button onClick={handleSendChat} className="font-bold underline text-xs">
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Ask about M.G.L. c. 90 § 24, 501 CMR 2.13, or Gerhardt limits..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              disabled={chatLoading}
              className="flex-1 text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 bg-white"
            />
            <button
              onClick={handleSendChat}
              disabled={chatLoading || !chatInput.trim()}
              className="p-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
