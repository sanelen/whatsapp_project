import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LOGIN_ERROR,
  MISSING_ACCOUNT_LOGIN_ERROR,
  getLoginErrorMessage,
} from './login-messages';

test('login message helper returns no message when there is no error', () => {
  assert.equal(getLoginErrorMessage(null), null);
});

test('login message helper guides unknown email/password users to sign up', () => {
  assert.equal(
    getLoginErrorMessage('Invalid login credentials'),
    MISSING_ACCOUNT_LOGIN_ERROR
  );
});

test('login message helper keeps OAuth failures on the login page with retry copy', () => {
  assert.match(
    getLoginErrorMessage('auth_callback_failed') ?? '',
    /Google sign-in failed/
  );
});

test('login message helper falls back to a generic login failure', () => {
  assert.equal(getLoginErrorMessage('network went sideways'), DEFAULT_LOGIN_ERROR);
});
