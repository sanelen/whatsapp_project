import 'server-only';

import type { AdminBankAccount, BankAccountStatus } from '@/lib/bank-account-types';

function status(value: string | undefined): BankAccountStatus {
  if (value === 'approved' || value === 'disabled') return value;
  return 'needs_verification';
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing protected bank configuration: ${name}`);
  return value;
}

function verificationNote(accountStatus: BankAccountStatus, pendingNote: string): string {
  return accountStatus === 'approved' ? 'Owner confirmed all displayed fields on 15 July 2026.' : pendingNote;
}

export function getAdminBankAccounts(): AdminBankAccount[] {
  const quarryStatus = status(process.env.BANK_QH_STATUS);
  const westridgeStatus = status(process.env.BANK_WR_STATUS);
  const essexStatus = status(process.env.BANK_ESSEX_STATUS);

  return [
    {
      id: 'qh-primary',
      propertyId: 'quarry-heights',
      propertyName: 'Quarry Heights',
      bankName: required('BANK_QH_NAME'),
      beneficiaryName: required('BANK_QH_BENEFICIARY'),
      accountNumber: required('BANK_QH_ACCOUNT_NUMBER'),
      branchCode: required('BANK_QH_BRANCH_CODE'),
      accountType: required('BANK_QH_ACCOUNT_TYPE'),
      status: quarryStatus,
      evidence: 'QH lease plus rental-flow workbook; the account number matches across three internal sources.',
      verificationNote: verificationNote(quarryStatus, 'Beneficiary-name variants conflict. Obtain a current bank-issued proof of account before approval.'),
    },
    {
      id: 'wr-primary',
      propertyId: 'westridge',
      propertyName: 'Westridge',
      bankName: required('BANK_WR_NAME'),
      beneficiaryName: required('BANK_WR_BENEFICIARY'),
      accountNumber: required('BANK_WR_ACCOUNT_NUMBER'),
      branchCode: required('BANK_WR_BRANCH_CODE'),
      accountType: required('BANK_WR_ACCOUNT_TYPE'),
      status: westridgeStatus,
      evidence: 'Hamba Trading Rental Flows workbook, Westridge Bank Details section.',
      verificationNote: verificationNote(westridgeStatus, 'Only one internal source located. Match the full record to bank-issued proof before approval.'),
    },
    {
      id: 'essex-primary',
      propertyId: '33-essex',
      propertyName: '33 Essex',
      bankName: required('BANK_ESSEX_NAME'),
      beneficiaryName: required('BANK_ESSEX_BENEFICIARY'),
      accountNumber: required('BANK_ESSEX_ACCOUNT_NUMBER'),
      branchCode: required('BANK_ESSEX_BRANCH_CODE'),
      accountType: required('BANK_ESSEX_ACCOUNT_TYPE'),
      status: essexStatus,
      evidence: 'Essex lease, payment-linked tenant record and Capitec incoming-payment notices ending 7904.',
      verificationNote: verificationNote(essexStatus, 'Internal flow lists branch 470010 while lease/payment evidence lists 450105. Confirm the current branch before approval.'),
    },
  ];
}
