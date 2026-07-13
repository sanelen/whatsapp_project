export type BankImportPolicy = {
  id: string;
  input: string;
  action: 'accept' | 'ignore' | 'review';
  explanation: string;
};

export type ObservedBankAccount = {
  suffix: string;
  role: string;
  status: 'excluded' | 'mixed';
  explanation: string;
  evidence: string;
};

export const BANK_IMPORT_POLICIES: BankImportPolicy[] = [
  {
    id: 'notification-incoming-funds',
    input: 'Capitec notification: Incoming Funds',
    action: 'accept',
    explanation: 'Extract the credit and create a database payment reference when it falls inside the selected billing window.',
  },
  {
    id: 'notification-paid-from',
    input: 'Capitec notification: Account Paid From or reserved merchant activity',
    action: 'ignore',
    explanation: 'Outgoing payments and internal transfers are not tenant receipts and must not enter payment matching.',
  },
  {
    id: 'statement-credit',
    input: 'CSV/PDF statement: positive incoming credit',
    action: 'accept',
    explanation: 'Extract incoming credits from Drive bank statements, then deduplicate them by file hash and transaction fingerprint.',
  },
  {
    id: 'statement-debit',
    input: 'CSV/PDF statement: debit, fee, purchase, or transfer out',
    action: 'ignore',
    explanation: 'Negative account activity is retained in the source file but excluded from payment references.',
  },
  {
    id: 'interest-received',
    input: 'Any source: Interest Received',
    action: 'ignore',
    explanation: 'Bank interest is not tenant rent and never creates an import entry or payment reference.',
  },
];

export const OBSERVED_BANK_ACCOUNTS: ObservedBankAccount[] = [
  {
    suffix: '7467',
    role: 'Internal/non-rent account',
    status: 'excluded',
    explanation: 'Confirmed by the owner as an internal account. It is not a property mapping; all Gmail, Drive, CSV, and PDF transactions on this suffix are excluded.',
    evidence: 'Owner walkthrough, 12 Jul 2026',
  },
  {
    suffix: '6570',
    role: 'Mixed legacy rent account',
    status: 'mixed',
    explanation: 'Historical Quarry Heights and West Ridge account. Accept Payment Received rows only, reject transfers and credits below R1,900, then route by reference first and R2,200/R1,900 fallback.',
    evidence: 'Owner-supplied statement, 12 Jul 2026',
  },
];

// These suffixes are internal/non-rent accounts. Entries on them must never
// create bank_import_entries or payment_references, regardless of source.
export const EXCLUDED_BANK_ACCOUNT_SUFFIXES = new Set(['7467']);

// Dedicated property accounts use their account mapping as the property
// boundary. Match hints may choose a unit only inside that mapped property.
export const PROPERTY_LOCKED_BANK_ACCOUNT_SUFFIXES = new Set(['7904', '9613']);

export const MIXED_LEGACY_BANK_ACCOUNT_SUFFIXES = new Set(['6570']);
