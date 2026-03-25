import {
  hashPassword,
  verifyPassword,
  generateToken,
  isValidEmail,
  isPasswordValid,
  getTokenFromHeader,
  generateJWT,
  verifyJWT
} from '../utils/auth-utils';

import {
  sendEmail,
  generateVerificationEmail,
  generatePasswordResetEmail,
  generateWelcomeEmail
} from '../utils/email-service';

import { isAdmin } from './admin';

import { jsonResponse, errorResponse } from '../utils/response-utils';

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
    return handleRefreshToken(request, env);
  }

  return errorResponse('Not Found', 404);
}

async function handleRegister(request: Request, env: any): Promise<Response> {
  try {
    const body = await request.json();
    const { email, password, displayName } = body;

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
    const verificationToken = generateToken();

    await env.DB
      .prepare(`
        INSERT INTO users (
          id, user_type, email, password_hash, display_name, 
          email_verified, verification_token, created_at
        ) VALUES (?, 'email', ?, ?, ?, FALSE, ?, CURRENT_TIMESTAMP)
      `)
      .bind(userId, email, passwordHash, displayName || null, verificationToken)
      .run();

    // 发送验证邮件（可选）
    if (verificationToken) {
      const verificationEmail = generateVerificationEmail(
        email,
        verificationToken,
        env.APP_BASE_URL || 'https://my-flower-pots-api.example.com'
      );
      await sendEmail(verificationEmail, env);
    }

    // 发送欢迎邮件
    const welcomeEmail = generateWelcomeEmail(
      email,
      displayName || null,
      env.APP_BASE_URL || 'https://my-flower-pots-api.example.com'
    );
    await sendEmail(welcomeEmail, env);

    const secret = env.JWT_SECRET || 'default-secret';
    const jwtToken = await generateJWT({ userId, email, type: 'email' }, secret);

    return jsonResponse({
      success: true,
      userId,
      token: jwtToken,
      email,
      displayName: displayName || null,
      emailVerified: false,
      message: 'Registration successful. You can now login.'
    });

  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse('Registration failed', 500);
  }
}

async function handleLogin(request: Request, env: any): Promise<Response> {
  try {
    const body = await request.json();
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

    // 更新最后登录时间
    await env.DB
      .prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(user.id)
      .run();

    // 生成 JWT 令牌
    const secret = env.JWT_SECRET || 'default-secret';
    const jwtToken = await generateJWT({ userId: user.id, email, type: 'email' }, secret);

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
    return errorResponse('Login failed', 500);
  }
}

async function handleIdentify(env: any): Promise<Response> {
  try {
    const userId = crypto.randomUUID();

    await env.DB
      .prepare(`INSERT INTO users (id, user_type) VALUES (?, 'anonymous')`)
      .bind(userId)
      .run();

    const secret = env.JWT_SECRET || 'default-secret';
    const jwtToken = await generateJWT({ userId, type: 'anonymous' }, secret);

    return jsonResponse({
      success: true,
      userId,
      token: jwtToken,
      userType: 'anonymous',
    });
  } catch (error) {
    console.error('Identify error:', error);
    return errorResponse('Failed to create anonymous user', 500);
  }
}

