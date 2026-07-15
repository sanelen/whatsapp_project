import type { PropertyId } from '@/lib/lease-generator';

export type BankAccountStatus = 'approved' | 'needs_verification' | 'disabled';

export interface AdminBankAccount {
  id: string;
  propertyId: PropertyId;
  propertyName: string;
  bankName: string;
  beneficiaryName: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
  status: BankAccountStatus;
  evidence: string;
  verificationNote: string;
}
