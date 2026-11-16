const UINT64_MAX = (1n << 64n) - 1n;
const HEX = (value: unknown, bytes: number, field: string): string => {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{1,${bytes * 2}}$`).test(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value.toLowerCase();
};

function uint64(value: unknown, field: string): bigint {
  if (!['string', 'number'].includes(typeof value) || !/^(0|[1-9][0-9]*)$/.test(String(value))) {
    throw new Error(`Invalid ${field}`);
  }
  const result = BigInt(value as string | number);
  if (result > UINT64_MAX) throw new Error(`Out of range ${field}`);
  return result;
}

export interface GatekeeperInput {
  registered_vk: unknown;
  proof_vk: unknown;
  minimum: unknown;
  public_balance: unknown;
  expiry_block: unknown;
  current_block: unknown;
  recipient: unknown;
  condition_recipient: unknown;
  amount: unknown;
  max_transfer: unknown;
  proof_tx: unknown;
}

export type Decision = 'APPROVE' | 'REJECT';
export interface Evaluation {
  decision: Decision;
  reason_code: string;
  proof_tx: string;
  category: string;
}

export function evaluateStatement(input: GatekeeperInput, reused = false): Evaluation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Missing input');
  const registeredVk = HEX(input.registered_vk, 32, 'registered_vk');
  const proofVk = HEX(input.proof_vk, 32, 'proof_vk');
  const recipient = HEX(input.recipient, 20, 'recipient');
  const conditionRecipient = HEX(input.condition_recipient, 20, 'condition_recipient');
  const proofTx = HEX(input.proof_tx, 32, 'proof_tx');
  const numbers = Object.fromEntries(
    ['minimum', 'public_balance', 'expiry_block', 'current_block', 'amount', 'max_transfer']
      .map(field => [field, uint64(input[field as keyof GatekeeperInput], field)]),
  ) as Record<string, bigint>;
  const reject = (reason_code: string, category: string): Evaluation =>
    ({ decision: 'REJECT', reason_code, category, proof_tx: proofTx });
  if (reused) return reject('PROOF_REPLAY', 'PROOF_REUSED');
  if (registeredVk !== proofVk) return reject('VK_SUBSTITUTION', 'VK_SUBSTITUTION');
  if (numbers.public_balance < numbers.minimum) return reject('THRESHOLD_MISMATCH', 'THRESHOLD_MISMATCH');
  if (numbers.current_block >= numbers.expiry_block) return reject('EXPIRED_CONDITION', 'EXPIRED_CONDITION');
  if (recipient !== conditionRecipient) return reject('RECIPIENT_MISMATCH', 'RECIPIENT_MISMATCH');
  if (numbers.amount > numbers.max_transfer) return reject('AMOUNT_OVERFLOW', 'AMOUNT_OVERFLOW');
  return { decision: 'APPROVE', reason_code: 'VALID_PROOF', category: 'VALID_CONDITION', proof_tx: proofTx };
}
