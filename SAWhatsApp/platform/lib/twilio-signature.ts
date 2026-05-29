import crypto from 'crypto';

/**
 * Validates Twilio webhook signature to ensure request authenticity
 * @param url The webhook URL that received the request
 * @param params The request parameters/body
 * @param signature The X-Twilio-Signature header value
 * @param authToken The Twilio auth token
 * @returns true if signature is valid, false otherwise
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, unknown>,
  signature: string,
  authToken: string
): boolean {
  try {
    // Sort params and append to URL
    let data = url;
    const keys = Object.keys(params).sort();
    for (const key of keys) {
      data += key + params[key];
    }

    // Compute HMAC-SHA1
    const computed = crypto
      .createHmac('sha1', authToken)
      .update(data)
      .digest('base64');

    // Use timing-safe comparison to prevent timing-based attacks
    const computedBuf = Buffer.from(computed);
    const signatureBuf = Buffer.from(signature);
    if (computedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, signatureBuf);
  } catch (error) {
    console.error('Signature validation error:', error);
    return false;
  }
}

/**
 * Parse Twilio form-encoded webhook body into an object
 * @param bodyString The raw body string from form-encoded data
 * @returns Parsed object
 */
export function parseTwilioBody(bodyString: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const pairs = bodyString.split('&');

  const decodeFormValue = (value: string) =>
    decodeURIComponent(value.replace(/\+/g, ' '));

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeFormValue(value || '');
    }
  }

  return params;
}
