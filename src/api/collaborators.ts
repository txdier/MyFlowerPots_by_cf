import { jsonResponse, errorResponse } from '../utils/response-utils';

export async function handleCollaboratorsRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  if (!userId) return errorResponse('Authentication required', 401);

  const segments = path.split('/');
  const potId = segments[3]; // /api/collaborators/:potId

  // 1️⃣ 获取协作者列表
  if (request.method === 'GET' && path.match(/^\/api\/collaborators\/[^/]+$/)) {
    return handleGetCollaborators(potId!, userId, env);
  }

  // 2️⃣ 邀请协作者 (按邮箱)
  if (request.method === 'POST' && path.match(/^\/api\/collaborators\/[^/]+$/)) {
    return handleAddCollaborator(request, potId!, userId, env);
  }

  // 3️⃣ 移除协作者 或 离开协作
  if (request.method === 'DELETE' && path.match(/^\/api\/collaborators\/[^/]+(\/[^/]+)?$/)) {
    const targetUserId = segments[4];
    if (targetUserId) {
      return handleRemoveCollaborator(potId!, targetUserId, userId, env);
    } else {
      return handleLeaveCollaboration(potId!, userId, env);
    }
  }

  return errorResponse('Not Found', 404);
}

async function handleGetCollaborators(potId: string, userId: string, env: any): Promise<Response> {
  // 校验权限：仅主人能看列表？或者协作者也能看？
  // 按照需求，通常主人管理。
  const pot = await env.DB.prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  const { results } = await env.DB.prepare(`
    SELECT u.id, u.display_name, u.email, u.avatar_url, c.role, c.created_at
    FROM pot_collaborators c
    JOIN users u ON c.user_id = u.id
    WHERE c.pot_id = ?
  `).bind(potId).all();

  return jsonResponse({ success: true, data: results });
}

async function handleAddCollaborator(request: Request, potId: string, userId: string, env: any): Promise<Response> {
  const pot = await env.DB.prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  const body = await request.json();
  const { email } = body as { email: string };
  if (!email) return errorResponse('Email required', 400);

  // 查找用户
  const targetUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!targetUser) return errorResponse('User not found', 404);

  // 不能邀请自己
  if (targetUser.id === userId) return errorResponse('Cannot add yourself as a collaborator', 400);

  // 检查是否已经是协作者
  const existing = await env.DB.prepare('SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?')
    .bind(potId, targetUser.id).first();
  if (existing) return errorResponse('User is already a collaborator', 400);

  await env.DB.prepare('INSERT INTO pot_collaborators (pot_id, user_id) VALUES (?, ?)')
    .bind(potId, targetUser.id).run();

  // 为被邀请者发送通知消息
  try {
    const owner = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
    const potData = await env.DB.prepare('SELECT name FROM pots WHERE id = ?').bind(potId).first();
    const ownerName = owner?.display_name || owner?.email || '有人';
    
    await env.DB.prepare(`
      INSERT INTO messages (user_id, sender_id, type, title, content, related_id)
      VALUES (?, ?, 'collab_invite', '收到共同照料邀请', ?, ?)
    `).bind(
      targetUser.id, 
      userId, 
      `${ownerName} 邀请您共同照料花盆「${potData?.name || '未命名'}」。该花盆现在已出现在您的列表中。`,
      potId
    ).run();
  } catch (msgError) {
    console.error('Failed to send collab notification:', msgError);
  }

  return jsonResponse({ success: true });
}

async function handleRemoveCollaborator(potId: string, targetUserId: string, userId: string, env: any): Promise<Response> {
  // 仅限主人移除
  const pot = await env.DB.prepare('SELECT id, name FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  // 发送通知给被移除者 (可选)
  try {
    const owner = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
    const ownerName = owner?.display_name || owner?.email || '原主人';
    await env.DB.prepare(`
      INSERT INTO messages (user_id, type, title, content, related_id)
      VALUES (?, 'system_info', '协作关系已终止', ?, ?)
    `).bind(
      targetUserId,
      `${ownerName} 已将您从花盆「${pot.name}」的协作者列表中移除。`,
      potId
    ).run();
  } catch (e) {
    console.error('Failed to send removal notification:', e);
  }

  await env.DB.prepare('DELETE FROM pot_collaborators WHERE pot_id = ? AND user_id = ?')
    .bind(potId, targetUserId).run();

  return jsonResponse({ success: true });
}

async function handleLeaveCollaboration(potId: string, userId: string, env: any): Promise<Response> {
  // 协作者自己退出
  try {
    // 1. 获取花盆信息和主人ID
    const pot = await env.DB.prepare('SELECT user_id, name FROM pots WHERE id = ?').bind(potId).first();
    // 2. 获取当前退出者的名称
    const leaver = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
    
    if (pot && leaver) {
      const leaverName = leaver.display_name || leaver.email || '一名成员';
      // 3. 发送消息给主人
      await env.DB.prepare(`
        INSERT INTO messages (user_id, type, title, content, related_id)
        VALUES (?, 'system_info', '成员退出协作', ?, ?)
      `).bind(
        pot.user_id,
        `成员 ${leaverName} 已主动退出花盆「${pot.name}」的共同照料。`,
        potId
      ).run();
    }
  } catch (e) {
    console.error('Failed to send leave notification:', e);
  }

  await env.DB.prepare('DELETE FROM pot_collaborators WHERE pot_id = ? AND user_id = ?')
    .bind(potId, userId).run();

  return jsonResponse({ success: true });
}
