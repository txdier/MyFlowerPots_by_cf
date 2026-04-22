import { jsonResponse, errorResponse } from '../utils/response-utils';
import { sendEmail, generateTransferEmail } from '../utils/email-service';
import { findAccessiblePot } from '../utils/pot-access-utils';

async function ensureTransferTargetMatches(
  env: any,
  userId: string,
  targetEmail: string | null
): Promise<Response | null> {
  if (!targetEmail) {
    return null;
  }

  const currentUser = await env.DB
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(userId)
    .first() as { email?: string | null } | null;

  if (!currentUser?.email) {
    return errorResponse('Current user email is unavailable for this transfer', 403);
  }

  if (currentUser.email.trim().toLowerCase() !== targetEmail.trim().toLowerCase()) {
    return errorResponse('This transfer is reserved for a different email address', 403);
  }

  return null;
}

export async function handleTransferRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  // 1️⃣ 获取转移详情 (使用 Token，免登录)
  if (request.method === 'GET' && path.match(/^\/api\/public\/transfer\/[^/]+$/)) {
    const token = path.split('/').pop();
    if (!token) return errorResponse('Token required', 400);
    return handleGetTransferDetail(token, env);
  }

  if (!userId) return errorResponse('Authentication required', 401);

  // 接收转移 (使用 Token)
  if (request.method === 'POST' && path.match(/^\/api\/transfer\/accept\/[^/]+$/)) {
    const token = path.split('/').pop();
    if (!token) return errorResponse('Token required', 400);
    return handleAcceptTransfer(token, userId, env);
  }

  // 3️⃣ 拒绝转移 (使用 Token)
  if (request.method === 'POST' && path.match(/^\/api\/transfer\/reject\/[^/]+$/)) {
    const token = path.split('/').pop();
    if (!token) return errorResponse('Token required', 400);
    return handleRejectTransfer(token, userId, env);
  }

  const segments = path.split('/');
  const potId = segments[4]; // /api/transfer/init/:potId or cancel/:potId

  // 4️⃣ 发起转移
  if (request.method === 'POST' && path.match(/^\/api\/transfer\/init\/[^/]+$/)) {
    return handleInitTransfer(request, potId!, userId, env);
  }

  // 5️⃣ 取消转移
  if (request.method === 'POST' && path.match(/^\/api\/transfer\/cancel\/[^/]+$/)) {
    return handleCancelTransfer(potId!, userId, env);
  }

  return errorResponse('Not Found', 404);
}

async function handleInitTransfer(request: Request, potId: string, userId: string, env: any): Promise<Response> {
  // 校验所有权
  const pot = await findAccessiblePot(env, potId, userId, 'owner', { select: 'p.id, p.name' });
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  // 解析目标邮箱
  let targetEmail = '';
  try {
    const body = await request.json();
    targetEmail = (body as any).targetEmail || '';
  } catch (e) {
    // 忽略解析错误
  }

  // 生成 Token 和 过期时间 (24小时)
  const transferToken = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // 更新数据库
  await env.DB.prepare(`
    UPDATE pots 
    SET transfer_token = ?, transfer_expires_at = ?, transfer_target_email = ?
    WHERE id = ?
  `).bind(transferToken, expiresAt, targetEmail || null, potId).run();

  // 发送邮件通知 (如果有邮箱)
  if (targetEmail) {
    const sender = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
    const senderName = sender?.display_name || sender?.email?.split('@')[0] || '一位好友';
    const appBaseUrl = env.APP_BASE_URL || 'https://app.kaside365.com';
    const transferLink = `${appBaseUrl.replace(/\/$/, '')}/pot-detail?transferToken=${transferToken}`;
    
    // 发送邮件
    const emailOptions = generateTransferEmail(targetEmail, pot.name, senderName, transferLink);
    await sendEmail(emailOptions, env);

    // 如果目标用户已在系统中，发送站内信
    const targetUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(targetEmail).first();
    if (targetUser) {
      await env.DB.prepare(`
        INSERT INTO messages (user_id, sender_id, type, title, content, related_id, extra_data)
        VALUES (?, ?, 'transfer_request', ?, ?, ?, ?)
      `).bind(
        targetUser.id,
        userId,
        '收到花盆移交请求',
        `“${senderName}” 想要向您移交花盆 “${pot.name}”。`,
        potId,
        JSON.stringify({ transferToken, potName: pot.name })
      ).run();
    }
  }

  return jsonResponse({ success: true, transferToken, expiresAt });
}

