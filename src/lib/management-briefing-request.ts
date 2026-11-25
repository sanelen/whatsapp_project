import type { ManagementAlertConfig } from './rent-management-alerts';

export type ManagementBriefingRequest = { propertyId: string; period: string };

export function parseManagementBriefingRequest(value: unknown): ManagementBriefingRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => key !== 'propertyId' && key !== 'period')) return null;
  if (typeof input.propertyId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.propertyId)) return null;
  if (typeof input.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) return null;
  return { propertyId: input.propertyId, period: input.period };
}

/** Copy only the requested building; destination, sender and recurring scope stay server-owned. */
export function oneOffManagementConfig(config: ManagementAlertConfig, input: ManagementBriefingRequest): ManagementAlertConfig {
  return { ...config, propertyId: input.propertyId };
}
