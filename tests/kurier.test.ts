import test from 'node:test';
import assert from 'node:assert/strict';
import { createKurierClient } from '../src/kurier.js';

const proof = { pi_a: ['1'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['1'], protocol: 'groth16', curve: 'bn128' };

function mockedFetch(statuses: string[]): typeof fetch {
  let call = 0;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const body = call++ === 0 ? { jobId: 'job-1' } : { status: statuses[Math.min(call - 2, statuses.length - 1)] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

test('Kurier client submits the official Groth16 shape and waits for Finalized', async () => {
  const client = createKurierClient({
    apiKey: 'test-key',
    baseUrl: 'https://kurier.test/api/v1',
    vkHash: '0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0',
    pollIntervalMs: 1,
    pollTimeoutMs: 100,
    fetchImpl: mockedFetch(['Submitted', 'IncludedInBlock', 'Finalized']),
  });
  const result = await client.submitAndFinalize(proof, ['1', '2'], new AbortController().signal);
  assert.equal(result.status, 'Finalized');
  assert.equal(result.jobId, 'job-1');
});

test('Kurier client fails on terminal rejection', async () => {
  const client = createKurierClient({
    apiKey: 'test-key',
    baseUrl: 'https://kurier.test/api/v1',
    vkHash: '0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0',
    pollIntervalMs: 1,
    pollTimeoutMs: 100,
    fetchImpl: mockedFetch(['Rejected']),
  });
  await assert.rejects(client.submitAndFinalize(proof, ['1'], new AbortController().signal), /status was Rejected/);
});
