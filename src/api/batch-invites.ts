import { errorResponse, jsonResponse } from '../utils/response-utils';

type BatchInvitePermission = 'viewer' | 'collaborator';

export async function handleBatchInvitesRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  await ensureBatchInviteTable(env);

  if (request.method === 'POST' && path.match(/^\/api\/batch-invites\/open\/[^/]+$/)) {
    const token = path.split('/')[4];
    return handleOpenBatchInvite(request, token!, env);
  }

  if (!userId) return errorResponse('Authentication required', 401);

  if (request.method === 'POST' && path === '/api/batch-invites') {
    return handleCreateBatchInvite(request, userId, env);
  }

  if (request.method === 'POST' && path.match(/^\/api\/batch-invites\/accept\/[^/]+$/)) {
    const token = path.split('/')[4];
    return handleAcceptBatchInvite(request, token!, userId, env);
  }

  return errorResponse('Not Found', 404);
}

async function ensureBatchInviteTable(env: any): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS pot_batch_invites (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      permission_type TEXT NOT NULL,
      pot_ids_json TEXT NOT NULL,
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
    `CREATE INDEX IF NOT EXISTS idx_pot_batch_invites_owner ON pot_batch_invites(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pot_batch_invites_token ON pot_batch_invites(token)`
  ];

  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

async function handleCreateBatchInvite(request: Request, userId: string, env: any): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { potIds?: string[]; permission?: BatchInvitePermission };
  const permission = normalizePermission(body.permission);
  if (!permission) return errorResponse('Invalid permission type', 400);

  const inputPotIds = uniquePotIds(body.potIds);
  if (inputPotIds.length === 0) return errorResponse('At least one pot is required', 400);

  const ownedPots = await loadOwnedPots(env, userId, inputPotIds);
  if (ownedPots.length === 0) return errorResponse('No owned pots available for batch invite', 400);

  const inviteId = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const potIdsJson = JSON.stringify(ownedPots.map((pot: any) => pot.id));

  await env.DB.prepare(`
    INSERT INTO pot_batch_invites (id, owner_id, permission_type, pot_ids_json, token, expires_at, max_views)
    VALUES (?, ?, ?, ?, ?, ?, 5)
  `).bind(inviteId, userId, permission, potIdsJson, token, expiresAt).run();

  const baseUrl = getAppBaseUrl(request, env);
  const inviteUrl = `${baseUrl.replace(/\/$/, '')}/index.html?batchInviteToken=${token}`;

  return jsonResponse({
    success: true,
    data: {
      token,
      inviteUrl,
      expiresAt,
      permissionType: permission,
      potCount: ownedPots.length,
      potNames: ownedPots.map((pot: any) => pot.name)
    }
  });
}

