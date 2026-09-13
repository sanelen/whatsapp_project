export class MonthlyPaymentsDomainError extends Error {
  readonly status: 409 | 422;
  readonly code: string;

  constructor(message: string, options: { status?: 409 | 422; code: string }) {
    super(message);
    this.name = 'MonthlyPaymentsDomainError';
    this.status = options.status ?? 409;
    this.code = options.code;
  }
}

export function monthlyPaymentsErrorResponse(error: unknown): {
  error: string;
  errorCode?: string;
  status: 409 | 422 | 500;
} {
  if (error instanceof MonthlyPaymentsDomainError) {
    return {
      error: error.message,
      errorCode: error.code,
      status: error.status,
    };
  }

  return {
    error: error instanceof Error ? error.message : 'Monthly payments action failed',
    status: 500 as const,
  };
}
