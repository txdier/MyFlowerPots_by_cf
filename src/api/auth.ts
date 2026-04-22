import {
  hashPassword,
  verifyPassword,
  generateToken,
  isValidEmail,
  isPasswordValid,
  generateJWT,
  getJwtSecret
} from '../utils/auth-utils';

import {
  sendEmail,
  generateVerificationEmail,
  generatePasswordResetEmail,
  generateWelcomeEmail,
  generateNewEmailVerificationEmail
} from '../utils/email-service';

import { isAdmin } from './admin';

import { jsonResponse, errorResponse, htmlResponse } from '../utils/response-utils';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const DISPLAY_NAME_MAX_LENGTH = 12;
const VERIFICATION_EMAIL_COOLDOWN_MS = 60 * 1000;
const VERIFICATION_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_EMAIL_WINDOW_LIMIT = 5;

function normalizeOptionalDisplayName(value: unknown): { value: string | null; error?: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }
  if (typeof value !== 'string') {
    return { value: null, error: '显示名称格式无效' };
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { value: null };
  }
  if (Array.from(normalized).length > DISPLAY_NAME_MAX_LENGTH) {
    return { value: null, error: `显示名称最多 ${DISPLAY_NAME_MAX_LENGTH} 个字符` };
  }

  return { value: normalized };
}

function parseDateMs(value: unknown): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function recordVerificationEmailSend(
  env: any,
  userId: string,
  nowMs = Date.now(),
  windowStartMs: number | null = null,
  previousWindowCount = 0
): Promise<void> {
  const nowIso = new Date(nowMs).toISOString();
  const isExistingWindow = windowStartMs !== null && nowMs - windowStartMs < VERIFICATION_EMAIL_WINDOW_MS;
  const nextWindowStartIso = isExistingWindow ? new Date(windowStartMs).toISOString() : nowIso;
  const nextCount = isExistingWindow ? previousWindowCount + 1 : 1;

  await env.DB
    .prepare(`
      UPDATE users
      SET verification_email_sent_at = ?,
          verification_email_send_window_start = ?,
          verification_email_send_count = ?
      WHERE id = ?
    `)
    .bind(nowIso, nextWindowStartIso, nextCount, userId)
	    .run();
}

type VerificationEmailRateUser = {
  id: string;
  verification_email_sent_at?: string | null;
  verification_email_send_window_start?: string | null;
  verification_email_send_count?: number | string | null;
};

type VerificationEmailReservation = {
  nowMs: number;
  nowIso: string;
  nextWindowStartIso: string;
  nextWindowCount: number;
  cooldownCutoffIso: string;
};

function prepareVerificationEmailReservation(
  user: VerificationEmailRateUser,
  nowMs = Date.now()
): { reservation?: VerificationEmailReservation; response?: Response } {
  const lastSentMs = parseDateMs(user.verification_email_sent_at);
  if (lastSentMs !== null) {
    const retryAfterMs = VERIFICATION_EMAIL_COOLDOWN_MS - (nowMs - lastSentMs);
    if (retryAfterMs > 0) {
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      return { response: errorResponse(`发送太频繁，请 ${retryAfterSeconds} 秒后再试`, 429) };
    }
  }

  const windowStartMs = parseDateMs(user.verification_email_send_window_start);
  const isExistingWindow = windowStartMs !== null && nowMs - windowStartMs < VERIFICATION_EMAIL_WINDOW_MS;
  const currentWindowCount = isExistingWindow ? Number(user.verification_email_send_count || 0) : 0;
  if (currentWindowCount >= VERIFICATION_EMAIL_WINDOW_LIMIT) {
    return { response: errorResponse(`验证邮件 24 小时内最多发送 ${VERIFICATION_EMAIL_WINDOW_LIMIT} 次，请稍后再试`, 429) };
  }

  const nowIso = new Date(nowMs).toISOString();
  return {
    reservation: {
      nowMs,
      nowIso,
      nextWindowStartIso: isExistingWindow && windowStartMs !== null
        ? new Date(windowStartMs).toISOString()
        : nowIso,
      nextWindowCount: isExistingWindow ? currentWindowCount + 1 : 1,
      cooldownCutoffIso: new Date(nowMs - VERIFICATION_EMAIL_COOLDOWN_MS).toISOString()
    }
  };
}

