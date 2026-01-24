// Authentication utilities for My Flower Pots API

/**
 * Hash a password using Web Crypto API (SHA-256)
 * We combine the password with userId as salt for better security
 */
export async function hashPassword(password: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  // Combine password with userId as salt
  const data = encoder.encode(password + userId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify a password against a stored hash
 */
export async function verifyPassword(
  password: string, 
  userId: string, 
  storedHash: string
): Promise<boolean> {
  const hash = await hashPassword(password, userId);
  return hash === storedHash;
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