async function handleCancelTransfer(potId: string, userId: string, env: any): Promise<Response> {
  // 校验所有权
  const pot = await findAccessiblePot(env, potId, userId, 'owner', {
    select: 'p.id, p.name, p.transfer_target_email'
  });
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  // 更新花盆状态
  await env.DB.prepare(`
    UPDATE pots 
    SET transfer_token = NULL, transfer_expires_at = NULL, transfer_target_email = NULL
    WHERE id = ?
  `).bind(potId).run();

  // 如果有目标用户，发送取消通知消息 (可选)
  if (pot.transfer_target_email) {
    const targetUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(pot.transfer_target_email).first();
    if (targetUser) {
      // 将之前的移交消息标记为过期或删除
      await env.DB.prepare(`
        UPDATE messages 
        SET status = 'processed' 
        WHERE user_id = ? AND related_id = ? AND type = 'transfer_request' AND status = 'unread'
      `).bind(targetUser.id, potId).run();
    }
  }

  return jsonResponse({ success: true });
}

async function handleRejectTransfer(token: string, userId: string, env: any): Promise<Response> {
  // 查找对应花盆
  const pot = await env.DB.prepare(`
    SELECT id, name, user_id, transfer_target_email
    FROM pots 
    WHERE transfer_token = ?
  `).bind(token).first();

  if (!pot) return errorResponse('Transfer link invalid or expired', 404);

  const targetCheck = await ensureTransferTargetMatches(env, userId, pot.transfer_target_email || null);
  if (targetCheck) {
    return targetCheck;
  }

  // 清除移交信息
  await env.DB.prepare(`
    UPDATE pots 
    SET transfer_token = NULL, transfer_expires_at = NULL, transfer_target_email = NULL
    WHERE id = ?
  `).bind(pot.id).run();

  // 给原主人发个通知消息 (可选)
  await env.DB.prepare(`
    INSERT INTO messages (user_id, type, title, content, related_id)
    VALUES (?, 'system_info', ?, ?, ?)
  `).bind(
    pot.user_id,
    '移交请求被拒绝',
    `您对花盆 “${pot.name}” 的移交请求已被对方拒绝。`,
    pot.id
  ).run();

  // 更新当前用户的消息状态
  await env.DB.prepare(`
    UPDATE messages 
    SET status = 'processed' 
    WHERE user_id = ? AND related_id = ? AND type = 'transfer_request'
  `).bind(userId, pot.id).run();

  return jsonResponse({ success: true, message: 'Transfer rejected' });
}

async function handleAcceptTransfer(token: string, newUserId: string, env: any): Promise<Response> {
  // 查找对应花盆且 Token 未过期
  const pot = await env.DB.prepare(`
    SELECT id, user_id, transfer_expires_at, transfer_target_email
    FROM pots 
    WHERE transfer_token = ?
  `).bind(token).first();

  if (!pot) return errorResponse('Transfer link invalid or expired', 404);

  // 检查过期时间
  const now = new Date();
  const expiresAt = new Date(pot.transfer_expires_at);
  if (now > expiresAt) {
    return errorResponse('Transfer link has expired', 400);
  }

  // 不能转移给自己 (虽然逻辑上没大碍，但防止误操作)
  if (pot.user_id === newUserId) {
    return errorResponse('You already own this pot', 400);
  }

  const targetCheck = await ensureTransferTargetMatches(env, newUserId, pot.transfer_target_email || null);
  if (targetCheck) {
    return targetCheck;
  }

  // 执行转移：变更 Owner，清除 Token
  // 备注：原所有权计划指出转移后原主人移除或降级，这里我们直接变更 user_id。
  // 同时由于 migrations 中 pot_collaborators 有级联删除，或者我们手动清理。
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE pots 
      SET user_id = ?, transfer_token = NULL, transfer_expires_at = NULL, transfer_target_email = NULL, is_shared = 0, share_token = NULL
      WHERE id = ?
    `).bind(newUserId, pot.id),
    // 清理该花盆的所有协作关系 (交接给新主人后重新开始协作)
    env.DB.prepare('DELETE FROM pot_collaborators WHERE pot_id = ?').bind(pot.id),
    // 更新消息状态
    env.DB.prepare(`
      UPDATE messages 
      SET status = 'processed' 
      WHERE user_id = ? AND related_id = ? AND type = 'transfer_request'
    `).bind(newUserId, pot.id)
  ]);

  return jsonResponse({ success: true, message: 'Ownership transferred successfully' });
}

async function handleGetTransferDetail(token: string, env: any): Promise<Response> {
  const pot = await env.DB.prepare(`
    SELECT id, name, plant_type, note, image_url, plant_date
    FROM pots
    WHERE transfer_token = ? AND datetime(transfer_expires_at) > CURRENT_TIMESTAMP
  `).bind(token).first();

  if (!pot) return errorResponse('Transfer link invalid or expired', 404);

  return jsonResponse({ success: true, data: pot });
}