async function reserveVerificationEmailSend(
  env: any,
  userId: string,
  reservation: VerificationEmailReservation,
  extraSetClause: string,
  extraValues: unknown[]
): Promise<boolean> {
  const reserveResult = await env.DB
    .prepare(`
      UPDATE users
      SET ${extraSetClause}
          verification_email_sent_at = ?,
          verification_email_send_window_start = ?,
          verification_email_send_count = ?
      WHERE id = ?
        AND (verification_email_sent_at IS NULL OR verification_email_sent_at <= ?)
    `)
    .bind(
      ...extraValues,
      reservation.nowIso,
      reservation.nextWindowStartIso,
      reservation.nextWindowCount,
      userId,
      reservation.cooldownCutoffIso
    )
    .run();

  return !!reserveResult.meta && reserveResult.meta.changes > 0;
}

function buildVerificationEmailCooldownResponse(): Response {
  return errorResponse(`发送太频繁，请 ${Math.ceil(VERIFICATION_EMAIL_COOLDOWN_MS / 1000)} 秒后再试`, 429);
}

function isUniqueConstraintError(error: unknown, tableOrColumn?: string): boolean {
  const message = String((error as any)?.message || error || '');
  if (!/unique constraint failed|SQLITE_CONSTRAINT/i.test(message)) {
    return false;
  }
  if (!tableOrColumn) {
    return true;
  }
  return message.toLowerCase().includes(tableOrColumn.toLowerCase());
}

function getClientSafeAuthErrorMessage(error: unknown, fallback: string): string {
  const message = String((error as any)?.message || error || '');

  if (isUniqueConstraintError(error, 'users.email')) {
    return 'Email already registered';
  }

  if (/JWT_SECRET/i.test(message)) {
    return 'Server authentication is not configured securely. JWT_SECRET is missing or uses a known insecure placeholder value in the active deployment.';
  }

  if (/no such column:\s*(is_disabled|max_pots|verification_token_expires|verification_email_sent_at|verification_email_send_count|verification_email_send_window_start)/i.test(message)) {
    return 'User schema is out of date. Please apply the latest database migrations and redeploy.';
  }

  if (/PBKDF2 iteration count .* exceeds the Cloudflare Workers limit of 100000|above 100000 are not supported/i.test(message)) {
    return 'Password hashing configuration exceeds the Cloudflare Workers PBKDF2 limit. Deploy the latest worker and try again.';
  }

  if (/PBKDF2|deriveBits|importKey|SubtleCrypto|crypto\.subtle/i.test(message)) {
    return 'Password hashing is unavailable in the current deployment runtime. Please redeploy the latest worker and try again.';
  }

  return fallback;
}

async function issueAuthToken(
  env: any,
  payload: { userId: string; email?: string | null; type: string }
): Promise<string> {
  const secret = getJwtSecret(env);
  return generateJWT(payload, secret);
}

