import test from 'node:test';
import assert from 'node:assert/strict';
import { rebaseCaseOnConflict } from '../arc_case_sync_merge.mjs';

test('overlapping field edits auto-merge when different fields changed', () => {
  const base = { caseId: 'case-1', attorney: 'A', notes: 'N0', status: 'active', __rev: 4 };
  const local = { caseId: 'case-1', attorney: 'A', notes: 'Local notes B', status: 'active', __rev: 4 };
  const server = { caseId: 'case-1', attorney: 'Server Counsel', notes: 'N0', status: 'active', __rev: 5 };
  const out = rebaseCaseOnConflict(base, local, server);
  assert.equal(out.canAutoSave, true);
  assert.equal(out.conflicts.length, 0);
  assert.equal(out.merged.notes, 'Local notes B', 'local B survives');
  assert.equal(out.merged.attorney, 'Server Counsel');
  assert.equal(out.merged.__rev, 5);
});

test('same-field conflict preserves both values for user resolution', () => {
  const base = { caseId: 'case-1', status: 'intake', notes: 'shared', __rev: 4 };
  const local = { caseId: 'case-1', status: 'active-local', notes: 'shared', __rev: 4 };
  const server = { caseId: 'case-1', status: 'active-server', notes: 'shared', __rev: 5 };
  const out = rebaseCaseOnConflict(base, local, server);
  assert.equal(out.canAutoSave, false);
  assert.equal(out.conflicts.length, 1);
  assert.equal(out.conflicts[0].field, 'status');
  assert.equal(out.conflicts[0].local, 'active-local');
  assert.equal(out.conflicts[0].server, 'active-server');
  assert.match(out.conflicts[0].message, /Choose Server Version or Your Version/);
  assert.equal(out.merged.status, 'active-local', 'local value kept pending until choice');
});

test('concurrency rebase simulation: rev4 editA editB server rev5 keeps local B then ready for rev6', () => {
  const base = {
    caseId: 'case-sim',
    matter: 'Matter',
    notes: 'base',
    attorney: 'Original',
    __rev: 4
  };
  // Edit A then Edit B locally (B is the pending snapshot when 409 arrives).
  const localAfterB = {
    caseId: 'case-sim',
    matter: 'Matter',
    notes: 'edit-B-final',
    attorney: 'Original',
    __rev: 4,
    updatedAt: '2026-08-07T12:00:02Z'
  };
  // Meanwhile another session advanced attorney and revision.
  const serverRev5 = {
    caseId: 'case-sim',
    matter: 'Matter',
    notes: 'base',
    attorney: 'Other Session',
    __rev: 5,
    updatedAt: '2026-08-07T12:00:01Z'
  };
  const out = rebaseCaseOnConflict(base, localAfterB, serverRev5);
  assert.equal(out.canAutoSave, true, 'different fields must auto-merge');
  assert.equal(out.merged.notes, 'edit-B-final', 'local B must survive; fail if replaced');
  assert.notEqual(out.merged.notes, 'base');
  assert.equal(out.merged.attorney, 'Other Session');
  assert.equal(out.merged.__rev, 5, 'retry should target server rev 5 → becomes 6 on ACK');
});

test('same status conflict cannot silently discard either version', () => {
  const base = { caseId: 'c2', status: 'open', __rev: 1 };
  const browserA = { caseId: 'c2', status: 'closed-by-A', __rev: 1 };
  const browserBServer = { caseId: 'c2', status: 'closed-by-B', __rev: 2 };
  const out = rebaseCaseOnConflict(base, browserA, browserBServer);
  assert.equal(out.canAutoSave, false);
  assert.equal(out.conflicts[0].local, 'closed-by-A');
  assert.equal(out.conflicts[0].server, 'closed-by-B');
  assert.equal(out.merged.status, 'closed-by-A');
});
