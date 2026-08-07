/**
 * arc_motion_render.mjs - court-formatted rendering for filed motions.
 *
 * A filed motion opens directly on the caption. No letterhead, no logo, no firm
 * banner: the document is filed under counsel's signature and BBO number, and a
 * masthead above the caption is not how a Massachusetts filing is presented.
 *
 * Massachusetts Superior Court caption convention: the county and court sit in
 * a right-hand column with the docket number beneath them, the parties run down
 * the left inside a ruled column, and the two are separated by a vertical rule.
 * The signature block puts the party on the left and counsel's signature on the
 * right, which is where a clerk expects to find it.
 *
 * Structured data rides on the caption and signature sections in the existing
 * `sections` JSON, so nothing in the D1 schema changes.
 *
 *   { type: 'caption', meta: { county, court, docket, plaintiff, defendant } }
 *   { type: 'signature', meta: { party, relation, attorney, bbo, firm,
 *                                address, phone, email, dated } }
 *
 * When `meta` is absent the section falls back to its plain `body` text, so
 * existing motions keep rendering exactly as they did.
 */

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const nl = s => esc(s).replace(/\n/g, '<br>');

/* ARC emblem, redrawn flat for print. Exported for the investigation report,
   which is ARC's own work product. A motion filed under counsel's signature
   carries no letterhead at all: Massachusetts filings open on the caption. */
export const ARC_EMBLEM = `<svg viewBox="0 0 64 64" width="34" height="34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M32 4L8 14V30C8 46.5 21.8 58 32 61C42.2 58 56 46.5 56 30V14L32 4Z" fill="#14181c" stroke="#C9A84C" stroke-width="2.5"/>
<path d="M32 16V44" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
<path d="M20 23H44" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
<path d="M20 23L13 34H27L20 23Z" fill="#C9A84C"/>
<path d="M44 23L37 34H51L44 23Z" fill="#C9A84C"/>
<path d="M12 34C12 37.5 15.5 39 20 39C24.5 39 28 37.5 28 34" stroke="#C9A84C" stroke-width="2" stroke-linecap="round" fill="none"/>
<path d="M36 34C36 37.5 39.5 39 44 39C48.5 39 52 37.5 52 34" stroke="#C9A84C" stroke-width="2" stroke-linecap="round" fill="none"/>
<circle cx="32" cy="45" r="3" fill="#C9A84C"/>
</svg>`;

/** Two-column caption: parties left inside a ruled column, court and docket right. */
function captionHtml(meta, fallbackBody) {
  if (!meta) return `<section class="caption plain">${nl(fallbackBody)}</section>`;
  const rows = [];
  if (meta.plaintiff) rows.push(`<div class="party">${esc(meta.plaintiff)}</div>`);
  rows.push('<div class="party-v">v.</div>');
  if (meta.defendant) rows.push(`<div class="party">${esc(meta.defendant)}</div>`);

  return `<section class="caption">
  <div class="cap-court">${esc(meta.commonwealth || 'COMMONWEALTH OF MASSACHUSETTS')}</div>
  <table class="cap-grid"><tr>
    <td class="cap-left">${rows.join('')}</td>
    <td class="cap-rule"></td>
    <td class="cap-right">
      ${meta.county ? `<div>${esc(meta.county)}, ss.</div>` : ''}
      ${meta.court ? `<div class="cap-forum">${esc(meta.court)}</div>` : ''}
      ${meta.division ? `<div>${esc(meta.division)}</div>` : ''}
      ${meta.docket ? `<div class="cap-docket">DOCKET NO. ${esc(meta.docket)}</div>` : ''}
    </td>
  </tr></table>
</section>`;
}

/** Party on the left, counsel's signature on the right. */
function signatureHtml(meta, fallbackBody) {
  if (!meta) return `<section class="signature plain">${nl(fallbackBody)}</section>`;
  const lines = [
    meta.attorney ? `<div class="sig-name">${esc(meta.attorney)}</div>` : '',
    meta.bbo ? `<div>BBO No. ${esc(meta.bbo)}</div>` : '',
    meta.firm ? `<div>${esc(meta.firm)}</div>` : '',
    meta.address ? `<div>${esc(meta.address)}</div>` : '',
    meta.phone ? `<div>${esc(meta.phone)}</div>` : '',
    meta.email ? `<div>${esc(meta.email)}</div>` : '',
  ].filter(Boolean).join('');

  return `<section class="signature">
  <table class="sig-grid"><tr>
    <td class="sig-left">
      <div class="sig-lead">Respectfully submitted,</div>
      <div class="sig-party">${esc(meta.party || '')}</div>
      <div class="sig-rel">${esc(meta.relation || 'Defendant')}</div>
      ${meta.dated ? `<div class="sig-dated">Dated: ${esc(meta.dated)}</div>`
                   : '<div class="sig-dated">Dated: <span class="fill"></span></div>'}
    </td>
    <td class="sig-right">
      <div class="sig-by">${esc(meta.by || 'By counsel,')}</div>
      <div class="sig-line"></div>
      ${lines}
    </td>
  </tr></table>
</section>`;
}

