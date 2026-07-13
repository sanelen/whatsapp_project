export const DEFAULT_LOGIN_ERROR =
  "Login failed. Please check your details and try again.";

export const MISSING_ACCOUNT_LOGIN_ERROR =
  'Login failed. Use the approved Hamba Google account.';

export const ACCESS_DENIED_LOGIN_ERROR =
  'This Google account is not approved for the Hamba workspace.';

export function getLoginErrorMessage(error: string | null): string | null {
  if (!error) return null;

  const normalized = error.toLowerCase();
  if (normalized === 'access_denied') {
    return ACCESS_DENIED_LOGIN_ERROR;
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("email not confirmed") ||
    normalized.includes("user not found")
  ) {
    return MISSING_ACCOUNT_LOGIN_ERROR;
  }

  if (
    normalized === "auth_callback_failed" ||
    normalized.includes("callback") ||
    normalized.includes("oauth")
  ) {
    return 'Google sign-in failed. Please stay on this page and try again.';
  }

  return DEFAULT_LOGIN_ERROR;
}
