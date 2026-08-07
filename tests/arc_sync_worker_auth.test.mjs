import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../arc-sync-backend/worker.js';

const env = {
  ARC_DB: {},
  ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
  ACCESS_AUD: 'test-aud',
};

test('sync worker rejects missing Access JWT', async () => {
  const response = await worker.fetch(new Request('https://arcdefensereport.com/sync/whoami'), env);
  assert.equal(response.status, 401);
});

test('sync worker rejects spoofed Access email header without JWT', async () => {
  const response = await worker.fetch(new Request('https://arcdefensereport.com/sync/whoami', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'spoofed@arc.test' },
  }), env);
  assert.equal(response.status, 401);
});

test('sync worker rejects disallowed Origin before authentication', async () => {
  const response = await worker.fetch(new Request('https://arcdefensereport.com/sync/whoami', {
    headers: { Origin: 'https://evil.example' },
  }), env);
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.match(body.error || '', /Origin not allowed/);
});
