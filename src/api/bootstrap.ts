import { jsonResponse, errorResponse } from '../utils/response-utils';
import { isAdmin } from './admin';
import { getCareRemindersData } from './care-schedules';

type PotStatusCounts = {
  active: number;
  archived: number;
};

function emptyBootstrapData() {
  return {
    user: null,
    potStatusCounts: { active: 0, archived: 0 },
    unreadCount: 0,
    supportUnreadCount: 0,
    careReminders: []
  };
}

function toUserResponse(user: any, adminStatus: boolean) {
  return {
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
  };
}

async function getPotStatusCounts(env: any, userId: string): Promise<PotStatusCounts> {
  const counts: PotStatusCounts = { active: 0, archived: 0 };
  const { results } = await env.DB.prepare(`
    SELECT COALESCE(status, 'active') as status, COUNT(*) as count
    FROM pots
    WHERE (
      user_id = ?
      OR id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?)
      OR id IN (SELECT pot_id FROM pot_viewers WHERE user_id = ?)
    )
    GROUP BY COALESCE(status, 'active')
  `).bind(userId, userId, userId).all();

  for (const row of results || []) {
    const status = String((row as any).status || 'active');
    if (status === 'archived') {
      counts.archived = Number((row as any).count || 0);
    } else {
      counts.active += Number((row as any).count || 0);
    }
  }

  return counts;
}

async function getUnreadCount(env: any, userId: string): Promise<number> {
  const unread: any = await env.DB.prepare(`
    SELECT COUNT(*) as unread_count
    FROM messages
    WHERE user_id = ? AND status = 'unread'
  `).bind(userId).first();

  return Number(unread?.unread_count || 0);
}

async function getSupportUnreadCount(env: any): Promise<number> {
  const unread: any = await env.DB.prepare(`
    SELECT COUNT(*) as unread_count
    FROM support_emails
    WHERE read = 0
  `).first();

  return Number(unread?.unread_count || 0);
}

export async function handleBootstrapRequest(
  request: Request,
  env: any,
  userId: string | null
): Promise<Response> {
  if (!userId) {
    return jsonResponse({
      success: true,
      ...emptyBootstrapData()
    });
  }

  try {
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

    const adminStatus = await isAdmin(request, env, userId, user);
    const [potStatusCounts, unreadCount, careReminders, supportUnreadCount] = await Promise.all([
      getPotStatusCounts(env, userId),
      getUnreadCount(env, userId),
      getCareRemindersData(env, userId),
      adminStatus ? getSupportUnreadCount(env) : Promise.resolve(0)
    ]);

    return jsonResponse({
      success: true,
      user: toUserResponse(user, adminStatus),
      potStatusCounts,
      unreadCount,
      supportUnreadCount,
      careReminders,
      careReminderCount: careReminders.length
    });
  } catch (error) {
    console.error('Bootstrap request error:', error);
    return errorResponse('Failed to load bootstrap data', 500);
  }
}