const STYLE = `
@page{size:8.5in 11in;margin:1in 1in 0.9in 1in;
  @bottom-center{content:counter(page) " of " counter(pages);
    font-family:'Times New Roman',Times,serif;font-size:10pt;color:#333}}
body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.6;color:#000;margin:0}

/* caption */
.caption{margin-bottom:26px}
.caption.plain{white-space:pre-line}
.cap-court{text-align:center;font-weight:bold;letter-spacing:.05em;margin-bottom:16px}
.cap-grid{width:100%;border-collapse:collapse}
.cap-grid td{vertical-align:top;padding:0;text-align:left}
.cap-grid td div{text-align:left}
.cap-left{width:46%;padding-right:16px;padding-bottom:6px}
.cap-rule{width:1px;border-left:1px solid #000;padding:2px 0}
.cap-right{width:47%;padding-left:16px}
.party{font-weight:bold;letter-spacing:.03em;margin:3px 0}
.party-v{margin:9px 0 9px 26px;font-style:italic}
.cap-forum{font-weight:bold;margin-top:2px}
.cap-docket{margin-top:11px;font-weight:bold}

/* body */
h2{font-size:12pt;text-align:center;text-decoration:underline;letter-spacing:.05em;
  margin:26px 0 13px;page-break-after:avoid}
section.title div{text-align:center;font-weight:bold;text-decoration:underline;
  margin:6px 0 4px;letter-spacing:.02em}
section.title{margin-bottom:4px}
section.title + section h2{margin-top:20px}
section div{text-align:justify}
section p{margin:0 0 12px;text-indent:0.5in;text-align:justify}
section p:first-child{margin-top:0}
.pb{page-break-before:always}

/* signature */
.signature{margin-top:34px;page-break-inside:avoid}
.signature.plain{white-space:pre-line}
.sig-grid{width:100%;border-collapse:collapse}
.sig-grid td{vertical-align:top;padding:0}
.sig-left{width:48%}
.sig-right{width:52%;padding-left:10px}
.sig-lead{margin-bottom:12px}
.sig-party{font-weight:bold;letter-spacing:.03em}
.sig-rel{font-size:11pt;color:#333}
.sig-dated{margin-top:26px}
.sig-dated .fill{display:inline-block;width:1.7in;border-bottom:1px solid #000}
.sig-by{margin-bottom:34px}
.sig-line{border-bottom:1px solid #000;width:3.1in;margin-bottom:5px}
.sig-name{font-weight:bold}
.sig-right div{font-size:11pt;line-height:1.45}
.sig-right .sig-name{font-size:12pt}

/* certificate and order read as separate instruments */
section.certificate,section.proposed_order{margin-top:30px}
@media print{body{margin:0}}
`;

/** Paragraph-aware body: blank lines become indented paragraphs. */
function bodyHtml(text) {
  const paras = String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (!paras.length) return '';
  return paras.map(p => `<p>${nl(p)}</p>`).join('');
}

/** render(motion, blocks) - the filed document, opening on the caption. */
export function renderMotionHtml(motion, blocks) {
  const body = blocks.map(b => {
    const brk = b.pageBreak ? '<div class="pb"></div>' : '';
    if (b.type === 'caption') return brk + captionHtml(b.meta, b.body);
    if (b.type === 'signature') return brk + signatureHtml(b.meta, b.body);
    const head = b.heading ? `<h2>${esc(b.heading)}</h2>` : '';
    if (b.type === 'title') return `${brk}<section class="title"><div>${nl(b.body)}</div></section>`;
    return `${brk}<section class="${esc(b.type)}">${head}${bodyHtml(b.body)}</section>`;
  }).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(motion.title || 'Motion')}</title>
<style>${STYLE}</style></head><body>${body}</body></html>`;
}