async function handleOpenBatchInvite(request: Request, token: string, env: any): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) return errorResponse('Session ID required', 400);

  const invite = await getActiveInvite(token, env);
  if (!invite) return errorResponse('Invite link invalid or expired', 400);
  const hasSameSession = invite.claim_session_id === sessionId;
  if (!hasSameSession && Number(invite.view_count) >= Number(invite.max_views)) {
    return errorResponse('Invite link view limit reached', 400);
  }

  const potIds = parseInvitePotIds(invite.pot_ids_json);
  const ownedPots = await loadOwnedPots(env, invite.owner_id, potIds);
  if (ownedPots.length === 0) return errorResponse('Invite pots are no longer available', 400);

  const shouldCountView = !hasSameSession;
  const nextRemainingViews = shouldCountView
    ? Math.max(0, Number(invite.max_views) - Number(invite.view_count) - 1)
    : Math.max(0, Number(invite.max_views) - Number(invite.view_count));

  await env.DB.prepare(`
    UPDATE pot_batch_invites
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
      remainingViews: nextRemainingViews,
      permissionType: invite.permission_type,
      potCount: ownedPots.length,
      potNames: ownedPots.map((pot: any) => pot.name)
    }
  });
}

async function handleAcceptBatchInvite(
  request: Request,
  token: string,
  userId: string,
  env: any
): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) return errorResponse('Session ID required', 400);

  const invite = await getActiveInvite(token, env);
  if (!invite) return errorResponse('Invite link invalid or expired', 400);
  if (!invite.claim_session_id || invite.claim_session_id !== sessionId) {
    return errorResponse('Invite link must be accepted on the same device that opened it', 400);
  }
  if (invite.owner_id === userId) {
    return errorResponse('Cannot accept your own batch invite', 400);
  }
  if (invite.claimed_by_user_id && invite.claimed_by_user_id !== userId) {
    return errorResponse('Invite link already claimed by another user', 400);
  }

  const permissionType = normalizePermission(invite.permission_type);
  if (!permissionType) return errorResponse('Invite permission invalid', 400);

  const potIds = parseInvitePotIds(invite.pot_ids_json);
  const ownedPots = await loadOwnedPots(env, invite.owner_id, potIds);
  if (ownedPots.length === 0) return errorResponse('Invite pots are no longer available', 400);

  const ownedPotIds = ownedPots.map((pot: any) => pot.id);
  const collaboratorPotIds = await loadRelationPotIds(env, 'pot_collaborators', ownedPotIds, userId);
  const viewerPotIds = await loadRelationPotIds(env, 'pot_viewers', ownedPotIds, userId);

  let addedCount = 0;
  let upgradedCount = 0;
  let skippedCount = 0;
  const statements: any[] = [
    env.DB.prepare(`
      UPDATE pot_batch_invites
      SET claimed_by_user_id = ?, used_at = datetime('now')
      WHERE token = ? AND used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `).bind(userId, token)
  ];

  for (const pot of ownedPots) {
    const isCollaborator = collaboratorPotIds.has(pot.id);
    const isViewer = viewerPotIds.has(pot.id);

    if (permissionType === 'viewer') {
      if (isCollaborator || isViewer) {
        skippedCount += 1;
        continue;
      }
      statements.push(
        env.DB.prepare('INSERT INTO pot_viewers (pot_id, user_id) VALUES (?, ?)')
          .bind(pot.id, userId)
      );
      addedCount += 1;
      continue;
    }

    if (isCollaborator) {
      skippedCount += 1;
      continue;
    }

    statements.push(
      env.DB.prepare('INSERT INTO pot_collaborators (pot_id, user_id) VALUES (?, ?)')
        .bind(pot.id, userId)
    );

    if (isViewer) {
      statements.push(
        env.DB.prepare('DELETE FROM pot_viewers WHERE pot_id = ? AND user_id = ?')
          .bind(pot.id, userId)
      );
      upgradedCount += 1;
    } else {
      addedCount += 1;
    }
  }

  await env.DB.batch(statements);

  if (addedCount > 0 || upgradedCount > 0) {
    await notifyOwnerOfBatchAccept(env, invite.owner_id, userId, permissionType, ownedPots, addedCount, upgradedCount);
  }

  return jsonResponse({
    success: true,
    data: {
      permissionType,
      potCount: ownedPots.length,
      addedCount,
      upgradedCount,
      skippedCount
    }
  });
}

async function notifyOwnerOfBatchAccept(
  env: any,
  ownerId: string,
  joinerUserId: string,
  permissionType: BatchInvitePermission,
  ownedPots: any[],
  addedCount: number,
  upgradedCount: number
): Promise<void> {
  try {
    const joiner = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(joinerUserId).first();
    const joinerName = joiner?.display_name || joiner?.email || '一位好友';
    const permissionLabel = permissionType === 'viewer' ? '查看权限' : '共同养护权限';
    const summary = addedCount > 0 && upgradedCount > 0
      ? `${joinerName} 已通过批量邀请获得 ${addedCount} 个花盆的${permissionLabel}，并升级了 ${upgradedCount} 个原有“仅查看”权限。`
      : upgradedCount > 0
        ? `${joinerName} 已通过批量邀请把 ${upgradedCount} 个花盆从“仅查看”升级为共同养护。`
        : `${joinerName} 已通过批量邀请获得 ${addedCount} 个花盆的${permissionLabel}。`;

    await env.DB.prepare(`
      INSERT INTO messages (user_id, sender_id, type, title, content, related_id)
      VALUES (?, ?, 'system_info', '批量邀请已被接受', ?, ?)
    `).bind(ownerId, joinerUserId, summary, ownedPots[0]?.id || null).run();
  } catch (error) {
    console.error('Failed to notify owner after batch invite accept:', error);
  }
}

async function getActiveInvite(token: string, env: any): Promise<any | null> {
  return env.DB.prepare(`
    SELECT *
    FROM pot_batch_invites
    WHERE token = ?
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
  `).bind(token).first();
}

async function loadOwnedPots(env: any, ownerId: string, potIds: string[]): Promise<any[]> {
  if (potIds.length === 0) return [];
  const placeholders = buildPlaceholders(potIds.length);
  const { results } = await env.DB.prepare(`
    SELECT id, name
    FROM pots
    WHERE user_id = ?
      AND id IN (${placeholders})
  `).bind(ownerId, ...potIds).all();
  return results || [];
}

async function loadRelationPotIds(
  env: any,
  tableName: 'pot_collaborators' | 'pot_viewers',
  potIds: string[],
  userId: string
): Promise<Set<string>> {
  if (potIds.length === 0) return new Set();
  const placeholders = buildPlaceholders(potIds.length);
  const { results } = await env.DB.prepare(`
    SELECT pot_id
    FROM ${tableName}
    WHERE user_id = ?
      AND pot_id IN (${placeholders})
  `).bind(userId, ...potIds).all();

  return new Set((results || []).map((item: any) => item.pot_id));
}

function normalizePermission(value: unknown): BatchInvitePermission | null {
  return value === 'viewer' || value === 'collaborator' ? value : null;
}

function uniquePotIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(
    input
      .map(item => typeof item === 'string' ? item.trim() : '')
      .filter(Boolean)
  )];
}

function parseInvitePotIds(value: string): string[] {
  try {
    return uniquePotIds(JSON.parse(value));
  } catch {
    return [];
  }
}

function buildPlaceholders(length: number): string {
  return Array.from({ length }, () => '?').join(', ');
}

function getAppBaseUrl(request: Request, env: any): string {
  const url = new URL(request.url);
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    return url.origin;
  }
  return env.APP_BASE_URL || url.origin;
}
