import { describe, expect, it } from 'vitest';
import {
  generateJWT,
  hashPassword,
  isPasswordValid,
  isValidEmail,
  verifyJWT,
  verifyPassword,
} from '../../src/utils/auth-utils';

describe('auth utilities', () => {
  it('validates email and password basics', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('bad-email')).toBe(false);
    expect(isPasswordValid('1234567').valid).toBe(false);
    expect(isPasswordValid('12345678').valid).toBe(false);
    expect(isPasswordValid('Password123').valid).toBe(true);
  });

  it('hashes and verifies PBKDF2 passwords', async () => {
    const stored = await hashPassword('correct horse battery staple');

    expect(stored).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword('correct horse battery staple', 'user-id', stored)).toBe(true);
    expect(await verifyPassword('wrong password', 'user-id', stored)).toBe(false);
  });

  it('signs and verifies JWT payloads', async () => {
    const secret = 'test-secret-that-is-not-a-placeholder';
    const token = await generateJWT({ userId: 'user-1' }, secret);

    expect(await verifyJWT(token, secret)).toMatchObject({ userId: 'user-1' });
    expect(await verifyJWT(token, 'different-secret')).toBeNull();
  });
});
