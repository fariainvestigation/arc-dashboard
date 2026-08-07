// Export engine: compile motion sections into HTML, DOCX (docx), PDF (pdfkit),
// exhibit packets, filing ZIPs, and full-case backups. Times New Roman 12pt court format.
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber } from 'docx';
import { db, EXPORT_DIR, CASES_DIR, uuid, now } from '../db.mjs';

export const PLACEHOLDER_RE = /\[[A-Z][A-Z0-9 ._\/-]{2,}\]/g;

export function findPlaceholders(text) {
  return [...new Set((text.match(PLACEHOLDER_RE) || []))];
}

const SECTION_ORDER = ['caption', 'title', 'introduction', 'procedural_history', 'facts', 'legal_standard',
  'argument', 'irac', 'relief', 'conclusion', 'signature', 'certificate', 'affidavit', 'proposed_order', 'exhibit_index'];

export function loadMotionBundle(motionId) {
  const motion = db.prepare('SELECT * FROM motions WHERE id=?').get(motionId);
  if (!motion) return null;
  const caseRow = db.prepare('SELECT * FROM cases WHERE id=?').get(motion.case_id);
  const charges = db.prepare('SELECT * FROM charges WHERE case_id=? ORDER BY sort_order').all(motion.case_id);
  const profile = caseRow.attorney_profile_id
    ? db.prepare('SELECT * FROM attorney_profiles WHERE id=?').get(caseRow.attorney_profile_id)
    : db.prepare('SELECT * FROM attorney_profiles WHERE is_default=1').get();
  const sections = db.prepare('SELECT * FROM motion_sections WHERE motion_id=? ORDER BY sort_order').all(motionId);
  const exhibits = db.prepare('SELECT * FROM exhibits WHERE motion_id=? ORDER BY number_value').all(motionId);
  return { motion, caseRow, charges, profile, sections, exhibits };
}

export function caseCaption({ caseRow, charges }) {
  const court = [caseRow.court_department, caseRow.court_division].filter(Boolean).join(', ') || '[COURT]';
  return [
    'COMMONWEALTH OF MASSACHUSETTS',
    `${(caseRow.county || '[COUNTY]').toUpperCase()}, ss.`,
    court.toUpperCase(),
    `DOCKET NO. ${caseRow.docket_number || '[DOCKET NUMBER]'}`,
    '',
    'COMMONWEALTH',
    'v.',
    (caseRow.client_name || '[CLIENT NAME]').toUpperCase(),
  ].join('\n');
}

export function signatureBlock(profile, caseRow) {
  if (profile && profile.signature_block) return profile.signature_block; // used exactly as saved
  if (!profile) return '[ATTORNEY SIGNATURE]';
  return ['Respectfully submitted,', (caseRow?.client_name || '[CLIENT NAME]'), 'By ' + (caseRow?.client_pronouns === 'her' ? 'her' : caseRow?.client_pronouns === 'their' ? 'their' : 'his') + ' attorney,', '',
    '/s/ ' + profile.name, profile.name, 'BBO No. ' + (profile.bbo || '[BBO]'),
    profile.firm, profile.address, [profile.city, profile.state, profile.zip].filter(Boolean).join(', '),
    profile.phone, profile.email].filter(s => s !== undefined && s !== null).join('\n');
}

export function certificateOfService(profile) {
  if (profile && profile.cert_service_language) return profile.cert_service_language;
  return 'I, [ATTORNEY NAME], hereby certify that on [DATE] I served a true copy of the foregoing on the Commonwealth by [METHOD OF SERVICE].\n\n/s/ [ATTORNEY NAME]';
}

