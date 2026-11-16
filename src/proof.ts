import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { groth16 } from 'snarkjs';
import { keccak256, toBytes } from 'viem';
import type { GatekeeperInput } from './gatekeeper-policy.js';
import type { Groth16Proof } from './kurier.js';

export const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const gatekeeperSignalNames = [
  'evaluationCommitment', 'registeredVkHash', 'proofVkHash', 'minimum',
  'publicBalance', 'expiryBlock', 'currentBlock', 'recipient',
  'conditionRecipient', 'amount', 'maxTransfer', 'decision', 'taskId',
] as const;
const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url));

function field(value: string): string {
  if (!/^[0-9]+$/.test(value) || BigInt(value) >= FIELD_PRIME) throw new Error('Invalid circuit field');
  return value;
}

function hexField(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{1,${bytes * 2}}$`).test(value)) {
    throw new Error('Invalid hexadecimal circuit field');
  }
  return (BigInt(value) % FIELD_PRIME).toString();
}

function taskField(taskId: string): string {
  return (BigInt(keccak256(toBytes(taskId))) % FIELD_PRIME).toString();
}

export interface GatekeeperWitness extends Record<string, string> {
  registeredVkHash: string;
  proofVkHash: string;
  minimum: string;
  publicBalance: string;
  expiryBlock: string;
  currentBlock: string;
  recipient: string;
  conditionRecipient: string;
  amount: string;
  maxTransfer: string;
  decision: string;
  taskId: string;
  salt: string;
}

export function witnessFor(input: GatekeeperInput, taskId: string, approve: boolean): GatekeeperWitness {
  return {
    registeredVkHash: hexField(input.registered_vk, 32),
    proofVkHash: hexField(input.proof_vk, 32),
    minimum: String(input.minimum),
    publicBalance: String(input.public_balance),
    expiryBlock: String(input.expiry_block),
    currentBlock: String(input.current_block),
    recipient: hexField(input.recipient, 20),
    conditionRecipient: hexField(input.condition_recipient, 20),
    amount: String(input.amount),
    maxTransfer: String(input.max_transfer),
    decision: approve ? '1' : '0',
    taskId: taskField(taskId),
    salt: BigInt(`0x${randomBytes(31).toString('hex')}`).toString(),
  };
}

function assertBinding(signals: string[], witness: GatekeeperWitness): void {
  if (signals.length !== gatekeeperSignalNames.length) throw new Error('Wrong public signal count');
  signals.forEach(signal => field(signal));
  for (let index = 1; index < gatekeeperSignalNames.length; index += 1) {
    const name = gatekeeperSignalNames[index];
    if (witness[name] !== signals[index]) throw new Error(`Public signal mismatch: ${name}`);
  }
}

export async function proveGatekeeper(witness: GatekeeperWitness): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  Object.values(witness).forEach(field);
  const result = await groth16.fullProve(
    witness,
    `${artifacts}gatekeeper.wasm`,
    `${artifacts}gatekeeper_final.zkey`,
    undefined,
    { memorySize: 1024 },
    { singleThread: true },
  );
  assertBinding(result.publicSignals, witness);
  const key = JSON.parse(await readFile(`${artifacts}gatekeeper.vkey.json`, 'utf8')) as unknown;
  if (!await groth16.verify(key, result.publicSignals, result.proof)) {
    throw new Error('Local Gatekeeper proof verification failed');
  }
  return { proof: result.proof, publicSignals: result.publicSignals };
}
