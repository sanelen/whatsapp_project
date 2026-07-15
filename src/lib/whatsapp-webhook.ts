import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifyWhatsAppChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  expectedToken: string
): string | null {
  if (mode !== 'subscribe' || !token || !challenge || !expectedToken) return null;
  return safeEqual(token, expectedToken) ? challenge : null;
}

export function verifyMetaWebhookSignature(
  body: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith('sha256=') || !appSecret) return false;
  const suppliedSignature = signatureHeader.slice('sha256='.length);
  const expectedSignature = createHmac('sha256', appSecret).update(body).digest('hex');
  return safeEqual(suppliedSignature, expectedSignature);
}
