// Authentication utilities for My Flower Pots API

// Cloudflare Workers currently caps PBKDF2 iterations at 100000.
const PBKDF2_MAX_ITERATIONS = 100000;
const PBKDF2_ITERATIONS = PBKDF2_MAX_ITERATIONS;
const PBKDF2_ALGO = 'pbkdf2-sha256';
const AUTH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const INVALID_JWT_SECRETS = new Set([
  '',
  'default-secret',
  'my-super-secret-key-change-me-in-production',
]);

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUint8Array(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function hashPasswordLegacy(password: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + userId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  if (iterations > PBKDF2_MAX_ITERATIONS) {
    throw new Error(
      `PBKDF2 iteration count ${iterations} exceeds the Cloudflare Workers limit of ${PBKDF2_MAX_ITERATIONS}.`
    );
  }

  const encoder = new TextEncoder();
  const saltBuffer = new Uint8Array(salt).buffer;
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return uint8ArrayToBase64(new Uint8Array(derivedBits));
}

/**
 * Hash a password using PBKDF2 with a random salt.
 * The second parameter is kept for compatibility with older call sites.
 */
export async function hashPassword(password: string, _userId?: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_ALGO}$${PBKDF2_ITERATIONS}$${uint8ArrayToBase64(salt)}$${hash}`;
}

/**
 * Verify a password against a stored hash
 */
export async function verifyPassword(
  password: string,
  userId: string,
  storedHash: string
): Promise<boolean> {
  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith(`${PBKDF2_ALGO}$`)) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) {
      return false;
    }

    const iterations = Number(parts[1]);
    if (!Number.isFinite(iterations) || iterations <= 0) {
      return false;
    }

    const salt = base64ToUint8Array(parts[2]);
    const hash = await derivePasswordHash(password, salt, iterations);
    return hash === parts[3];
  }

  const legacyHash = await hashPasswordLegacy(password, userId);
  return legacyHash === storedHash;
}

/**
 * Generate a random token for email verification or password reset
 */
export function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength (minimum requirements)
 */
export function isPasswordValid(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  // Optional: add more complexity requirements if needed
  return { valid: true };
}

/**
 * Generate a response with CORS headers
 */
export function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-d1-bookmark',
      'Access-Control-Expose-Headers': 'x-d1-bookmark',
    },
  });
}

/**
 * Generate error response
 */
export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Extract token from Authorization header
 * Supports both formats:
 * 1. Bearer {token}
 * 2. {token} (without Bearer prefix)
 */
export function getTokenFromHeader(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  // Remove 'Bearer ' prefix if present
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // If no Bearer prefix, assume the whole string is the token
  return authHeader;
}

export function getJwtSecret(env: any): string {
  const secret = String(env?.JWT_SECRET || '').trim();
  if (INVALID_JWT_SECRETS.has(secret)) {
    throw new Error('JWT_SECRET is missing or uses a known insecure placeholder value in the active deployment.');
  }
  return secret;
}
/**
 * Generate a simple JWT-like token (signed with HS256)
 */
export async function generateJWT(payload: any, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
  const encodedPayload = btoa(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + AUTH_TOKEN_TTL_SECONDS
  })).replace(/=/g, '');

  const tokenToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHS256(tokenToSign, secret);

  return `${tokenToSign}.${signature}`;
}

/**
 * Verify a JWT-like token
 */
export async function verifyJWT(token: string, secret: string): Promise<any | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const tokenToSign = `${header}.${payload}`;
  const expectedSignature = await signHS256(tokenToSign, secret);

  if (signature !== expectedSignature) return null;

  try {
    const decodedPayload = JSON.parse(atob(payload));
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decodedPayload;
  } catch (e) {
    return null;
  }
}

async function signHS256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, msgData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
