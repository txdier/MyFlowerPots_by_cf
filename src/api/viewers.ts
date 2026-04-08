import { jsonResponse, errorResponse } from '../utils/response-utils';

export async function handleViewersRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  await ensureViewerTables(env);

  if (request.method === 'POST' && path.match(/^\/api\/viewers\/open\/[^/]+$/)) {
    const token = path.split('/')[4];
    return handleOpenInviteLink(request, token!, env);
  }

  if (!userId) return errorResponse('Authentication required', 401);

  if (request.method === 'POST' && path.match(/^\/api\/viewers\/invite\/[^/]+$/)) {
    const potId = path.split('/')[4];
    return handleCreateInviteLink(potId!, userId, env);
  }

  if (request.method === 'POST' && path.match(/^\/api\/viewers\/accept\/[^/]+$/)) {
    const token = path.split('/')[4];
    return handleAcceptInviteLink(request, token!, userId, env);
  }

  const segments = path.split('/');
  const potId = segments[3];

  if (request.method === 'GET' && path.match(/^\/api\/viewers\/[^/]+$/)) {
    return handleGetViewers(potId!, userId, env);
  }

  if (request.method === 'POST' && path.match(/^\/api\/viewers\/[^/]+$/)) {
    return handleAddViewer(request, potId!, userId, env);
  }

  if (request.method === 'DELETE' && path.match(/^\/api\/viewers\/[^/]+(\/[^/]+)?$/)) {
    const targetUserId = segments[4];
    if (targetUserId) {
      return handleRemoveViewer(potId!, targetUserId, userId, env);
    }
    return handleLeaveViewer(potId!, userId, env);
  }

  return errorResponse('Not Found', 404);
}

async function ensureViewerTables(env: any): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS pot_viewers (
      pot_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (pot_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS pot_view_invites (
      id TEXT PRIMARY KEY,
      pot_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      max_views INTEGER DEFAULT 5,
      view_count INTEGER DEFAULT 0,
      claim_session_id TEXT,
      claimed_by_user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_viewers_user ON pot_viewers(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_viewers_pot ON pot_viewers(pot_id)`,
    `CREATE INDEX IF NOT EXISTS idx_view_invites_pot ON pot_view_invites(pot_id)`,
    `CREATE INDEX IF NOT EXISTS idx_view_invites_token ON pot_view_invites(token)`
  ];

  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

async function handleGetViewers(potId: string, userId: string, env: any): Promise<Response> {
  const pot = await env.DB.prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  const { results } = await env.DB.prepare(`
    SELECT u.id, u.display_name, u.email, u.avatar_url, v.created_at
    FROM pot_viewers v
    JOIN users u ON v.user_id = u.id
    WHERE v.pot_id = ?
  `).bind(potId).all();

  return jsonResponse({ success: true, data: results || [] });
}

async function handleCreateInviteLink(potId: string, userId: string, env: any): Promise<Response> {
  const pot = await env.DB.prepare('SELECT id, name FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  const inviteId = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE pot_view_invites
      SET revoked_at = datetime('now')
      WHERE pot_id = ? AND owner_id = ? AND used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `).bind(potId, userId),
    env.DB.prepare(`
      INSERT INTO pot_view_invites (id, pot_id, owner_id, token, expires_at, max_views)
      VALUES (?, ?, ?, ?, ?, 5)
    `).bind(inviteId, potId, userId, token, expiresAt)
  ]);

  const baseUrl = env.APP_BASE_URL || 'https://app.kaside365.com';
  const inviteUrl = `${baseUrl.replace(/\/$/, '')}/pot-detail.html?viewerToken=${token}`;

  return jsonResponse({ success: true, data: { token, inviteUrl, expiresAt } });
}

