export const OFFICIAL_GATEKEEPER_VK_HASH =
  '0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0';

export interface Config {
  hmacSecret: string;
  kurierApiKey: string;
  kurierBaseUrl: string;
  gatekeeperVkHash: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^[0-9]+$/.test(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

export function loadConfig(): Config {
  const gatekeeperVkHash = (process.env.KURIER_GATEKEEPER_VK_HASH ?? OFFICIAL_GATEKEEPER_VK_HASH).toLowerCase();
  if (gatekeeperVkHash !== OFFICIAL_GATEKEEPER_VK_HASH) {
    throw new Error('KURIER_GATEKEEPER_VK_HASH does not match the official Gatekeeper key');
  }
  return {
    hmacSecret: required('AGENT_GAMES_HMAC_SECRET'),
    kurierApiKey: required('KURIER_API_KEY'),
    kurierBaseUrl: process.env.KURIER_BASE_URL ?? 'https://api.kurier.xyz/api/v1',
    gatekeeperVkHash,
    pollIntervalMs: positiveInteger('KURIER_POLL_INTERVAL_MS', 2000),
    pollTimeoutMs: Math.min(positiveInteger('KURIER_POLL_TIMEOUT_MS', 45000), 55000),
  };
}
