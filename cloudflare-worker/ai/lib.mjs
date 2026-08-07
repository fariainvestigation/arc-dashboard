// ARC Legal Worker support library: dependency-free ZIP (store method), minimal DOCX,
// Cloudflare Access JWT validation, hashing, and shared helpers.
// Runs on Cloudflare Workers; tests run the same code under Node 20+.

export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
export const safeName = s => String(s || 'file')
  .replace(/[^A-Za-z0-9._-]+/g, '_')   // drop separators and anything exotic
  .replace(/\.{2,}/g, '_')             // collapse any ".." traversal sequence
  .replace(/^[._-]+/, '_')             // no leading dot/dash filenames
  .slice(0, 160) || 'file';
export const enc = new TextEncoder();

// ---- CRC32 + store-method ZIP ----------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function u16(v) { return new Uint8Array([v & 255, (v >> 8) & 255]); }
function u32(v) { return new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]); }
function cat(...parts) {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** Build a ZIP (store method) from [{name, data: Uint8Array|string}]. */
export function buildZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const name = enc.encode(e.name);
    const crc = crc32(data);
    const local = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data);
    const central = cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name);
    locals.push(local); centrals.push(central);
    offset += local.length;
  }
  const centralStart = offset;
  const centralBytes = cat(...centrals, new Uint8Array(0));
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralBytes.length), u32(centralStart), u16(0));
  return cat(...locals, centralBytes, end);
}

// ---- minimal DOCX (WordprocessingML, Times New Roman 12pt) ------------------
const xmlEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function para(text, { bold = false, center = false, underline = false, justify = false } = {}) {
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>${bold ? '<w:b/>' : ''}${underline ? '<w:u w:val="single"/>' : ''}</w:rPr>`;
  const jc = center ? '<w:jc w:val="center"/>' : justify ? '<w:jc w:val="both"/>' : '';
  const runs = String(text).split('\n').map((line, i) =>
    `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(line)}</w:t></w:r>`).join('');
  return `<w:p><w:pPr>${jc}<w:spacing w:line="360" w:lineRule="auto" w:after="200"/></w:pPr>${runs}</w:p>`;
}
/** blocks: [{heading, body, type, pageBreak}] -> valid .docx bytes */
export function buildDocx(blocks) {
  let body = '';
  for (const b of blocks) {
    if (b.pageBreak) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    if (b.heading) body += para(b.heading, { bold: true, center: true, underline: true });
    body += para(b.body || '', {
      bold: b.type === 'title', underline: b.type === 'title',
      center: b.type === 'title',
      justify: !['caption', 'title', 'signature'].includes(b.type),
    });
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: doc },
  ]);
}

// ---- hashing ----------------------------------------------------------------
/** Stream a body through SHA-256 without buffering the whole file when the
    platform provides DigestStream (Cloudflare Workers). Falls back to a
    chunked subtle.digest for test environments. Returns { hash, size, chunks }
    where chunks are retained only when `retain` is true (small files). */
export async function hashStream(stream, { retain = false, maxRetain = 64 * 1024 * 1024 } = {}) {
  let size = 0;
  const kept = [];
  if (globalThis.crypto?.DigestStream) {
    const digestStream = new crypto.DigestStream('SHA-256');
    const writer = digestStream.getWriter();
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (retain && size <= maxRetain) kept.push(value);
      await writer.write(value);
    }
    await writer.close();
    const digest = await digestStream.digest;
    return { hash: hex(new Uint8Array(digest)), size, chunks: kept };
  }
  // fallback: accumulate (tests / small files)
  const reader = stream.getReader();
  const parts = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    parts.push(value);
  }
  const all = cat(...parts, new Uint8Array(0));
  const digest = await crypto.subtle.digest('SHA-256', all);
  return { hash: hex(new Uint8Array(digest)), size, chunks: retain ? [all] : [] };
}
const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');

// ---- Cloudflare Access JWT validation ---------------------------------------
const b64uToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const jwksCache = { keys: null, fetched: 0 };
/**
 * Validate a Cloudflare Access JWT (Cf-Access-Jwt-Assertion header).
 * env.ACCESS_TEAM_DOMAIN e.g. "example.cloudflareaccess.com"; env.ACCESS_AUD is the app AUD tag.
 * Tests may inject env.__verifyJwt(token) -> identity to bypass network JWKS.
 * Returns { email, sub } or throws.
 */
export async function verifyAccessJwt(token, env) {
  if (!token) throw new Error('Missing Cloudflare Access token');
  if (env.__verifyJwt) return env.__verifyJwt(token);
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) throw new Error('Malformed Access token');
  const header = JSON.parse(new TextDecoder().decode(b64uToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64uToBytes(p)));
  const nowS = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowS) throw new Error('Access token expired');
  const audOk = [].concat(payload.aud || []).includes(env.ACCESS_AUD);
  if (!audOk) throw new Error('Access token audience mismatch');
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) throw new Error('Access token issuer mismatch');
  if (!jwksCache.keys || Date.now() - jwksCache.fetched > 3600e3) {
    const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    if (!r.ok) throw new Error('Unable to fetch Access certs');
    jwksCache.keys = (await r.json()).keys;
    jwksCache.fetched = Date.now();
  }
  const jwk = jwksCache.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown Access signing key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(sig), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('Access token signature invalid');
  if (!payload.email) throw new Error('Access token has no email identity');
  return { email: String(payload.email).toLowerCase(), sub: String(payload.sub || '').trim() };
}

// ---- misc -------------------------------------------------------------------
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

export const PLACEHOLDER_RE = /\[[A-Z][A-Z0-9 ._\/:-]{2,}\]/g;
export const findPlaceholders = t => [...new Set(String(t || '').match(PLACEHOLDER_RE) || [])];
