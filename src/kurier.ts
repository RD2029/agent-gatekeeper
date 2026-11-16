export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

export interface FinalizedProof {
  jobId: string;
  status: 'Finalized';
  proofReference?: string;
}

interface KurierResponse {
  jobId?: string;
  status?: string;
  proofId?: string;
  txHash?: string;
  error?: string;
}

export interface KurierClient {
  submitAndFinalize(proof: Groth16Proof, publicSignals: string[], signal: AbortSignal): Promise<FinalizedProof>;
}

export function createKurierClient(options: {
  apiKey: string;
  baseUrl: string;
  vkHash: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  fetchImpl?: typeof fetch;
}): KurierClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = (path: string) => `${options.baseUrl.replace(/\/$/, '')}${path}/${encodeURIComponent(options.apiKey)}`;
  const request = async (url: string, init?: RequestInit): Promise<KurierResponse> => {
    const response = await fetchImpl(url, { ...init, signal: init?.signal });
    const body = await response.json() as KurierResponse;
    if (!response.ok) throw new Error(`Kurier request failed with HTTP ${response.status}`);
    return body;
  };
  return {
    async submitAndFinalize(proof, publicSignals, signal) {
      const submitted = await request(endpoint('/submit-proof'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proofType: 'groth16',
          vkRegistered: true,
          proofOptions: { library: 'snarkjs', curve: 'bn128' },
          proofData: { proof, publicSignals, vk: options.vkHash },
        }),
        signal,
      });
      if (!submitted.jobId) throw new Error('Kurier response did not contain jobId');
      const deadline = Date.now() + options.pollTimeoutMs;
      while (Date.now() < deadline) {
        const status = await request(`${endpoint('/job-status')}/${encodeURIComponent(submitted.jobId)}`, { signal });
        if (status.status === 'Finalized') {
          return { jobId: submitted.jobId, status: 'Finalized', proofReference: status.proofId ?? status.txHash };
        }
        if (['Failed', 'Rejected', 'Error'].includes(status.status ?? '')) {
          throw new Error(`Kurier proof status was ${status.status}`);
        }
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.pollIntervalMs);
          signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Kurier polling aborted')); }, { once: true });
        });
      }
      throw new Error('Kurier proof finalization timed out');
    },
  };
}