async function handleOpenInviteLink(request: Request, token: string, env: any): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) return errorResponse('Session ID required', 400);

  const invite = await getActiveInvite(token, env);
  if (!invite) return errorResponse('Invite link invalid or expired', 400);
  const hasSameSession = invite.claim_session_id === sessionId;
  if (!hasSameSession && invite.view_count >= invite.max_views) return errorResponse('Invite link view limit reached', 400);

  const shouldCountView = !hasSameSession;
  const nextRemainingViews = shouldCountView
    ? Math.max(0, Number(invite.max_views) - Number(invite.view_count) - 1)
    : Math.max(0, Number(invite.max_views) - Number(invite.view_count));

  await env.DB.prepare(`
    UPDATE pot_view_invites
    SET
      view_count = CASE WHEN claim_session_id IS NULL OR claim_session_id <> ? THEN view_count + 1 ELSE view_count END,
      claim_session_id = ?
    WHERE token = ?
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
  `).bind(sessionId, sessionId, token).run();

  return jsonResponse({ success: true, data: { expiresAt: invite.expires_at, remainingViews: nextRemainingViews } });
}

async function handleAddViewer(request: Request, potId: string, userId: string, env: any): Promise<Response> {
  const pot = await env.DB.prepare('SELECT id, name FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  const body = await request.json() as { email?: string };
  const email = body.email?.trim();
  if (!email) return errorResponse('Email required', 400);

  const targetUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!targetUser) return errorResponse('User not found', 404);
  if (targetUser.id === userId) return errorResponse('Cannot add yourself as a viewer', 400);

  const collaborator = await env.DB.prepare('SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?')
    .bind(potId, targetUser.id).first();
  if (collaborator) return errorResponse('User already has edit access', 400);

  const existing = await env.DB.prepare('SELECT pot_id FROM pot_viewers WHERE pot_id = ? AND user_id = ?')
    .bind(potId, targetUser.id).first();
  if (existing) return errorResponse('User is already a viewer', 400);

  await env.DB.prepare('INSERT INTO pot_viewers (pot_id, user_id) VALUES (?, ?)')
    .bind(potId, targetUser.id).run();

  try {
    const owner = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
    const ownerName = owner?.display_name || owner?.email || '有人';
    await env.DB.prepare(`
      INSERT INTO messages (user_id, sender_id, type, title, content, related_id)
      VALUES (?, ?, 'system_info', '收到花盆查看邀请', ?, ?)
    `).bind(
      targetUser.id,
      userId,
      `${ownerName} 邀请您查看花盆「${pot.name}」。该花盆现在已出现在您的列表中，但您无法修改内容。`,
      potId
    ).run();
  } catch (error) {
    console.error('Failed to send viewer notification:', error);
  }

  return jsonResponse({ success: true });
}

async function handleAcceptInviteLink(request: Request, token: string, userId: string, env: any): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) return errorResponse('Session ID required', 400);

  const invite = await getActiveInvite(token, env);
  if (!invite) {
    const restored = await resolveExistingViewerInvite(token, userId, env);
    if (restored) return restored;
    return errorResponse('Invite link invalid or expired', 400);
  }
  if (!invite.claim_session_id || invite.claim_session_id !== sessionId) {
    return errorResponse('Invite link must be accepted on the same device that opened it', 400);
  }

  const pot = await env.DB.prepare('SELECT id, user_id, name FROM pots WHERE id = ?').bind(invite.pot_id).first();
  if (!pot) return errorResponse('Pot not found', 404);
  if (pot.user_id === userId) {
    return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: true, alreadyAccepted: true } });
  }

  const collaborator = await env.DB.prepare('SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?')
    .bind(invite.pot_id, userId).first();
  if (collaborator) {
    return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: true, alreadyAccepted: true } });
  }

  const existing = await env.DB.prepare('SELECT pot_id FROM pot_viewers WHERE pot_id = ? AND user_id = ?')
    .bind(invite.pot_id, userId).first();

  const claimedByOther = invite.claimed_by_user_id && invite.claimed_by_user_id !== userId;
  if (claimedByOther) return errorResponse('Invite link already claimed by another user', 400);

  const batch = [
    env.DB.prepare(`
      UPDATE pot_view_invites
      SET claimed_by_user_id = ?, used_at = datetime('now')
      WHERE token = ? AND used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `).bind(userId, token)
  ];

  if (!existing) {
    batch.push(env.DB.prepare('INSERT INTO pot_viewers (pot_id, user_id) VALUES (?, ?)').bind(invite.pot_id, userId));
  }

  await env.DB.batch(batch);

  try {
    if (!existing) {
      const joiner = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
      const joinerName = joiner?.display_name || joiner?.email || '一位好友';
      await env.DB.prepare(`
        INSERT INTO messages (user_id, sender_id, type, title, content, related_id)
        VALUES (?, ?, 'system_info', '有新好友获得查看权限', ?, ?)
      `).bind(
        pot.user_id,
        userId,
        `${joinerName} 已通过邀请链接获得花盆「${pot.name}」的查看权限。`,
        invite.pot_id
      ).run();
    }
  } catch (error) {
    console.error('Failed to notify owner after view invite accept:', error);
  }

  return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: !!existing } });
}