// Compile a motion into an ordered list of { heading, body } blocks (plain text bodies).
export function compileMotion(bundle) {
  const { motion, sections, caseRow, charges, profile, exhibits } = bundle;
  const blocks = [];
  const byType = {};
  for (const s of sections) (byType[s.section_type] ||= []).push(s);

  blocks.push({ heading: '', body: byType.caption?.[0]?.body || caseCaption(bundle), type: 'caption' });
  blocks.push({ heading: '', body: (byType.title?.[0]?.body || motion.title).toUpperCase(), type: 'title' });

  const named = {
    introduction: 'INTRODUCTION', procedural_history: 'PROCEDURAL HISTORY', facts: 'STATEMENT OF FACTS',
    legal_standard: 'LEGAL STANDARD', argument: 'ARGUMENT', relief: 'REQUESTED RELIEF', conclusion: 'CONCLUSION',
  };
  for (const t of SECTION_ORDER) {
    if (['caption', 'title', 'signature', 'certificate', 'affidavit', 'proposed_order', 'exhibit_index', 'irac'].includes(t)) continue;
    for (const s of byType[t] || []) blocks.push({ heading: s.heading || named[t] || t.toUpperCase(), body: s.body, type: t });
  }
  for (const s of byType.irac || []) blocks.push({ heading: s.heading || 'ARGUMENT (IRAC)', body: s.body, type: 'irac' });

  blocks.push({ heading: '', body: byType.signature?.[0]?.body || signatureBlock(profile, caseRow), type: 'signature' });
  blocks.push({ heading: 'CERTIFICATE OF SERVICE', body: byType.certificate?.[0]?.body || certificateOfService(profile), type: 'certificate' });
  for (const s of byType.affidavit || []) blocks.push({ heading: s.heading || 'AFFIDAVIT', body: s.body, type: 'affidavit', pageBreak: true });
  for (const s of byType.proposed_order || []) blocks.push({ heading: s.heading || 'PROPOSED ORDER', body: s.body, type: 'proposed_order', pageBreak: true });
  if (exhibits.length) {
    const idx = exhibits.map(e => `${exhibitLabel(e)} - ${e.title || e.description || '[EXHIBIT DESCRIPTION]'}${e.bates ? ` (Bates ${e.bates})` : ''}`).join('\n');
    blocks.push({ heading: 'EXHIBIT INDEX', body: byType.exhibit_index?.[0]?.body || idx, type: 'exhibit_index', pageBreak: true });
  }
  return blocks;
}

export function exhibitLabel(e) {
  const n = e.number_value || 1;
  if (e.label) return e.label;
  if (e.numbering_scheme === 'alpha') return 'Exhibit ' + String.fromCharCode(64 + n);
  if (e.numbering_scheme === 'defendant_alpha') return "Defendant's Exhibit " + String.fromCharCode(64 + n);
  if (e.numbering_scheme === 'motion_numeric') return 'Motion Exhibit ' + n;
  return 'Exhibit ' + n;
}

// ---- HTML -------------------------------------------------------------------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function motionHtml(bundle) {
  const blocks = compileMotion(bundle);
  const body = blocks.map(b => {
    const cls = b.type === 'caption' ? 'caption' : b.type === 'title' ? 'mtitle' : 'sec';
    return `${b.pageBreak ? '<div class="pb"></div>' : ''}<section class="${cls}">${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}<div class="body">${esc(b.body).replace(/\n/g, '<br>')}</div></section>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(bundle.motion.title)}</title><style>
@page{size:8.5in 11in;margin:1in}body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#000;max-width:6.5in;margin:1in auto;line-height:1.5}
.caption .body{white-space:pre-line;text-align:left}.mtitle .body{text-align:center;font-weight:bold;text-decoration:underline;margin:18pt 0}
h2{font-size:12pt;text-align:center;text-decoration:underline;margin:14pt 0 6pt}.sec .body{text-align:justify;white-space:pre-wrap}
.pb{page-break-before:always}@media print{body{margin:0;max-width:none}}</style></head><body>${body}</body></html>`;
}

// ---- DOCX -------------------------------------------------------------------
export async function motionDocx(bundle, outPath) {
  const blocks = compileMotion(bundle);
  const children = [];
  for (const b of blocks) {
    if (b.pageBreak) children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    if (b.heading) children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: b.heading, bold: true, underline: {}, font: 'Times New Roman', size: 24 })],
    }));
    const align = b.type === 'title' ? AlignmentType.CENTER : b.type === 'caption' || b.type === 'signature' ? AlignmentType.LEFT : AlignmentType.BOTH;
    for (const line of String(b.body || '').split(/\n{2,}/)) {
      children.push(new Paragraph({
        alignment: align, spacing: { after: 200, line: 360 },
        children: line.split('\n').flatMap((seg, i) => {
          const run = new TextRun({ text: seg, font: 'Times New Roman', size: 24, bold: b.type === 'title', underline: b.type === 'title' ? {} : undefined });
          return i === 0 ? [run] : [new TextRun({ break: 1 }), run];
        }),
      }));
    }
  }
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 20 })] })] }) },
      children,
    }],
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buf);
  return outPath;
}

