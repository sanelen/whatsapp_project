import { createHash } from 'node:crypto';

export const FLOW_ID = '1731454068115574';
export const WABA_ID = '1331485505283891';
export const SPREADSHEET_ID = '185I2dzEuc-spUeifJlSVDILXBuKIFcFubdcfhbN_a-k';
export const SHEET_ID = 980450815;
export const TABLE_ID = '2124547708';
export const HEADERS = ['Date added', 'Name', 'Surname', 'Property', 'WhatsApp number', 'Status', 'Notes'];
export const PROPERTIES = { essex: '33 Essex', westrich: 'Westrich', quarry_heights: 'Quarry Heights' } as const;
export type Submission = { name: string; surname: string; property: string; phone: string };
export type Outcome = 'saved' | 'already_on_list';
export class InvalidSubmission extends Error {}

export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' || !/^[+\d\s()-]+$/.test(value)) throw new InvalidSubmission('Enter a valid phone number with country code.');
  let phone = value.replace(/[\s()-]/g, '');
  if (/^0[1-9]\d{8}$/.test(phone)) phone = '+27' + phone.slice(1);
  else if (/^27[1-9]\d{8}$/.test(phone)) phone = '+' + phone;
  else if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || (phone.startsWith('+27') && !/^\+27[1-9]\d{8}$/.test(phone))) {
    throw new InvalidSubmission('Enter a valid phone number with country code.');
  }
  return phone;
}

export function parseSubmission(data: unknown): Submission {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InvalidSubmission('Complete all four fields.');
  const input = data as Record<string, unknown>;
  function name(key: string) {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100 || /[\x00-\x1f\x7f]/.test(value)) {
      throw new InvalidSubmission('Enter your name and surname (up to 100 characters each).');
    }
    return value.trim();
  }
  if (typeof input.property !== 'string' || !Object.hasOwn(PROPERTIES, input.property)) throw new InvalidSubmission('Choose one of the three properties.');
  return { name: name('name'), surname: name('surname'), property: PROPERTIES[input.property as keyof typeof PROPERTIES], phone: normalizePhone(input.whatsapp_number) };
}

export function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export function localDateSerial(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day')) / 86400000 + 25569;
}