export async function handleAuthRequest(
  request: Request,
  env: any,
  path: string,
  url: URL,
  userId: string | null
): Promise<Response> {
  // 1️⃣ 邮箱注册
  if (request.method === 'POST' && path === '/api/auth/register') {
    return handleRegister(request, env);
  }

  // 2️⃣ 邮箱登录
  if (request.method === 'POST' && path === '/api/auth/login') {
    return handleLogin(request, env);
  }

  // 3️⃣ 匿名用户标识
  if (request.method === 'POST' && path === '/api/auth/identify') {
    return handleIdentify(env);
  }

  // 4️⃣ 忘记密码
  if (request.method === 'POST' && path === '/api/auth/forgot-password') {
    return handleForgotPassword(request, env);
  }

  // 5️⃣ 重置密码
  if (request.method === 'POST' && path === '/api/auth/reset-password') {
    return handleResetPassword(request, env);
  }

  // 6️⃣ 匿名升级为邮箱用户
  if (request.method === 'POST' && path === '/api/auth/upgrade') {
    return handleUpgrade(request, env);
  }

  // 7️⃣ 邮箱验证
  if (request.method === 'GET' && path === '/api/auth/verify-email') {
    return handleVerifyEmail(url, env);
  }

  // 8️⃣ 获取当前用户信息
  if (request.method === 'GET' && path === '/api/auth/me') {
    return handleGetMe(request, env, userId);
  }

  // 9️⃣ 更新用户资料
  if (request.method === 'PUT' && path === '/api/auth/profile') {
    return handleUpdateProfile(request, env, userId);
  }

  // 🔟 修改密码
  if (request.method === 'PUT' && path === '/api/auth/password') {
    return handleChangePassword(request, env, userId);
  }

  // 1️⃣1️⃣ 修改邮箱（请求发送验证邮件）
  if (request.method === 'POST' && path === '/api/auth/change-email') {
    return handleChangeEmail(request, env, userId);
  }

  // 1️⃣2️⃣ 验证新邮箱
  if (request.method === 'GET' && path === '/api/auth/verify-new-email') {
    return handleVerifyNewEmail(url, env);
  }

  // 1️⃣3️⃣ 发送验证邮件到当前邮箱
  if (request.method === 'POST' && path === '/api/auth/send-verification-email') {
    return handleSendVerificationEmail(request, env, userId);
  }

  // 1️⃣4️⃣ 刷新 JWT 令牌
  if (request.method === 'POST' && path === '/api/auth/refresh') {
    return handleRefreshToken(env, userId);
  }

  return errorResponse('Not Found', 404);
}