// ---- PDF --------------------------------------------------------------------
function pdfWriteBlocks(doc, blocks) {
  for (const b of blocks) {
    if (b.pageBreak) doc.addPage();
    if (b.heading) {
      doc.moveDown(0.8).font('Times-Bold').fontSize(12).text(b.heading, { align: 'center', underline: true }).moveDown(0.4);
    }
    const align = b.type === 'title' ? 'center' : b.type === 'caption' || b.type === 'signature' ? 'left' : 'justify';
    doc.font(b.type === 'title' ? 'Times-Bold' : 'Times-Roman').fontSize(12)
      .text(String(b.body || ''), { align, underline: b.type === 'title', lineGap: 4 }).moveDown(0.6);
  }
}
function pdfPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Times-Roman').fontSize(10).text(String(i + 1), 0, doc.page.height - 60, { align: 'center', width: doc.page.width });
  }
}
export function motionPdf(bundle, outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 }, bufferPages: true });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    pdfWriteBlocks(doc, compileMotion(bundle));
    pdfPageNumbers(doc);
    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

// ---- Exhibit packet (cover pages + images) ---------------------------------
export function exhibitPacketPdf(bundle, outPath) {
  const { caseRow, motion, exhibits, profile } = bundle;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 }, bufferPages: true });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    // index page
    doc.font('Times-Bold').fontSize(12).text('EXHIBIT INDEX', { align: 'center', underline: true }).moveDown();
    doc.font('Times-Roman').fontSize(12).text(caseCaption(bundle)).moveDown();
    for (const e of exhibits) doc.text(`${exhibitLabel(e)} - ${e.title || e.description || '[EXHIBIT DESCRIPTION]'}${e.bates ? ` (Bates ${e.bates})` : ''}`, { lineGap: 3 });
    for (const e of exhibits) {
      doc.addPage();
      doc.font('Times-Roman').fontSize(12).text(caseCaption(bundle)).moveDown(2);
      doc.font('Times-Bold').fontSize(16).text(exhibitLabel(e).toUpperCase(), { align: 'center' }).moveDown();
      doc.font('Times-Roman').fontSize(12);
      const rows = [['Motion', motion.title], ['Description', e.title || e.description || '[EXHIBIT DESCRIPTION]'],
        ['Source', e.source_person || ''], ['Date', e.exhibit_date || ''], ['Bates', e.bates || '']];
      for (const [k, v] of rows) if (v) doc.text(`${k}: ${v}`);
      if (e.confidential) doc.moveDown().font('Times-Bold').text('CONFIDENTIAL - SUBJECT TO PROTECTIVE ORDER', { align: 'center' });
      if (profile) doc.moveDown(2).font('Times-Roman').text(signatureBlock(profile, caseRow));
      // exhibit content: embed image if we have one
      const filePath = e.file_path && fs.existsSync(e.file_path) ? e.file_path : null;
      if (filePath && /\.(png|jpe?g)$/i.test(filePath)) {
        doc.addPage();
        try { doc.image(filePath, { fit: [468, 620], align: 'center', valign: 'center' }); }
        catch { doc.text('[IMAGE COULD NOT BE EMBEDDED - attach original file]'); }
      } else if (filePath) {
        doc.addPage().text(`[ATTACH ORIGINAL FILE: ${path.basename(filePath)} - non-image exhibit files are included in the filing ZIP]`);
      }
    }
    pdfPageNumbers(doc);
    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

