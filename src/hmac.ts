import { createHmac, timingSafeEqual } from 'node:crypto';

function digest(raw: Buffer, secret: string): Buffer {
  return createHmac('sha256', Buffer.from(secret, 'utf8')).update(raw).digest();
}

function parseSignature(header: string | null): { prefix: string; bytes: Buffer; encoding: 'hex' | 'base64' } | null {
  const text = (header ?? '').trim();
  const prefix = /^sha256=/i.test(text) ? text.slice(0, 7) : '';
  const value = text.slice(prefix.length);
  if (/^[0-9a-f]{64}$/i.test(value)) return { prefix, bytes: Buffer.from(value, 'hex'), encoding: 'hex' };
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) return { prefix, bytes: Buffer.from(value, 'base64'), encoding: 'base64' };
  return null;
}

export function verifyRequest(raw: Buffer, header: string | null, secret: string): ((body: string) => string) | null {
  if (!secret || secret.length < 16) return null;
  const parsed = parseSignature(header);
  if (!parsed) return null;
  const expected = digest(raw, secret);
  if (parsed.bytes.length !== expected.length || !timingSafeEqual(parsed.bytes, expected)) return null;
  return body => `${parsed.prefix}${digest(Buffer.from(body), secret).toString(parsed.encoding)}`;
}