function renderVerificationSuccessPage(
  title: string,
  heading: string,
  message: string
): Response {
  const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <title>${title} - 我的花盆</title>
      <style>
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #f6faf6;
          color: #1f2937;
          touch-action: manipulation;
        }
        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          box-sizing: border-box;
        }
        .card {
          width: 100%;
          max-width: 560px;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 12px 36px rgba(15, 23, 42, 0.12);
          padding: 40px 32px;
          text-align: center;
        }
        .success {
          color: #2f855a;
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 16px;
        }
        .message {
          font-size: 18px;
          line-height: 1.6;
          margin-bottom: 28px;
        }
        .button {
          background-color: #4CAF50;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 999px;
          font-weight: bold;
          display: inline-block;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="card">
          <div class="success">&#9989; ${heading}</div>
          <div class="message">${message}</div>
          <p>您现在可以关闭当前窗口，并返回应用继续使用。</p>
          <a href="/" class="button">返回我的花盆</a>
        </div>
      </div>
    </body>
    </html>
  `;

  return htmlResponse(html);
}

async function handleRegister(request: Request, env: any): Promise<Response> {
  let requestEmail: string | null = null;
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    const { email, password, displayName } = body;
    requestEmail = typeof email === 'string' ? email : null;

    if (!email || !password) {
      return errorResponse('Email and password are required', 400);
    }

    if (!isValidEmail(email)) {
      return errorResponse('Invalid email format', 400);
    }

    const passwordValidation = isPasswordValid(password);
    if (!passwordValidation.valid) {
      return errorResponse(passwordValidation.message || 'Invalid password', 400);
    }

    const displayNameResult = normalizeOptionalDisplayName(displayName);
    if (displayNameResult.error) {
      return errorResponse(displayNameResult.error, 400);
    }
    const normalizedDisplayName = displayNameResult.value;

    // 检查邮箱是否已存在
    const existingUser = await env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existingUser) {
      return errorResponse('Email already registered', 409);
    }

    // 创建新用户
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password, userId);
    const jwtToken = await issueAuthToken(env, { userId, email, type: 'email' });
    const verificationToken = generateToken();
    const verificationTokenExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString();

    await env.DB
      .prepare(`
        INSERT INTO users (
          id, user_type, email, password_hash, display_name, 
          email_verified, verification_token, verification_token_expires, created_at
        ) VALUES (?, 'email', ?, ?, ?, FALSE, ?, ?, CURRENT_TIMESTAMP)
      `)
      .bind(userId, email, passwordHash, normalizedDisplayName, verificationToken, verificationTokenExpires)
      .run();

    // 发送验证邮件（可选）
    if (verificationToken) {
      const verificationEmail = generateVerificationEmail(
        email,
        verificationToken,
        env.APP_BASE_URL || 'https://my-flower-pots-api.example.com'
      );
      const emailSent = await sendEmail(verificationEmail, env);
      if (!emailSent) {
        console.warn('Verification email was not sent during registration:', email);
      } else {
        try {
          await recordVerificationEmailSend(env, userId);
        } catch (trackingError) {
          console.warn('Verification email send tracking failed during registration:', trackingError);
        }
      }
    }

    return jsonResponse({
      success: true,
      userId,
      token: jwtToken,
      email,
      displayName: normalizedDisplayName,
      emailVerified: false,
      message: 'Registration successful. You can now login.'
    });

  } catch (error) {
    console.error('Registration error:', {
      error,
      message: String((error as any)?.message || error || ''),
      email: requestEmail,
      hasResendApiKey: Boolean(env?.RESEND_API_KEY),
      appBaseUrl: env?.APP_BASE_URL || null,
    });
    if (isUniqueConstraintError(error, 'users.email')) {
      return errorResponse('Email already registered', 409);
    }
    return errorResponse(getClientSafeAuthErrorMessage(error, 'Registration failed'), 500);
  }
}

async function handleLogin(request: Request, env: any): Promise<Response> {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse('Email and password are required', 400);
    }

    // 查找用户
    const user = await env.DB
      .prepare('SELECT id, password_hash, display_name, email_verified, is_disabled FROM users WHERE email = ? AND user_type = ?')
      .bind(email, 'email')
      .first();

    if (!user) {
      return errorResponse('Invalid email or password', 401);
    }

    // 安全加固：校验账号是否被禁用
    if (user.is_disabled === 1) {
      return errorResponse('Account disabled. Please contact support.', 403);
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.id, user.password_hash);
    if (!isValid) {
      return errorResponse('Invalid email or password', 401);
    }

    const jwtToken = await issueAuthToken(env, { userId: user.id, email, type: 'email' });

    // 更新最后登录时间
    await env.DB
      .prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(user.id)
      .run();

    return jsonResponse({
      success: true,
      userId: user.id,
      token: jwtToken,
      email,
      displayName: user.display_name,
      emailVerified: user.email_verified === 1,
    });

  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(getClientSafeAuthErrorMessage(error, 'Login failed'), 500);
  }
}

async function handleIdentify(env: any): Promise<Response> {
  try {
    const userId = crypto.randomUUID();
    const jwtToken = await issueAuthToken(env, { userId, type: 'anonymous' });

    await env.DB
      .prepare(`INSERT INTO users (id, user_type) VALUES (?, 'anonymous')`)
      .bind(userId)
      .run();

    return jsonResponse({
      success: true,
      userId,
      token: jwtToken,
      userType: 'anonymous',
    });
  } catch (error) {
    console.error('Identify error:', error);
    return errorResponse(getClientSafeAuthErrorMessage(error, 'Failed to create anonymous user'), 500);
  }
}

async function handleForgotPassword(request: Request, env: any): Promise<Response> {
  try {
    const body = (await request.json()) as {
      email?: string;
    };
    const { email } = body;

    if (!email) {
      return errorResponse('Email is required', 400);
    }

    // 查找用户
    const user = await env.DB
      .prepare('SELECT id FROM users WHERE email = ? AND user_type = ?')
      .bind(email, 'email')
      .first();

    if (!user) {
      // 出于安全考虑，即使用户不存在也返回成功
      return jsonResponse({
        success: true,
        message: 'If the email exists, a reset link will be sent.'
      });
    }

    // 生成重置令牌（24小时有效）
    const resetToken = generateToken();
    const resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await env.DB
      .prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
      .bind(resetToken, resetTokenExpires, user.id)
      .run();

    // 发送密码重置邮件
    const resetEmail = generatePasswordResetEmail(
      email,
      resetToken,
      env.APP_BASE_URL || 'https://my-flower-pots-api.example.com'
    );
    await sendEmail(resetEmail, env);

    return jsonResponse({
      success: true,
      message: 'If the email exists, a reset link will be sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return errorResponse('Failed to process request', 500);
  }
}

async function handleResetPassword(request: Request, env: any): Promise<Response> {
  try {
    const body = (await request.json()) as {
      token?: string;
      newPassword?: string;
    };
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return errorResponse('Token and new password are required', 400);
    }

    const passwordValidation = isPasswordValid(newPassword);
    if (!passwordValidation.valid) {
      return errorResponse(passwordValidation.message || 'Invalid password', 400);
    }

    // 查找有效的重置令牌
    const user = await env.DB
      .prepare('SELECT id FROM users WHERE reset_token = ? AND datetime(reset_token_expires) > CURRENT_TIMESTAMP')
      .bind(token)
      .first();

    if (!user) {
      return errorResponse('Invalid or expired reset token', 400);
    }

    // 更新密码并清除重置令牌
    const newPasswordHash = await hashPassword(newPassword, user.id);

    await env.DB
      .prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
      .bind(newPasswordHash, user.id)
      .run();

    return jsonResponse({
      success: true,
      message: 'Password reset successful. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return errorResponse('Failed to reset password', 500);
  }
}

async function handleUpgrade(request: Request, env: any): Promise<Response> {
  let requestEmail: string | null = null;
  let requestAnonymousUserId: string | null = null;
  try {
    const body = (await request.json()) as {
      anonymousUserId?: string;
      email?: string;
      password?: string;
      displayName?: string;
    };
    const { anonymousUserId, email, password, displayName } = body;
    requestEmail = typeof email === 'string' ? email : null;
    requestAnonymousUserId = typeof anonymousUserId === 'string' ? anonymousUserId : null;

    if (!anonymousUserId || !email || !password) {
      return errorResponse('Anonymous user ID, email and password are required', 400);
    }

    if (!isValidEmail(email)) {
      return errorResponse('Invalid email format', 400);
    }

    const passwordValidation = isPasswordValid(password);
    if (!passwordValidation.valid) {
      return errorResponse(passwordValidation.message || 'Invalid password', 400);
    }

    const displayNameResult = normalizeOptionalDisplayName(displayName);
    if (displayNameResult.error) {
      return errorResponse(displayNameResult.error, 400);
    }
    const normalizedDisplayName = displayNameResult.value;

    // 检查匿名用户是否存在（兼容 'device' 类型）
    const anonymousUser = await env.DB
      .prepare('SELECT id FROM users WHERE id = ? AND (user_type = "anonymous" OR user_type = "device")')
      .bind(anonymousUserId)
      .first();

    if (!anonymousUser) {
      return errorResponse('Invalid anonymous user', 400);
    }

    // 检查邮箱是否已存在
    const existingEmailUser = await env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existingEmailUser) {
      return errorResponse('Email already registered', 409);
    }

    // 创建新的邮箱用户
    const newUserId = crypto.randomUUID();
    const passwordHash = await hashPassword(password, newUserId);
    const jwtToken = await issueAuthToken(env, { userId: newUserId, email, type: 'email' });

    await env.DB
      .prepare(`
        INSERT INTO users (
          id, user_type, email, password_hash, display_name, 
          email_verified, created_at
        ) VALUES (?, 'email', ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
      `)
      .bind(newUserId, email, passwordHash, normalizedDisplayName)
      .run();

    // 迁移数据：将原匿名用户的所有数据转移到新用户
    const migrationStatements = [
      env.DB.prepare('UPDATE pots SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE care_records SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE timelines SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE pot_collaborators SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE pot_viewers SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE messages SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE messages SET sender_id = ? WHERE sender_id = ?').bind(newUserId, anonymousUserId)
    ];

    try {
      await env.DB.batch(migrationStatements);
    } catch (migrateError) {
      console.error('Data migration failed during upgrade:', migrateError);
      // 继续执行，不要因为迁移失败导致注册失败，但记录错误
    }

    // 标记原匿名用户为已升级（或删除）
    await env.DB
      .prepare('DELETE FROM users WHERE id = ?')
      .bind(anonymousUserId)
      .run();

    return jsonResponse({
      success: true,
      userId: newUserId,
      token: jwtToken,
      email,
      displayName: normalizedDisplayName,
      emailVerified: false,
      message: 'Account upgraded successfully. Your data has been migrated.'
    });

  } catch (error) {
    console.error('Upgrade error:', {
      error,
      message: String((error as any)?.message || error || ''),
      email: requestEmail,
      anonymousUserId: requestAnonymousUserId,
    });
    if (isUniqueConstraintError(error, 'users.email')) {
      return errorResponse('Email already registered', 409);
    }
    return errorResponse(getClientSafeAuthErrorMessage(error, 'Failed to upgrade account'), 500);
  }
}

async function handleVerifyEmail(url: URL, env: any): Promise<Response> {
  try {
    const token = url.searchParams.get('token');

    if (!token) {
      return errorResponse('Verification token is required', 400);
    }

    // 查找有效的验证令牌
    const user = await env.DB
      .prepare(`
        SELECT id, email, display_name
        FROM users
        WHERE verification_token = ?
          AND datetime(verification_token_expires) > CURRENT_TIMESTAMP
      `)
      .bind(token)
      .first();

    if (!user) {
      return errorResponse('Invalid or expired verification token', 400);
    }

    // 更新用户为已验证
    await env.DB
      .prepare(`
        UPDATE users
        SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL
        WHERE id = ?
      `)
      .bind(user.id)
      .run();

    try {
      const welcomeEmail = generateWelcomeEmail(
        user.email,
        user.display_name || null,
        env.APP_BASE_URL || 'https://my-flower-pots-api.example.com'
      );
      const welcomeSent = await sendEmail(welcomeEmail, env);
      if (!welcomeSent) {
        console.warn('Welcome email was not sent after email verification:', user.email);
      }
    } catch (welcomeError) {
      console.error('Failed to send welcome email after verification:', welcomeError);
    }

    return renderVerificationSuccessPage(
      '邮箱验证成功',
      '邮箱验证成功',
      `您的邮箱 ${user.email} 已验证成功。`
    );

  } catch (error) {
    console.error('Email verification error:', error);
    return errorResponse('Failed to verify email', 500);
  }
}

async function handleGetMe(request: Request, env: any, userId: string | null): Promise<Response> {
  try {
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    // 查找用户
    const user = await env.DB
      .prepare(`
        SELECT 
          id, user_type, email, display_name, avatar_url,
          email_verified, is_disabled, created_at, last_login
        FROM users 
        WHERE id = ?
      `)
      .bind(userId)
      .first();

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // 检查是否为管理员
    const adminStatus = await isAdmin(request, env, userId, user);

    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        userType: user.user_type,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        emailVerified: user.email_verified === 1,
        isDisabled: user.is_disabled === 1,
        isAdmin: adminStatus,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }
    });

  } catch (error) {
    console.error('Get user info error:', error);
    return errorResponse('Failed to get user information', 500);
  }
}

async function handleUpdateProfile(request: Request, env: any, userId: string | null): Promise<Response> {
  try {
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    const body = (await request.json()) as {
      displayName?: string;
      avatarUrl?: string;
    };
    const { displayName, avatarUrl } = body;

    const updates: string[] = [];
    const params: any[] = [];

    if (displayName !== undefined) {
      const displayNameResult = normalizeOptionalDisplayName(displayName);
      if (displayNameResult.error) {
        return errorResponse(displayNameResult.error, 400);
      }
      updates.push('display_name = ?');
      params.push(displayNameResult.value);
    }

    if (avatarUrl !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatarUrl);
    }

    if (updates.length === 0) {
      return errorResponse('No data to update', 400);
    }

    params.push(userId);

    // 更新用户资料
    await env.DB
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();

    return jsonResponse({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse('Failed to update profile', 500);
  }
}

async function handleChangePassword(request: Request, env: any, userId: string | null): Promise<Response> {
  try {
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return errorResponse('Current password and new password are required', 400);
    }

    // 验证当前密码
    const user = await env.DB
      .prepare('SELECT id, password_hash, user_type FROM users WHERE id = ?')
      .bind(userId)
      .first();

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // 检查用户是否有密码（邮箱用户才有密码）
    if (!user.password_hash) {
      return errorResponse('User does not have a password set', 400);
    }

    const isValid = await verifyPassword(currentPassword, user.id, user.password_hash);
    if (!isValid) {
      return errorResponse('Current password is incorrect', 401);
    }

    // 验证新密码
    const passwordValidation = isPasswordValid(newPassword);
    if (!passwordValidation.valid) {
      return errorResponse(passwordValidation.message || 'Invalid new password', 400);
    }

    // 更新密码
    const newPasswordHash = await hashPassword(newPassword, user.id);
    await env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newPasswordHash, user.id)
      .run();

    return jsonResponse({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse('Failed to change password', 500);
  }
}

/**
 * 处理修改邮箱请求（发送验证邮件到新邮箱）
 */
async function handleChangeEmail(request: Request, env: any, userId: string | null): Promise<Response> {
  try {
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    const body = (await request.json()) as {
      newEmail?: string;
    };
    const newEmail = String(body.newEmail || '').trim().toLowerCase();

    if (!newEmail) {
      return errorResponse('New email is required', 400);
    }

    if (!isValidEmail(newEmail)) {
      return errorResponse('Invalid email format', 400);
    }

    // 检查当前用户
    const user = await env.DB
      .prepare(`
        SELECT id, email, email_verified,
               verification_email_sent_at, verification_email_send_window_start, verification_email_send_count
        FROM users
        WHERE id = ?
      `)
      .bind(userId)
      .first();

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // 检查新邮箱是否与当前邮箱相同
    if (user.email === newEmail) {
      return errorResponse('New email is the same as current email', 400);
    }

    // 检查新邮箱是否已被其他用户使用
    const existingUser = await env.DB
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .bind(newEmail, userId)
      .first();

    if (existingUser) {
      return errorResponse('Email already registered by another user', 409);
    }

    const rateLimit = prepareVerificationEmailReservation(user);
    if (rateLimit.response) {
      return rateLimit.response;
    }
    const reservation = rateLimit.reservation!;

    // 生成验证令牌
    const verificationToken = generateToken();
    const verificationTokenExpires = new Date(reservation.nowMs + EMAIL_VERIFICATION_TTL_MS).toISOString();

    // 更新用户记录，设置新邮箱和验证令牌，并预占一次验证邮件发送额度。
    const reserved = await reserveVerificationEmailSend(
      env,
      userId,
      reservation,
      `new_email = ?,
          new_email_verification_token = ?,
          new_email_verification_expires = ?,`,
      [
        newEmail,
        verificationToken,
        verificationTokenExpires
      ]
    );

    if (!reserved) {
      return buildVerificationEmailCooldownResponse();
    }

    // 发送验证邮件到新邮箱
    const verificationEmail = generateNewEmailVerificationEmail(
      newEmail,
      user.email,
      verificationToken,
      env.APP_BASE_URL || 'https://my-flower-pots-api.example.com'
    );

    const emailSent = await sendEmail(verificationEmail, env);

    if (!emailSent) {
      return errorResponse('Failed to send verification email', 500);
    }

    return jsonResponse({
      success: true,
      message: 'Verification email sent to new email address',
      retryAfterSeconds: Math.ceil(VERIFICATION_EMAIL_COOLDOWN_MS / 1000)
    });

  } catch (error) {
    console.error('Change email error:', error);
    return errorResponse(getClientSafeAuthErrorMessage(error, 'Failed to process email change request'), 500);
  }
}

/**
 * 处理新邮箱验证
 */
async function handleVerifyNewEmail(url: URL, env: any): Promise<Response> {
  try {
    const token = url.searchParams.get('token');

    if (!token) {
      return errorResponse('Verification token is required', 400);
    }

    // 查找有效的验证令牌
    const user = await env.DB
      .prepare('SELECT id, email, new_email, new_email_verification_expires FROM users WHERE new_email_verification_token = ?')
      .bind(token)
      .first();

    if (!user) {
      return errorResponse('Invalid or expired verification token', 400);
    }

    // 检查令牌是否过期
    const expires = new Date(user.new_email_verification_expires);
    if (expires < new Date()) {
      return errorResponse('Verification token has expired', 400);
    }

    // 更新用户邮箱
    await env.DB
      .prepare('UPDATE users SET email = ?, email_verified = TRUE, new_email = NULL, new_email_verification_token = NULL, new_email_verification_expires = NULL WHERE id = ?')
      .bind(user.new_email, user.id)
      .run();

    return renderVerificationSuccessPage(
      '邮箱修改成功',
      '邮箱修改成功',
      `您的登录邮箱已更新为 ${user.new_email}。`
    );

  } catch (error) {
    console.error('New email verification error:', error);
    return errorResponse('Failed to verify new email', 500);
  }
}

/**
 * 处理发送验证邮件到当前邮箱
 */
async function handleSendVerificationEmail(request: Request, env: any, userId: string | null): Promise<Response> {
  try {
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    // 获取用户信息
    const user = await env.DB
      .prepare(`
        SELECT id, email, email_verified, verification_token, verification_token_expires,
               verification_email_sent_at, verification_email_send_window_start, verification_email_send_count
        FROM users
        WHERE id = ?
      `)
      .bind(userId)
      .first();

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // 检查邮箱是否已验证
    if (user.email_verified === 1) {
      return errorResponse('Email already verified', 400);
    }

    if (!user.email) {
      return errorResponse('Email is required', 400);
    }

    const rateLimit = prepareVerificationEmailReservation(user);
    if (rateLimit.response) {
      return rateLimit.response;
    }
    const reservation = rateLimit.reservation!;

    // 生成或使用现有的验证令牌
    let verificationToken = user.verification_token;
    let verificationTokenExpires = user.verification_token_expires;
    const tokenExpired = !verificationTokenExpires || new Date(verificationTokenExpires) <= new Date();
    if (!verificationToken || tokenExpired) {
      verificationToken = generateToken();
      verificationTokenExpires = new Date(reservation.nowMs + EMAIL_VERIFICATION_TTL_MS).toISOString();
    }

    const reserved = await reserveVerificationEmailSend(
      env,
      user.id,
      reservation,
      `verification_token = ?,
          verification_token_expires = ?,`,
      [
        verificationToken,
        verificationTokenExpires
      ]
    );

    if (!reserved) {
      return buildVerificationEmailCooldownResponse();
    }

    // 发送验证邮件
    const verificationEmail = generateVerificationEmail(
      user.email,
      verificationToken,
      env.APP_BASE_URL || 'https://my-flower-pots-api.example.com'
    );

    const emailSent = await sendEmail(verificationEmail, env);

    if (!emailSent) {
      return errorResponse('Failed to send verification email', 500);
    }

    return jsonResponse({
      success: true,
      message: 'Verification email sent successfully',
      retryAfterSeconds: Math.ceil(VERIFICATION_EMAIL_COOLDOWN_MS / 1000)
    });

  } catch (error) {
    console.error('Send verification email error:', error);
    return errorResponse(getClientSafeAuthErrorMessage(error, 'Failed to send verification email'), 500);
  }
}

/**
 * 处理刷新 JWT 令牌请求
 * 仅允许已通过当前 JWT 认证的用户续发令牌
 */
async function handleRefreshToken(env: any, userId: string | null): Promise<Response> {
  try {
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    // 验证用户存在
    const user = await env.DB
      .prepare('SELECT id, user_type, email, is_disabled FROM users WHERE id = ?')
      .bind(userId)
      .first();

    if (!user) {
      return errorResponse('Invalid user', 401);
    }

    // 检查用户是否被禁用
    if (user.is_disabled === 1) {
      return errorResponse('Account disabled', 403);
    }

    // 生成新的 JWT 令牌
    const jwtToken = await issueAuthToken(env, {
      userId: user.id,
      email: user.email || null,
      type: user.user_type
    });

    return jsonResponse({
      success: true,
      token: jwtToken,
      userId: user.id,
      userType: user.user_type
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    return errorResponse(getClientSafeAuthErrorMessage(error, 'Failed to refresh token'), 500);
  }
}