// ---- Filing packet checks ---------------------------------------------------
export function packetChecks(bundle) {
  const { motion, caseRow, profile, exhibits } = bundle;
  const blocks = compileMotion(bundle);
  const fullText = blocks.map(b => `${b.heading}\n${b.body}`).join('\n');
  const issues = [];
  const warn = (level, msg) => issues.push({ level, msg });
  const ph = findPlaceholders(fullText);
  if (ph.length) warn('error', `Unresolved placeholders: ${ph.join(', ')}`);
  if (!caseRow.docket_number) warn('error', 'Case has no docket number.');
  if (!caseRow.client_name) warn('error', 'Case has no client name.');
  if (!profile) warn('error', 'No attorney profile assigned; signature block will contain a placeholder.');
  const facts = db.prepare("SELECT COUNT(*) c FROM facts WHERE case_id=? AND verification!='verified'").get(motion.case_id).c;
  if (facts) warn('warning', `${facts} fact(s) in this case remain unverified.`);
  const unverifiedAuth = db.prepare("SELECT COUNT(*) c FROM authorities WHERE case_id=? AND attorney_verified=0").get(motion.case_id).c;
  if (unverifiedAuth) warn('warning', `${unverifiedAuth} research authorit(ies) not attorney-verified.`);
  const conflicts = db.prepare("SELECT COUNT(*) c FROM fact_conflicts WHERE case_id=? AND status IN ('unresolved','material')").get(motion.case_id).c;
  if (conflicts) warn('warning', `${conflicts} unresolved or material fact conflict(s).`);
  for (const e of exhibits) {
    if (!fullText.includes(exhibitLabel(e))) warn('warning', `${exhibitLabel(e)} is attached but never referenced in the motion text.`);
    if (e.file_path && !fs.existsSync(e.file_path)) warn('error', `${exhibitLabel(e)} file is missing on disk.`);
  }
  if (/Rule 9A/i.test(fullText)) warn('warning', 'Motion text references civil Rule 9A. Verify this is intentional; Rule 9A civil procedure does not automatically govern criminal motions.');
  if (motion.status !== 'Approved for Filing') warn('warning', `Motion status is "${motion.status}" - not yet Approved for Filing.`);
  return issues;
}

// ---- Filing ZIP -------------------------------------------------------------
export async function filingZip(bundle, includePrivileged = false) {
  const { motion, caseRow } = bundle;
  const stamp = now().replace(/[:.]/g, '-');
  const base = `${(caseRow.client_name || 'case').replace(/[^A-Za-z0-9]+/g, '_')}_${(motion.title).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60)}_${stamp}`;
  const dir = path.join(EXPORT_DIR, base);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'motion.html'), motionHtml(bundle));
  await motionDocx(bundle, path.join(dir, 'motion.docx'));
  await motionPdf(bundle, path.join(dir, 'motion.pdf'));
  if (bundle.exhibits.length) {
    await exhibitPacketPdf(bundle, path.join(dir, 'exhibit_packet.pdf'));
    for (const e of bundle.exhibits) {
      if (e.file_path && fs.existsSync(e.file_path)) {
        fs.copyFileSync(e.file_path, path.join(dir, `${exhibitLabel(e).replace(/[^A-Za-z0-9]+/g, '_')}${path.extname(e.file_path)}`));
      }
    }
  }
  const zipPath = path.join(EXPORT_DIR, base + '.zip');
  await zipDir(dir, zipPath);
  return zipPath;
}

export function zipDir(dir, zipPath, extraJson = null) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    const arch = archiver('zip', { zlib: { level: 9 } });
    out.on('close', () => resolve(zipPath));
    arch.on('error', reject);
    arch.pipe(out);
    arch.directory(dir, false);
    if (extraJson) arch.append(JSON.stringify(extraJson, null, 1), { name: 'case_backup.json' });
    arch.finalize();
  });
}

// ---- Full case backup -------------------------------------------------------
const CASE_TABLES = ['cases', 'charges', 'documents', 'people', 'facts', 'fact_conflicts', 'motions',
  'irac_blocks', 'authorities', 'exhibits', 'images', 'timeline_events'];
export async function caseBackup(caseId, backupDir) {
  const dump = { version: 1, exported_at: now(), tables: {} };
  for (const t of CASE_TABLES) {
    const col = t === 'cases' ? 'id' : 'case_id';
    dump.tables[t] = db.prepare(`SELECT * FROM ${t} WHERE ${col}=?`).all(caseId);
  }
  dump.tables.motion_sections = db.prepare('SELECT s.* FROM motion_sections s JOIN motions m ON s.motion_id=m.id WHERE m.case_id=?').all(caseId);
  dump.tables.motion_versions = db.prepare('SELECT v.* FROM motion_versions v JOIN motions m ON v.motion_id=m.id WHERE m.case_id=?').all(caseId);
  // audit history for the case (kept in backup, never in filing exports)
  dump.tables.audit_log = db.prepare('SELECT * FROM audit_log WHERE case_id=?').all(caseId);
  const caseDir = path.join(CASES_DIR, caseId);
  const zipPath = path.join(backupDir, `case_backup_${caseId}_${now().replace(/[:.]/g, '-')}.zip`);
  fs.mkdirSync(caseDir, { recursive: true });
  await zipDir(caseDir, zipPath, dump);
  return zipPath;
}
