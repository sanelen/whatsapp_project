export const DEFAULT_LOGIN_ERROR =
  "Login failed. Please check your details and try again.";

export const MISSING_ACCOUNT_LOGIN_ERROR =
  "Login failed. We could not find those credentials. If you have not registered yet, choose Sign up to create an account.";

export function getLoginErrorMessage(error: string | null): string | null {
  if (!error) return null;

  const normalized = error.toLowerCase();
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
    return "Google sign-in failed. Please stay on this page and try again, or sign up if this is your first time.";
  }

  return DEFAULT_LOGIN_ERROR;
}
