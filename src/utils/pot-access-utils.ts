export type PotAccessMode = 'owner' | 'manage' | 'view';

type PotAccessOptions = {
  allowArchived?: boolean;
  select?: string;
};

function buildAccessCondition(mode: PotAccessMode): string {
  if (mode === 'owner') {
    return 'p.user_id = ?';
  }
  if (mode === 'manage') {
    return '(p.user_id = ? OR pc.user_id IS NOT NULL)';
  }
  return '(p.user_id = ? OR pc.user_id IS NOT NULL OR pv.user_id IS NOT NULL)';
}

export async function findAccessiblePot(
  env: any,
  potId: string,
  userId: string | null,
  mode: PotAccessMode,
  options: PotAccessOptions = {}
): Promise<any | null> {
  if (!potId || !userId) return null;

  const selectColumns = options.select || "p.id, p.user_id, COALESCE(p.status, 'active') as status";
  const archivedClause = options.allowArchived === false
    ? "AND COALESCE(p.status, 'active') = 'active'"
    : '';

  return env.DB.prepare(`
    SELECT ${selectColumns}
    FROM pots p
    LEFT JOIN pot_collaborators pc
      ON p.id = pc.pot_id AND pc.user_id = ?
    LEFT JOIN pot_viewers pv
      ON p.id = pv.pot_id AND pv.user_id = ?
    WHERE p.id = ?
      ${archivedClause}
      AND ${buildAccessCondition(mode)}
  `).bind(userId, userId, potId, userId).first();
}

export function requireAuthenticatedUser(token: string | null): string | null {
  return token ? String(token) : null;
}