async function handleRemoveViewer(potId: string, targetUserId: string, userId: string, env: any): Promise<Response> {
  const pot = await env.DB.prepare('SELECT id, name FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  try {
    const owner = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
    const ownerName = owner?.display_name || owner?.email || '原主人';
    await env.DB.prepare(`
      INSERT INTO messages (user_id, type, title, content, related_id)
      VALUES (?, 'system_info', '查看权限已取消', ?, ?)
    `).bind(
      targetUserId,
      `${ownerName} 已取消您对花盆「${pot.name}」的查看权限。`,
      potId
    ).run();
  } catch (error) {
    console.error('Failed to notify viewer removal:', error);
  }

  await env.DB.prepare('DELETE FROM pot_viewers WHERE pot_id = ? AND user_id = ?').bind(potId, targetUserId).run();
  return jsonResponse({ success: true });
}

async function handleLeaveViewer(potId: string, userId: string, env: any): Promise<Response> {
  try {
    const pot = await env.DB.prepare('SELECT user_id, name FROM pots WHERE id = ?').bind(potId).first();
    const viewer = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
    if (pot && viewer) {
      const viewerName = viewer.display_name || viewer.email || '一位好友';
      await env.DB.prepare(`
        INSERT INTO messages (user_id, type, title, content, related_id)
        VALUES (?, 'system_info', '好友移除了查看权限', ?, ?)
      `).bind(
        pot.user_id,
        `${viewerName} 已将花盆「${pot.name}」从自己的“受邀查看”列表中移除。`,
        potId
      ).run();
    }
  } catch (error) {
    console.error('Failed to notify viewer leave:', error);
  }

  await env.DB.prepare('DELETE FROM pot_viewers WHERE pot_id = ? AND user_id = ?').bind(potId, userId).run();
  return jsonResponse({ success: true });
}

async function getActiveInvite(token: string, env: any): Promise<any | null> {
  return env.DB.prepare(`
    SELECT *
    FROM pot_view_invites
    WHERE token = ?
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
  `).bind(token).first();
}

async function getInviteByToken(token: string, env: any): Promise<any | null> {
  return env.DB.prepare(`
    SELECT *
    FROM pot_view_invites
    WHERE token = ?
  `).bind(token).first();
}

async function resolveExistingViewerInvite(token: string, userId: string, env: any): Promise<Response | null> {
  const invite = await getInviteByToken(token, env);
  if (!invite) return null;

  const pot = await env.DB.prepare(`
    SELECT id, user_id
    FROM pots
    WHERE id = ?
  `).bind(invite.pot_id).first();
  if (!pot) return null;

  if (pot.user_id === userId) {
    return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: true, alreadyAccepted: true } });
  }

  const collaborator = await env.DB.prepare(`
    SELECT 1
    FROM pot_collaborators
    WHERE pot_id = ? AND user_id = ?
  `).bind(invite.pot_id, userId).first();
  if (collaborator) {
    return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: true, alreadyAccepted: true } });
  }

  const viewer = await env.DB.prepare(`
    SELECT 1
    FROM pot_viewers
    WHERE pot_id = ? AND user_id = ?
  `).bind(invite.pot_id, userId).first();
  if (!viewer) return null;

  return jsonResponse({ success: true, data: { potId: invite.pot_id, alreadyJoined: true, alreadyAccepted: true } });
}