async function handleForgotPassword(request: Request, env: any): Promise<Response> {
  try {
    const body = await request.json();
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
    const body = await request.json();
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
      .prepare('SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > CURRENT_TIMESTAMP')
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
  try {
    const body = await request.json();
    const { anonymousUserId, email, password, displayName } = body;

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

    await env.DB
      .prepare(`
        INSERT INTO users (
          id, user_type, email, password_hash, display_name, 
          email_verified, created_at
        ) VALUES (?, 'email', ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
      `)
      .bind(newUserId, email, passwordHash, displayName || null)
      .run();

    // 迁移数据：将原匿名用户的所有数据转移到新用户
    const migrationStatements = [
      env.DB.prepare('UPDATE pots SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE care_records SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE timelines SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
      env.DB.prepare('UPDATE pot_collaborators SET user_id = ? WHERE user_id = ?').bind(newUserId, anonymousUserId),
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

    const secret = env.JWT_SECRET || 'default-secret';
    const jwtToken = await generateJWT({ userId: newUserId, email, type: 'email' }, secret);

    return jsonResponse({
      success: true,
      userId: newUserId,
      token: jwtToken,
      email,
      displayName: displayName || null,
      emailVerified: false,
      message: 'Account upgraded successfully. Your data has been migrated.'
    });

  } catch (error) {
    console.error('Upgrade error:', error);
    return errorResponse('Failed to upgrade account', 500);
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
      .prepare('SELECT id, email FROM users WHERE verification_token = ?')
      .bind(token)
      .first();

    if (!user) {
      return errorResponse('Invalid or expired verification token', 400);
    }

    // 更新用户为已验证
    await env.DB
      .prepare('UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE id = ?')
      .bind(user.id)
      .run();

    // 返回成功页面（HTML格式）
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verified - My Flower Pots</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: #4CAF50; font-size: 24px; margin-bottom: 20px; }
          .message { font-size: 18px; margin-bottom: 30px; }
          .button { 
            background-color: #4CAF50; color: white; padding: 12px 24px; 
            text-decoration: none; border-radius: 4px; font-weight: bold;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="success">✅ Email Verified Successfully!</div>
        <div class="message">Your email ${user.email} has been verified.</div>
        <p>You can now close this window and return to the app.</p>
        <a href="/" class="button">Return to App</a>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });

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
    const adminStatus = await isAdmin(request, env, userId);

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

    const body = await request.json();
    const { displayName, avatarUrl } = body;

    const updates: string[] = [];
    const params: any[] = [];

    if (displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(displayName.trim());
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

    const body = await request.json();
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

    const body = await request.json();
    const { newEmail } = body;

    if (!newEmail) {
      return errorResponse('New email is required', 400);
    }

    if (!isValidEmail(newEmail)) {
      return errorResponse('Invalid email format', 400);
    }

    // 检查当前用户
    const user = await env.DB
      .prepare('SELECT id, email, email_verified FROM users WHERE id = ?')
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

    // 生成验证令牌
    const verificationToken = generateToken();

    // 更新用户记录，设置新邮箱和验证令牌，标记为未验证
    await env.DB
      .prepare('UPDATE users SET new_email = ?, new_email_verification_token = ?, new_email_verification_expires = ? WHERE id = ?')
      .bind(
        newEmail,
        verificationToken,
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24小时有效
        userId
      )
      .run();

    // 发送验证邮件到新邮箱
    const verificationLink = `${env.APP_BASE_URL || 'https://my-flower-pots-api.example.com'}/api/auth/verify-new-email?token=${verificationToken}`;
    const verificationEmail = {
      to: newEmail,
      subject: 'Verify your new email for My Flower Pots',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Change Request</h2>
          <p>You have requested to change your email address for your My Flower Pots account.</p>
          <p>Current email: ${user.email}</p>
          <p>New email: ${newEmail}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" 
               style="background-color: #4CAF50; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px; font-weight: bold;">
              Verify New Email Address
            </a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationLink}</p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this change, please contact support immediately.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">
            For security reasons, please don't share this email with anyone.
          </p>
        </div>
      `,
      text: `Email Change Request\n\nYou have requested to change your email address for your My Flower Pots account.\nCurrent email: ${user.email}\nNew email: ${newEmail}\n\nClick this link to verify your new email: ${verificationLink}\n\nThis link will expire in 24 hours.\n\nIf you didn't request this change, please contact support immediately.`
    };

    await sendEmail(verificationEmail, env);

    return jsonResponse({
      success: true,
      message: 'Verification email sent to new email address'
    });

  } catch (error) {
    console.error('Change email error:', error);
    return errorResponse('Failed to process email change request', 500);
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

    // 返回成功页面
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Changed - My Flower Pots</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: #4CAF50; font-size: 24px; margin-bottom: 20px; }
          .message { font-size: 18px; margin-bottom: 30px; }
          .button { 
            background-color: #4CAF50; color: white; padding: 12px 24px; 
            text-decoration: none; border-radius: 4px; font-weight: bold;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="success">✅ Email Changed Successfully!</div>
        <div class="message">Your email has been updated to ${user.new_email}.</div>
        <p>You can now close this window and return to the app.</p>
        <a href="/" class="button">Return to App</a>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });

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
      .prepare('SELECT id, email, email_verified, verification_token FROM users WHERE id = ?')
      .bind(userId)
      .first();

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // 检查邮箱是否已验证
    if (user.email_verified === 1) {
      return errorResponse('Email already verified', 400);
    }

    // 生成或使用现有的验证令牌
    let verificationToken = user.verification_token;
    if (!verificationToken) {
      verificationToken = generateToken();
      await env.DB
        .prepare('UPDATE users SET verification_token = ? WHERE id = ?')
        .bind(verificationToken, user.id)
        .run();
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
      message: 'Verification email sent successfully'
    });

  } catch (error) {
    console.error('Send verification email error:', error);
    return errorResponse('Failed to send verification email', 500);
  }
}

/**
 * 处理刷新 JWT 令牌请求
 * 允许用户使用 userId 换取新的 JWT 令牌
 */
async function handleRefreshToken(request: Request, env: any): Promise<Response> {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return errorResponse('userId is required', 400);
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
    const secret = env.JWT_SECRET || 'default-secret';
    const jwtToken = await generateJWT({
      userId: user.id,
      email: user.email || null,
      type: user.user_type
    }, secret);

    return jsonResponse({
      success: true,
      token: jwtToken,
      userId: user.id,
      userType: user.user_type
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    return errorResponse('Failed to refresh token', 500);
  }
}
