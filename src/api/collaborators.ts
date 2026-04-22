import { jsonResponse, errorResponse } from '../utils/response-utils';
import { findAccessiblePot } from '../utils/pot-access-utils';

function isArchivedPot(pot: any): boolean {
  return String(pot?.status || 'active').toLowerCase() === 'archived';
}

export async function handleCollaboratorsRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  if (request.method === 'POST' && path.match(/^\/api\/collaborators\/open\/[^/]+$/)) {
    const token = path.split('/')[4];
    return handleOpenInviteLink(request, token!, env);
  }

  if (!userId) return errorResponse('Authentication required', 401);

  if (request.method === 'POST' && path.match(/^\/api\/collaborators\/invite\/[^/]+$/)) {
    const potId = path.split('/')[4];
    return handleCreateInviteLink(potId!, userId, env);
  }

  if (request.method === 'POST' && path.match(/^\/api\/collaborators\/accept\/[^/]+$/)) {
    const token = path.split('/')[4];
    return handleAcceptInviteLink(request, token!, userId, env);
  }

  const segments = path.split('/');
  const potId = segments[3];

  if (request.method === 'GET' && path.match(/^\/api\/collaborators\/[^/]+$/)) {
    return handleGetCollaborators(potId!, userId, env);
  }

  if (request.method === 'POST' && path.match(/^\/api\/collaborators\/[^/]+$/)) {
    return handleAddCollaborator(request, potId!, userId, env);
  }

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
  const pot = await findAccessiblePot(env, potId, userId, 'owner', { select: 'p.id' });
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  const { results } = await env.DB.prepare(`
    SELECT u.id, u.display_name, u.email, u.avatar_url, c.role, c.created_at
    FROM pot_collaborators c
    JOIN users u ON c.user_id = u.id
    WHERE c.pot_id = ?
  `).bind(potId).all();

  return jsonResponse({ success: true, data: results });
}

