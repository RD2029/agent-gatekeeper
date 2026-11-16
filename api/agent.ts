import { loadConfig } from '../src/config.js';
import { verifyRequest } from '../src/hmac.js';
import { createKurierClient } from '../src/kurier.js';
import { processGatekeeper, type GatekeeperEnvelope } from '../src/gatekeeper-service.js';

function response(status: number, payload: unknown, signer?: (body: string) => string): Response {
  const body = JSON.stringify(payload);
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  if (signer) headers.set('x-agent-games-signature', signer(body));
  return new Response(body, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  const raw = Buffer.from(await request.arrayBuffer());
  const secret = process.env.AGENT_GAMES_HMAC_SECRET;
  const signer = verifyRequest(raw, request.headers.get('x-agent-games-signature'), secret ?? '');
  if (!signer) return response(401, { error: 'Invalid signature' });
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw.toString('utf8'));
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('Invalid envelope');
    const value = envelope as Record<string, unknown>;
    const issued = Date.parse(String(value.issued_at ?? value.issuedAt ?? ''));
    if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > 600000) throw new Error('Stale envelope');
    if (value.type === 'agent-games.preflight.v1') return response(200, { ok: true, protocolVersion: 'v1' }, signer);
    if (value.type !== 'agent-games.proof-gatekeeper.v1') return response(400, { error: 'Unsupported task type' }, signer);
    if (typeof value.task_id !== 'string' || !value.input || typeof value.input !== 'object') throw new Error('Invalid Gatekeeper envelope');
    const config = loadConfig();
    const kurier = createKurierClient({
      apiKey: config.kurierApiKey,
      baseUrl: config.kurierBaseUrl,
      vkHash: config.gatekeeperVkHash,
      pollIntervalMs: config.pollIntervalMs,
      pollTimeoutMs: config.pollTimeoutMs,
    });
    const result = await processGatekeeper(value as unknown as GatekeeperEnvelope, kurier);
    return response(200, result, signer);
  } catch (error) {
    console.error(JSON.stringify({ at: 'request-failed', error: error instanceof Error ? error.message : String(error) }));
    return response(503, { decision: 'REJECT', reason_code: 'PROCESSING_ERROR' }, signer);
  }
}

export function GET(): Response {
  return Response.json({ ok: true, protocolVersion: 'v1', configured: Boolean(process.env.AGENT_GAMES_HMAC_SECRET) });
}
