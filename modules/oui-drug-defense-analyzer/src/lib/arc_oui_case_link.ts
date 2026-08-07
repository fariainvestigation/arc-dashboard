/**
 * arc_oui_case_link.ts - puts the OUI & Drug Defense Analyzer on the shared
 * ARC case bus.
 *
 * The app currently keeps its own case list under `arc_oui_v1::case_list` and
 * never reads the shared context, so its tabs only autofill from cases created
 * inside it. This adapter subscribes to the same five channels every other ARC
 * module uses, and contributes back anything the app learns.
 *
 * Usage in App.tsx:
 *
 *   const shared = useSharedCase();
 *   useEffect(() => {
 *     if (shared) mergeIntoCase(shared);      // fill blanks only
 *   }, [shared]);
 *
 * Nothing here overwrites work in the app. `mergeIntoCase` fills empty fields
 * and leaves everything else alone; the shared ledger records disagreements.
 */

const CONTEXT_KEY = 'arc_unified_case_context_v1';

export interface SharedCase {
  caseId: string;
  matter?: string;
  caseName?: string;
  docket?: string;
  court?: string;
  county?: string;
  clientName?: string;
  subjectName?: string;
  charges?: string;
  attorney?: string;
  attorneyFirm?: string;
  investigator?: string;
  status?: string;
  incidentDate?: string;
  notes?: string;
}

declare global {
  interface Window {
    ARCLink?: {
      contribute: (caseId: string, fields: Record<string, unknown>, opts: { source: string; tier: string }) => unknown[];
      get: (caseId: string) => SharedCase;
      missing: (caseId: string) => string[];
    };
  }
}

function readContext(): SharedCase | null {
  try {
    const raw = localStorage.getItem(CONTEXT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && c.caseId ? (c as SharedCase) : null;
  } catch {
    return null;
  }
}

/** Subscribes to every channel the Case Dashboard publishes on. */
export function subscribeToSharedCase(onCase: (c: SharedCase) => void): () => void {
  const emit = () => {
    const c = readContext();
    if (c) onCase(c);
  };

  const onContext = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && detail.caseId) onCase(detail as SharedCase);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONTEXT_KEY) emit();
  };
  const onMessage = (e: MessageEvent) => {
    const d = e.data;
    if (d && d.type === 'ARC_ACTIVE_CASE' && d.context && d.context.caseId) {
      onCase(d.context as SharedCase);
    }
  };

  document.addEventListener('arc:case-context', onContext);
  document.addEventListener('arc:case-enriched', onContext);
  document.addEventListener('arc:shared-storage', emit);
  window.addEventListener('storage', onStorage);
  window.addEventListener('message', onMessage);

  emit(); // seed from whatever is already active

  return () => {
    document.removeEventListener('arc:case-context', onContext);
    document.removeEventListener('arc:case-enriched', onContext);
    document.removeEventListener('arc:shared-storage', emit);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('message', onMessage);
  };
}

/** Sends back what this app learned. Fills blanks elsewhere; never overwrites. */
export function contributeFromOui(caseId: string, fields: Record<string, unknown>): void {
  if (!window.ARCLink || !caseId) return;
  try {
    window.ARCLink.contribute(caseId, fields, { source: 'oui-analyzer', tier: 'entered' });
  } catch {
    /* the app must keep working with or without the link layer */
  }
}

/** Fields the shared record still needs, for a "what is missing" prompt. */
export function missingFields(caseId: string): string[] {
  if (!window.ARCLink || !caseId) return [];
  try {
    return window.ARCLink.missing(caseId);
  } catch {
    return [];
  }
}

/**
 * Fill-blanks-only merge. `target` wins wherever it already has a value, which
 * is what keeps a shared broadcast from disturbing analysis in progress.
 */
export function mergeIntoCase<T extends Record<string, any>>(target: T, shared: SharedCase): T {
  const map: Record<string, keyof SharedCase> = {
    caseNumber: 'docket',
    docket: 'docket',
    clientName: 'clientName',
    defendantName: 'clientName',
    court: 'court',
    county: 'county',
    attorney: 'attorney',
    attorneyFirm: 'attorneyFirm',
    investigator: 'investigator',
    charges: 'charges',
    incidentDate: 'incidentDate',
    caseName: 'caseName',
    matter: 'matter',
  };

  const out: Record<string, any> = { ...target };
  Object.keys(map).forEach((localKey) => {
    const current = out[localKey];
    if (current !== undefined && String(current).trim() !== '') return; // never overwrite
    const incoming = shared[map[localKey]];
    if (incoming !== undefined && String(incoming).trim() !== '') out[localKey] = incoming;
  });
  out.arcCaseId = target.arcCaseId || shared.caseId;
  return out as T;
}
