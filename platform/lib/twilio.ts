import twilio from 'twilio';

// Lazy getter — instantiated on first request, not at build time
let _client: ReturnType<typeof twilio> | null = null;

export function getTwilioClient() {
	if (!_client) {
		const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
		const authToken = process.env.TWILIO_AUTH_TOKEN || '';
		_client = twilio(accountSid, authToken);
	}
	return _client;
}

export const TWILIO_FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER_ID || '';