async function handleCreateInviteLink(potId: string, userId: string, env: any): Promise<Response> {
  const pot = await findAccessiblePot(env, potId, userId, 'owner', {
    select: "p.id, p.name, COALESCE(p.status, 'active') as status"
  });
  if (!pot) return errorResponse('Pot not found or access denied', 404);
  if (isArchivedPot(pot)) return errorResponse('Archived pots do not support collaborator invites', 400);

  const inviteId = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE pot_collab_invites
      SET revoked_at = datetime('now')
      WHERE pot_id = ? AND owner_id = ? AND used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `).bind(potId, userId),
    env.DB.prepare(`
      INSERT INTO pot_collab_invites (id, pot_id, owner_id, token, expires_at, max_views)
      VALUES (?, ?, ?, ?, ?, 5)
    `).bind(inviteId, potId, userId, token, expiresAt)
  ]);

  const baseUrl = env.APP_BASE_URL || 'https://app.kaside365.com';
  const inviteUrl = `${baseUrl.replace(/\/$/, '')}/pot-detail?collabToken=${token}`;

  return jsonResponse({
    success: true,
    data: {
      token,
      inviteUrl,
      expiresAt
    }
  });
}

async function handleOpenInviteLink(request: Request, token: string, env: any): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) return errorResponse('Session ID required', 400);

  const invite = await getActiveInvite(token, env);
  if (!invite) return errorResponse('Invite link invalid or expired', 400);

  const pot = await env.DB.prepare(`
    SELECT id, COALESCE(status, 'active') as status
    FROM pots
    WHERE id = ?
  `).bind(invite.pot_id).first();
  if (!pot) return errorResponse('Pot not found', 404);
  if (isArchivedPot(pot)) return errorResponse('Archived pots do not support collaborator invites', 400);

  const hasSameSession = invite.claim_session_id === sessionId;
  if (!hasSameSession && invite.view_count >= invite.max_views) {
    return errorResponse('Invite link view limit reached', 400);
  }

  const shouldCountView = !hasSameSession;
  const nextRemainingViews = shouldCountView
    ? Math.max(0, Number(invite.max_views) - Number(invite.view_count) - 1)
    : Math.max(0, Number(invite.max_views) - Number(invite.view_count));

  await env.DB.prepare(`
    UPDATE pot_collab_invites
    SET
      view_count = CASE WHEN claim_session_id IS NULL OR claim_session_id <> ? THEN view_count + 1 ELSE view_count END,
      claim_session_id = ?
    WHERE token = ?
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
  `).bind(sessionId, sessionId, token).run();

  return jsonResponse({
    success: true,
    data: {
      expiresAt: invite.expires_at,
      remainingViews: nextRemainingViews
    }
  });
}

async function handleAddCollaborator(request: Request, potId: string, userId: string, env: any): Promise<Response> {
  const pot = await findAccessiblePot(env, potId, userId, 'owner', {
    select: "p.id, COALESCE(p.status, 'active') as status"
  });
  if (!pot) return errorResponse('Pot not found or access denied', 404);
  if (isArchivedPot(pot)) return errorResponse('Archived pots do not support collaborators', 400);

  const body = await request.json();
  const { email } = body as { email: string };
  if (!email) return errorResponse('Email required', 400);

  const targetUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!targetUser) return errorResponse('User not found', 404);
  if (targetUser.id === userId) return errorResponse('Cannot add yourself as a collaborator', 400);

  const existing = await env.DB.prepare('SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?')
    .bind(potId, targetUser.id).first();
  if (existing) return errorResponse('User is already a collaborator', 400);

  await env.DB.prepare('INSERT INTO pot_collaborators (pot_id, user_id) VALUES (?, ?)')
    .bind(potId, targetUser.id).run();
  await env.DB.prepare('DELETE FROM pot_viewers WHERE pot_id = ? AND user_id = ?')
    .bind(potId, targetUser.id).run();

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

async function handleAcceptInviteLink(request: Request, token: string, userId: string, env: any): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) return errorResponse('Session ID required', 400);

  const invite = await getActiveInvite(token, env);
  if (!invite) {
    const restored = await resolveExistingCollaboratorInvite(token, userId, env);
    if (restored) return restored;
    return errorResponse('Invite link invalid or expired', 400);
  }

  if (!invite.claim_session_id || invite.claim_session_id !== sessionId) {
    return errorResponse('Invite link must be accepted on the same device that opened it', 400);
  }
  if (invite.view_count > invite.max_views) {
    return errorResponse('Invite link view limit reached', 400);
  }

  const pot = await env.DB.prepare(`
    SELECT id, user_id, name, COALESCE(status, 'active') as status
    FROM pots
    WHERE id = ?
  `).bind(invite.pot_id).first();
  if (!pot) return errorResponse('Pot not found', 404);
  if (isArchivedPot(pot)) return errorResponse('Archived pots do not support collaborator invites', 400);
  if (pot.user_id === userId) {
    return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: true, alreadyAccepted: true } });
  }

  const existing = await env.DB.prepare('SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?')
    .bind(invite.pot_id, userId).first();

  const claimedByOther = invite.claimed_by_user_id && invite.claimed_by_user_id !== userId;
  if (claimedByOther) {
    return errorResponse('Invite link already claimed by another user', 400);
  }

  const batch = [
    env.DB.prepare(`
      UPDATE pot_collab_invites
      SET claimed_by_user_id = ?, used_at = datetime('now')
      WHERE token = ? AND used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `).bind(userId, token)
  ];

  if (!existing) {
    batch.push(
      env.DB.prepare('INSERT INTO pot_collaborators (pot_id, user_id) VALUES (?, ?)')
        .bind(invite.pot_id, userId),
      env.DB.prepare('DELETE FROM pot_viewers WHERE pot_id = ? AND user_id = ?')
        .bind(invite.pot_id, userId)
    );
  }

  await env.DB.batch(batch);

  if (!existing) {
    try {
      const joiner = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
      const joinerName = joiner?.display_name || joiner?.email || '一位好友';
      await env.DB.prepare(`
        INSERT INTO messages (user_id, sender_id, type, title, content, related_id)
        VALUES (?, ?, 'system_info', '有新成员加入共同照料', ?, ?)
      `).bind(
        pot.user_id,
        userId,
        `${joinerName} 已通过邀请链接加入花盆「${pot.name}」的共同照料。`,
        invite.pot_id
      ).run();
    } catch (error) {
      console.error('Failed to notify owner after invite accept:', error);
    }
  }

  return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: !!existing } });
}

async function handleRemoveCollaborator(potId: string, targetUserId: string, userId: string, env: any): Promise<Response> {
  const pot = await findAccessiblePot(env, potId, userId, 'owner', {
    select: 'p.id, p.name'
  });
  if (!pot) return errorResponse('Pot not found or access denied', 404);

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
  try {
    const pot = await env.DB.prepare('SELECT user_id, name FROM pots WHERE id = ?').bind(potId).first();
    const leaver = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();

    if (pot && leaver) {
      const leaverName = leaver.display_name || leaver.email || '一名成员';
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

async function getActiveInvite(token: string, env: any): Promise<any | null> {
  return env.DB.prepare(`
    SELECT *
    FROM pot_collab_invites
    WHERE token = ?
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
  `).bind(token).first();
}

async function getInviteByToken(token: string, env: any): Promise<any | null> {
  return env.DB.prepare(`
    SELECT *
    FROM pot_collab_invites
    WHERE token = ?
  `).bind(token).first();
}

async function resolveExistingCollaboratorInvite(token: string, userId: string, env: any): Promise<Response | null> {
  const invite = await getInviteByToken(token, env);
  if (!invite) return null;

  const pot = await env.DB.prepare(`
    SELECT id, user_id, COALESCE(status, 'active') as status
    FROM pots
    WHERE id = ?
  `).bind(invite.pot_id).first();
  if (!pot) return null;
  if (isArchivedPot(pot)) return null;

  if (pot.user_id === userId) {
    return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: true, alreadyAccepted: true } });
  }

  const collaborator = await env.DB.prepare(`
    SELECT 1
    FROM pot_collaborators
    WHERE pot_id = ? AND user_id = ?
  `).bind(invite.pot_id, userId).first();

  if (!collaborator) return null;

  return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: true, alreadyAccepted: true } });
}
