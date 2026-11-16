import { evaluateStatement, type GatekeeperInput } from './gatekeeper-policy.js';
import { OFFICIAL_GATEKEEPER_VK_HASH } from './config.js';
import { proveGatekeeper, witnessFor } from './proof.js';
import type { KurierClient } from './kurier.js';
import { acceptedBy, markAccepted } from './replay.js';

export interface GatekeeperEnvelope {
  type: 'agent-games.proof-gatekeeper.v1';
  task_id: string;
  input: GatekeeperInput;
}

export interface GatekeeperResponse {
  decision: 'APPROVE' | 'REJECT';
  reason_code: string;
  proof_tx?: string;
  proof?: unknown;
  public_signals?: string[];
  proof_reference?: string;
}

const reject = (reason_code: string, proofTx?: unknown): GatekeeperResponse => ({
  decision: 'REJECT',
  reason_code,
  ...(typeof proofTx === 'string' ? { proof_tx: proofTx } : {}),
});

export async function processGatekeeper(
  envelope: GatekeeperEnvelope,
  kurier: KurierClient,
): Promise<GatekeeperResponse> {
  const input = envelope.input;
  let proofTx: string | undefined;
  try {
    if (typeof input.proof_tx !== 'string') return reject('INVALID_INPUT');
    proofTx = input.proof_tx;
    const prior = await acceptedBy(proofTx);
    if (prior && prior !== envelope.task_id) return reject('PROOF_REPLAY', proofTx);
    const evaluation = evaluateStatement(input, Boolean(prior));
    const official = typeof input.registered_vk === 'string' &&
      input.registered_vk.toLowerCase() === OFFICIAL_GATEKEEPER_VK_HASH;
    const decision = evaluation.decision === 'APPROVE' && official;
    const reason = decision ? evaluation.reason_code : (official ? evaluation.reason_code : 'VK_UNREGISTERED');
    const generated = await proveGatekeeper(witnessFor(input, envelope.task_id, decision));
    const response: GatekeeperResponse = {
      decision: decision ? 'APPROVE' : 'REJECT',
      reason_code: reason,
      proof_tx: proofTx,
      proof: generated.proof,
      public_signals: generated.publicSignals,
    };
    if (!decision) return response;
    const finalized = await kurier.submitAndFinalize(generated.proof, generated.publicSignals, AbortSignal.timeout(55000));
    await markAccepted(proofTx, envelope.task_id);
    return { ...response, proof_reference: finalized.proofReference ?? finalized.jobId };
  } catch (error) {
    console.error(JSON.stringify({ at: 'gatekeeper-failed', error: error instanceof Error ? error.message : String(error) }));
    return reject(error instanceof Error && error.message.includes('Kurier') ? 'PROOF_NOT_FINALIZED' : 'PROCESSING_ERROR', proofTx);
  }
}
