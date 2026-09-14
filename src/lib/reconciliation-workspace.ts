import type { ReferencePoolViewRow, UnitTableRow, UnitTableStatus } from './monthly-payments';

export type UnitReviewFilter = 'all' | 'attention' | UnitTableStatus;

function searchable(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

type SearchableUnit = Pick<UnitTableRow, 'label' | 'contacts' | 'expectedReference' | 'reference' | 'status'> & {
  matchedReferences?: Array<{ reference: string }>;
};

export function filterUnitRows<T extends SearchableUnit>(rows: T[], query: string, status: UnitReviewFilter): T[] {
  const needle = searchable(query);
  return rows.filter((row) => {
    const statusMatches = status === 'all'
      || (status === 'attention' ? row.status !== 'paid' && row.status !== 'blocked' : row.status === status);
    const text = [row.label, ...row.contacts, row.expectedReference, row.reference,
      ...(row.matchedReferences ?? []).map((payment) => payment.reference)].filter(Boolean).join(' ');
    return statusMatches && searchable(text).includes(needle);
  });
}

export function filterUnmatchedRows(rows: ReferencePoolViewRow[], query: string, propertyId: string, account = 'all'): ReferencePoolViewRow[] {
  const needle = searchable(query);
  return rows.filter((row) => {
    const propertyMatches = propertyId === 'all'
      || (propertyId === 'unassigned' ? !row.propertyId : row.propertyId === propertyId);
    const text = [row.reference, row.payerName, row.accountSuffix, row.propertyName, row.billingPeriodKey].filter(Boolean).join(' ');
    const accountMatches = account === 'all' || (row.accountSuffix?.trim() || 'unknown') === account;
    return accountMatches && propertyMatches && searchable(text).includes(needle);
  });
}

export function summarizeUnmatchedAccounts(rows: ReferencePoolViewRow[]) {
  const accounts = new Map<string, { id: string; count: number; amount: number }>();
  for (const row of rows) {
    // Suffixes are review filters, never proof of property or tenant ownership.
    const id = row.accountSuffix?.trim() || 'unknown';
    const summary = accounts.get(id) ?? { id, count: 0, amount: 0 };
    summary.count += 1;
    summary.amount = Math.round((summary.amount + row.amount) * 100) / 100;
    accounts.set(id, summary);
  }
  return [...accounts.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function summarizeUnmatchedLocations(rows: ReferencePoolViewRow[]) {
  const locations = new Map<string, {
    id: string; name: string; propertyId: string | null; referenceCount: number; totalAmount: number;
  }>();
  for (const row of rows) {
    // Import metadata is evidence to review, not a confirmed property assignment.
    const key = row.propertyId ?? 'unassigned';
    const summary = locations.get(key) ?? {
      id: key, name: row.propertyId ? row.propertyName : 'Unassigned property',
      propertyId: row.propertyId, referenceCount: 0, totalAmount: 0,
    };
    summary.referenceCount += 1;
    summary.totalAmount = Math.round((summary.totalAmount + row.amount) * 100) / 100;
    locations.set(key, summary);
  }
  return [...locations.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}
