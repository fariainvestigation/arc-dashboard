import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'people/assets/arc_people_bridge.js'), 'utf8');

function harness() {
  let payload = null;
  let rev = 0;
  const writes = [];
  const ctx = {
    console,
    URL,
    Headers,
    Response,
    Request,
    structuredClone,
    crypto: crypto.webcrypto,
    location: { protocol: 'https:', origin: 'https://arcdefensereport.com' },
    fetch: async (input, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      if (method === 'GET') {
        return Response.json({ payload, rev });
      }
      const body = JSON.parse(String(init.body || '{}'));
      const headers = new Headers(init.headers || {});
      writes.push({ body, ifMatch: headers.get('If-Match') });
      const supplied = Number(headers.get('If-Match') || body.expectedRev || 0);
      if (rev > 0 && supplied !== rev) {
        return Response.json({ error: 'Module state changed elsewhere', conflict: { currentRev: rev } }, { status: 409 });
      }
      if (rev === 0 && supplied > 0) {
        return Response.json({ error: 'Module state conflict', conflict: { currentRev: 0 } }, { status: 409 });
      }
      payload = body.payload;
      rev += 1;
      return Response.json({ ok: true, rev });
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.ARC_PEOPLE = {
    normalizePerson(input, caseId, existing = {}) {
      return {
        ...existing,
        ...input,
        id: existing.id || input.id || `PRSN-${input.firstName || 'x'}`,
        caseId,
        identity: input.identity || { fullName: [input.firstName, input.lastName].filter(Boolean).join(' ') },
        metadata: { ...(existing.metadata || {}), updatedAt: new Date().toISOString() }
      };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'arc_people_bridge.js' });
  return { ctx, writes, get rev() { return rev; }, bump() { rev += 1; } };
}

test('People bridge creates and updates D1 module state with optimistic revisions', async () => {
  const h = harness();
  const bridge = h.ctx.ARCPeopleBridge;
  assert.ok(bridge);
  await bridge.savePerson('CASE-1', { firstName: 'Jane', lastName: 'Doe' });
  assert.equal(h.writes[0].body.expectedRev, 0);
  assert.equal(h.writes[0].ifMatch, null);
  assert.equal(h.rev, 1);

  const rows = await bridge.listPeople('CASE-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].identity.fullName, 'Jane Doe');

  await bridge.savePerson('CASE-1', { id: rows[0].id, firstName: 'Jane', lastName: 'Smith' });
  assert.equal(h.writes[1].body.expectedRev, 1);
  assert.equal(h.writes[1].ifMatch, '1');
  assert.equal(h.rev, 2);
});

test('People bridge refuses to overwrite a newer server revision', async () => {
  const h = harness();
  const bridge = h.ctx.ARCPeopleBridge;
  await bridge.savePerson('CASE-2', { firstName: 'John', lastName: 'Doe' });
  h.bump();
  await assert.rejects(
    () => bridge.savePerson('CASE-2', { firstName: 'John', lastName: 'Changed' }),
    /changed in another ARC session/i
  );
});
