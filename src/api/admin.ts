import { jsonResponse, errorResponse } from '../utils/response-utils';
import { extractObjectKeysFromUrls, deleteFilesFromR2 } from '../utils/storage-utils';
import { clearMemoryCache, deleteMemoryCachePrefix, getMemoryCacheStats } from '../utils/cache-utils';
import { getAnalytics, getDailyTrend, getAnalyticsDateString } from './analytics';
import { invalidatePlantCache } from './plants';

const DELETED_USER_PLACEHOLDER_ID = '__deleted_user__';
const DELETED_USER_PLACEHOLDER_NAME = '已删除用户';

function parseCsvEnv(value: any): string[] {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function isTruthyEnv(value: any): boolean {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function parseJsonObject(raw: any): Record<string, any> {
    if (!raw || typeof raw !== 'string') {
        return {};
    }

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function buildAnonymizedPotCommentMessage(extraDataRaw: any, fallbackContent: any): { content: string; extraData: string } {
    const extraData = parseJsonObject(extraDataRaw);
    const comment = typeof extraData.comment === 'string' ? extraData.comment.trim() : '';
    const replyToName = typeof extraData.replyToName === 'string' && extraData.replyToName.trim()
        ? extraData.replyToName.trim()
        : '一位成员';
    const isReply = Boolean(extraData.parentCommentId);
    const content = comment
        ? (isReply
            ? `${DELETED_USER_PLACEHOLDER_NAME} 回复 ${replyToName}：${comment}`
            : `${DELETED_USER_PLACEHOLDER_NAME}：${comment}`)
        : String(fallbackContent || '');

    return {
        content,
        extraData: JSON.stringify({
            ...extraData,
            senderName: DELETED_USER_PLACEHOLDER_NAME
        })
    };
}

async function ensureDeletedUserPlaceholder(env: any): Promise<void> {
    const existing = await env.DB
        .prepare('SELECT id FROM users WHERE id = ?')
        .bind(DELETED_USER_PLACEHOLDER_ID)
        .first();

    if (existing) {
        return;
    }

    await env.DB.prepare(`
        INSERT INTO users (
            id, user_type, display_name, email, email_verified, is_disabled, created_at
        ) VALUES (?, 'deleted_placeholder', ?, NULL, TRUE, 1, CURRENT_TIMESTAMP)
    `).bind(DELETED_USER_PLACEHOLDER_ID, DELETED_USER_PLACEHOLDER_NAME).run();
}

type AdminUserSnapshot = {
    email?: string | null;
    email_verified?: number | boolean | null;
    user_type?: string | null;
};

function isLocalDevelopmentRequest(request: Request): boolean {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === '127.0.0.1' || hostname === 'localhost';
}

export async function isAdmin(
    request: Request,
    env: any,
    userId: string | null,
    knownUser: AdminUserSnapshot | null = null
): Promise<boolean> {
    if (!userId) {
        console.error('isAdmin: No userId (token) provided');
        return false;
    }

    const isLocalDev = isLocalDevelopmentRequest(request);
    const adminEmails = parseCsvEnv(env.ADMIN_EMAILS).map((email) => email.toLowerCase());
    const adminUserIds = parseCsvEnv(env.ADMIN_USER_IDS);
    const devAdminEmails = isLocalDev ? parseCsvEnv(env.DEV_ADMIN_EMAILS).map((email) => email.toLowerCase()) : [];
    const devAdminUserIds = isLocalDev ? parseCsvEnv(env.DEV_ADMIN_USER_IDS) : [];
    const devAdminAnyEmailUser = isLocalDev && isTruthyEnv(env.DEV_ADMIN_ANY_EMAIL_USER);

    if (adminUserIds.includes(userId) || devAdminUserIds.includes(userId)) {
        return true;
    }

    try {
        // 根据 token (userId) 查找用户邮箱
        const user: any = knownUser || await env.DB
            .prepare('SELECT email, email_verified, user_type FROM users WHERE id = ?')
            .bind(userId)
            .first();

        if (!user) {
            console.error('isAdmin: User not found for userId:', userId);
            return false;
        }

        const userEmail = String(user.email || '').trim().toLowerCase();
        const isEmailUser = user.user_type === 'email' && !!userEmail;

        if (devAdminAnyEmailUser && isEmailUser) {
            return true;
        }

        if (userEmail && devAdminEmails.includes(userEmail)) {
            return true;
        }

        if (userEmail && adminEmails.includes(userEmail)) {
            // 生产环境邮箱白名单仍要求邮箱已验证
            if (user.email_verified !== 1) {
                console.warn(`isAdmin: User ${userEmail} is in admin list but email is not verified.`);
                return false;
            }
            return true;
        }

        console.warn('isAdmin: access denied', {
            userId,
            userEmail,
            isLocalDev,
            adminEmailsConfigured: adminEmails.length > 0,
            adminUserIdsConfigured: adminUserIds.length > 0,
            devAdminEmailsConfigured: devAdminEmails.length > 0,
            devAdminUserIdsConfigured: devAdminUserIds.length > 0,
            devAdminAnyEmailUser
        });
        return false;
    } catch (error) {
        console.error('isAdmin database error:', error);
        return false;
    }
}

export async function handleAdminRequest(
    request: Request,
    env: any,
    path: string,
    url: URL,
    userId: string | null
): Promise<Response> {
    // 1. 权限校验
    if (!(await isAdmin(request, env, userId))) {
        return errorResponse('Forbidden: Admin access required. Configure ADMIN_EMAILS / ADMIN_USER_IDS, or DEV_ADMIN_* for local development.', 403);
    }

    // 2. 路由分发

    // GET /api/admin/check - 校验管理权限
    if (path === '/api/admin/check' && request.method === 'GET') {
        return jsonResponse({ success: true, message: 'Admin access granted' });
    }

    // GET /api/admin/cache/stats - 查看当前 Worker 进程内存缓存状态
    if (path === '/api/admin/cache/stats' && request.method === 'GET') {
        return jsonResponse({ success: true, data: getMemoryCacheStats() });
    }

    // POST /api/admin/cache/clear - 清空内存缓存
    if (path === '/api/admin/cache/clear' && request.method === 'POST') {
        return handleClearCache(request);
    }

    // GET /api/admin/plants - 分页获取植物列表
    if (path === '/api/admin/plants' && request.method === 'GET') {
        return handleGetPlants(request, env, url);
    }

    // POST /api/admin/plants - 新增植物
    if (path === '/api/admin/plants' && request.method === 'POST') {
        return handleCreatePlant(request, env);
    }

    // POST /api/admin/plants/batch - 批量导入
    if (path === '/api/admin/plants/batch' && request.method === 'POST') {
        return handleBatchImport(request, env);
    }

    // DELETE /api/admin/plants/batch - 批量删除
    if (path === '/api/admin/plants/batch' && request.method === 'DELETE') {
        return handleBatchDelete(request, env);
    }

    // PUT /api/admin/plants/:id - 编辑植物
    if (path.startsWith('/api/admin/plants/') && request.method === 'PUT') {
        const id = path.split('/').pop();
        if (!id) return errorResponse('Missing plant ID', 400);
        return handleUpdatePlant(request, env, id);
    }

    // DELETE /api/admin/plants/:id - 删除植物
    if (path.startsWith('/api/admin/plants/') && request.method === 'DELETE') {
        const id = path.split('/').pop();
        if (!id) return errorResponse('Missing plant ID', 400);
        return handleDeletePlant(env, id);
    }

    // --- 用户管理 ---

    // GET /api/admin/users - 获取用户列表
    if (path === '/api/admin/users' && request.method === 'GET') {
        return handleGetUsers(request, env, url);
    }

    // PUT /api/admin/users/:id - 更新用户状态或限额
    if (path.startsWith('/api/admin/users/') && request.method === 'PUT') {
        const id = path.split('/').pop();
        if (!id) return errorResponse('Missing user ID', 400);
        return handleUpdateUser(request, env, id);
    }

    // DELETE /api/admin/users/:id - 彻底删除用户
    if (path.startsWith('/api/admin/users/') && request.method === 'DELETE') {
        const id = path.split('/').pop();
        if (!id) return errorResponse('Missing user ID', 400);
        return handleDeleteUser(env, id);
    }

    // GET /api/admin/analytics - 获取访问统计（含趋势和今日/昨日对比）
    if (path === '/api/admin/analytics' && request.method === 'GET') {
        return handleGetAnalytics(env, url);
    }

    return errorResponse('Not Found', 404);
}

async function handleClearCache(request: Request): Promise<Response> {
    try {
        const body = await request.json().catch(() => ({})) as { scope?: string; prefix?: string };
        const scope = String(body.scope || 'all').trim().toLowerCase();
        let cleared = 0;

        if (scope === 'all') {
            cleared = clearMemoryCache();
        } else if (scope === 'plants') {
            cleared = invalidatePlantCache();
        } else if (scope === 'prefix') {
            const prefix = String(body.prefix || '').trim();
            if (!prefix) {
                return errorResponse('Prefix is required when scope is prefix', 400);
            }
            cleared = deleteMemoryCachePrefix(prefix);
        } else {
            return errorResponse('Unsupported cache scope', 400);
        }

        return jsonResponse({
            success: true,
            scope,
            cleared,
            data: getMemoryCacheStats()
        });
    } catch (error) {
        console.error('Clear cache error:', error);
        return errorResponse('Failed to clear cache', 500);
    }
}

async function handleGetAnalytics(env: any, url: URL): Promise<Response> {
    try {
        const startDate = url.searchParams.get('startDate') || undefined;
        const endDate = url.searchParams.get('endDate') || undefined;

        // 获取页面统计数据
        const data = await getAnalytics(env, startDate, endDate);

        // 获取趋势数据（使用筛选日期或默认近30天）
        const today = getAnalyticsDateString(env);
        const thirtyDaysAgo = getAnalyticsDateString(env, -30);
        const trendStart = startDate || thirtyDaysAgo;
        const trendEnd = endDate || today;
        const trend = await getDailyTrend(env, trendStart, trendEnd);

        // 获取今日 & 昨日访问量
        const yesterday = getAnalyticsDateString(env, -1);
        const todayData = await getDailyTrend(env, today, today);
        const yesterdayData = await getDailyTrend(env, yesterday, yesterday);
        const todayVisits = todayData.reduce((s: number, r: any) => s + r.total_visits, 0);
        const yesterdayVisits = yesterdayData.reduce((s: number, r: any) => s + r.total_visits, 0);

        return jsonResponse({
            success: true,
            data,
            trend,
            today: todayVisits,
            yesterday: yesterdayVisits
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        return errorResponse('Failed to fetch analytics', 500);
    }
}

async function handleGetPlants(request: Request, env: any, url: URL): Promise<Response> {
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const search = url.searchParams.get('search') || '';
    const offset = (page - 1) * pageSize;

    try {
        let query = 'SELECT * FROM plants';
        let countQuery = 'SELECT COUNT(*) as total FROM plants';
        const params: any[] = [];

        if (search) {
            query += ' WHERE name LIKE ? OR id LIKE ?';
            countQuery += ' WHERE name LIKE ? OR id LIKE ?';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

        const plants = await env.DB.prepare(query)
            .bind(...params, pageSize, offset)
            .all();

        const totalResult = await env.DB.prepare(countQuery)
            .bind(...params)
            .first();

        // 加载别名
        const results = await Promise.all(plants.results.map(async (p: any) => {
            const synonyms = await env.DB.prepare('SELECT synonym FROM plant_synonyms WHERE plant_id = ?')
                .bind(p.id)
                .all();
            return {
                ...p,
                basic_info: JSON.parse(p.basic_info || '{}'),
                ornamental_features: JSON.parse(p.ornamental_features || '{}'),
                care_guide: JSON.parse(p.care_guide || '{}'),
                synonyms: synonyms.results.map((s: any) => s.synonym)
            };
        }));

        return jsonResponse({
            success: true,
            data: results,
            pagination: {
                page,
                pageSize,
                total: totalResult.total
            }
        });
    } catch (error) {
        console.error('Get plants error:', error);
        return errorResponse('Failed to fetch plants', 500);
    }
}

async function handleCreatePlant(request: Request, env: any): Promise<Response> {
    try {
        const data = await request.json() as any;
        const { id, name, category, care_difficulty, basic_info, ornamental_features, care_guide, image_url, synonyms } = data;

        if (!id || !name) {
            return errorResponse('ID and Name are required', 400);
        }

        // 检查 ID 是否已存在
        const existing = await env.DB.prepare('SELECT id FROM plants WHERE id = ?').bind(id).first();
        if (existing) {
            return errorResponse('Plant ID already exists', 409);
        }

        await env.DB.prepare(`
      INSERT INTO plants (id, name, category, care_difficulty, basic_info, ornamental_features, care_guide, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
            id,
            name,
            category || null,
            care_difficulty || null,
            JSON.stringify(basic_info || {}),
            JSON.stringify(ornamental_features || {}),
            JSON.stringify(care_guide || {}),
            image_url || null
        ).run();

        // 插入别名
        if (Array.isArray(synonyms) && synonyms.length > 0) {
            const stmt = env.DB.prepare('INSERT INTO plant_synonyms (plant_id, synonym) VALUES (?, ?)');
            const batch = synonyms.map((s: string) => stmt.bind(id, s));
            await env.DB.batch(batch);
        }

        invalidatePlantCache();
        return jsonResponse({ success: true, message: 'Plant created successfully' });
    } catch (error) {
        console.error('Create plant error:', error);
        return errorResponse('Failed to create plant', 500);
    }
}

async function handleUpdatePlant(request: Request, env: any, id: string): Promise<Response> {
    try {
        const data = await request.json() as any;
        const { name, category, care_difficulty, basic_info, ornamental_features, care_guide, image_url, synonyms } = data;

        await env.DB.prepare(`
      UPDATE plants SET 
        name = ?, 
        category = ?, 
        care_difficulty = ?, 
        basic_info = ?, 
        ornamental_features = ?, 
        care_guide = ?, 
        image_url = ?
      WHERE id = ?
    `).bind(
            name,
            category || null,
            care_difficulty || null,
            JSON.stringify(basic_info || {}),
            JSON.stringify(ornamental_features || {}),
            JSON.stringify(care_guide || {}),
            image_url || null,
            id
        ).run();

        // 更新别名：先删后增
        await env.DB.prepare('DELETE FROM plant_synonyms WHERE plant_id = ?').bind(id).run();
        if (Array.isArray(synonyms) && synonyms.length > 0) {
            const stmt = env.DB.prepare('INSERT INTO plant_synonyms (plant_id, synonym) VALUES (?, ?)');
            const batch = synonyms.map((s: string) => stmt.bind(id, s));
            await env.DB.batch(batch);
        }

        invalidatePlantCache();
        return jsonResponse({ success: true, message: 'Plant updated successfully' });
    } catch (error) {
        console.error('Update plant error:', error);
        return errorResponse('Failed to update plant', 500);
    }
}

async function handleDeletePlant(env: any, id: string): Promise<Response> {
    try {
        await env.DB.prepare('DELETE FROM plants WHERE id = ?').bind(id).run();
        // 别名表有外键级联删除
        invalidatePlantCache();
        return jsonResponse({ success: true, message: 'Plant deleted successfully' });
    } catch (error) {
        console.error('Delete plant error:', error);
        return errorResponse('Failed to delete plant', 500);
    }
}

async function handleBatchImport(request: Request, env: any): Promise<Response> {
    try {
        const plants = await request.json() as any[];
        if (!Array.isArray(plants)) return errorResponse('Invalid data format', 400);

        const results = { success: 0, failed: 0, errors: [] as string[] };

        for (const data of plants) {
            try {
                const id = data.id || data._id; // 兼容导入格式
                const name = data.basicInfo?.name || data.name;

                if (!id || !name) {
                    results.failed++;
                    results.errors.push(`Missing ID or Name for a plant`);
                    continue;
                }

                const basic_info = data.basicInfo || data.basic_info || {};
                const ornamental_features = data.ornamentalFeatures || data.ornamental_features || {};
                const care_guide = data.careGuide || data.care_guide || {};
                const synonyms = basic_info.synonyms || data.synonyms || [];
                const image_url = data.image_url || null;

                await env.DB.prepare(`
          INSERT OR REPLACE INTO plants (id, name, category, care_difficulty, basic_info, ornamental_features, care_guide, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
                    id,
                    name,
                    ornamental_features.category || data.category || null,
                    care_guide.careDifficulty || data.care_difficulty || null,
                    JSON.stringify(basic_info),
                    JSON.stringify(ornamental_features),
                    JSON.stringify(care_guide),
                    image_url
                ).run();

                // 更新别名
                await env.DB.prepare('DELETE FROM plant_synonyms WHERE plant_id = ?').bind(id).run();
                if (Array.isArray(synonyms) && synonyms.length > 0) {
                    const stmt = env.DB.prepare('INSERT INTO plant_synonyms (plant_id, synonym) VALUES (?, ?)');
                    const batch = synonyms.map((s: string) => stmt.bind(id, s));
                    await env.DB.batch(batch);
                }
                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Error importing ${data.id}: ${err.message}`);
            }
        }

        if (results.success > 0) {
            invalidatePlantCache();
        }
        return jsonResponse({ success: true, results });
    } catch (error) {
        console.error('Batch import error:', error);
        return errorResponse('Failed to process batch import', 500);
    }
}

async function handleBatchDelete(request: Request, env: any): Promise<Response> {
    try {
        const { ids } = await request.json() as { ids: string[] };
        if (!Array.isArray(ids) || ids.length === 0) return errorResponse('Invalid IDs', 400);

        const stmt = env.DB.prepare('DELETE FROM plants WHERE id = ?');
        const batch = ids.map(id => stmt.bind(id));
        await env.DB.batch(batch);

        invalidatePlantCache();
        return jsonResponse({ success: true, message: `Deleted ${ids.length} plants` });
    } catch (error) {
        console.error('Batch delete error:', error);
        return errorResponse('Failed to delete plants', 500);
    }
}
async function handleGetUsers(request: Request, env: any, url: URL): Promise<Response> {
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const search = url.searchParams.get('search') || '';
    const offset = (page - 1) * pageSize;

    try {
        let query = `
            SELECT 
                u.id, u.email, u.user_type, u.display_name, 
                u.email_verified, u.max_pots, u.is_disabled, 
                u.created_at, u.last_login,
                (SELECT COUNT(*) FROM pots WHERE user_id = u.id) as pot_count
            FROM users u
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM users';
        const params: any[] = [DELETED_USER_PLACEHOLDER_ID];

        query += ' WHERE u.id != ?';
        countQuery += ' WHERE id != ?';

        if (search) {
            query += ' AND (u.email LIKE ? OR u.display_name LIKE ? OR u.id LIKE ?)';
            countQuery += ' AND (email LIKE ? OR display_name LIKE ? OR id LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';

        const users = await env.DB.prepare(query)
            .bind(...params, pageSize, offset)
            .all();

        const totalResult = await env.DB.prepare(countQuery)
            .bind(...params)
            .first();

        return jsonResponse({
            success: true,
            data: users.results,
            pagination: {
                page,
                pageSize,
                total: totalResult.total
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        return errorResponse('Failed to fetch users', 500);
    }
}

async function handleUpdateUser(request: Request, env: any, id: string): Promise<Response> {
    try {
        const data = await request.json() as any;
        const { maxPots, isDisabled } = data;

        const updates: string[] = [];
        const params: any[] = [];

        if (maxPots !== undefined) {
            updates.push('max_pots = ?');
            params.push(maxPots === '' || maxPots === null ? null : parseInt(maxPots));
        }

        if (isDisabled !== undefined) {
            updates.push('is_disabled = ?');
            params.push(isDisabled ? 1 : 0);
        }

        if (updates.length === 0) {
            return errorResponse('No fields to update', 400);
        }

        params.push(id);

        await env.DB.prepare(`
            UPDATE users SET ${updates.join(', ')} WHERE id = ?
        `).bind(...params).run();

        return jsonResponse({ success: true, message: 'User updated successfully' });
    } catch (error) {
        console.error('Update user error:', error);
        return errorResponse('Failed to update user', 500);
    }
}

async function handleDeleteUser(env: any, id: string): Promise<Response> {
    try {
        console.log(`Starting deletion for user: ${id}`);
        if (id === DELETED_USER_PLACEHOLDER_ID) {
            return errorResponse('The deleted-user placeholder account cannot be removed', 400);
        }

        // 1. 查找用户是否存在
        const user = await env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ?').bind(id).first();
        if (!user) {
            console.log(`User ${id} not found`);
            return errorResponse('User not found', 404);
        }

        await ensureDeletedUserPlaceholder(env);

        // 2. 收集所有需要删除的图片资源
        const imageUrls: string[] = [];

        // 2.1 花盆图片
        console.log(`Querying pots for user ${id}`);
        const pots = await env.DB.prepare('SELECT id, image_url FROM pots WHERE user_id = ?').bind(id).all();
        if (pots.results) {
            pots.results.forEach((p: any) => {
                if (p.image_url) imageUrls.push(p.image_url);
            });
        }

        // 2.2 养护记录图片
        if (pots.results && pots.results.length > 0) {
            const potIds = pots.results.map((p: any) => p.id);
            const placeholders = potIds.map(() => '?').join(',');

            console.log(`Querying care records for pots: ${potIds.join(',')}`);
            try {
                const careRecords = await env.DB.prepare(`
                    SELECT image_url FROM care_records WHERE pot_id IN (${placeholders})
                `).bind(...potIds).all();
                if (careRecords.results) {
                    careRecords.results.forEach((r: any) => {
                        if (r.image_url) imageUrls.push(r.image_url);
                    });
                }
            } catch (e) {
                console.warn('Error querying care records, proceeding anyway:', e);
            }

            // 2.3 时间轴图片
            console.log(`Querying timelines for pots: ${potIds.join(',')}`);
            try {
                const timelines = await env.DB.prepare(`
                    SELECT images FROM timelines WHERE pot_id IN (${placeholders})
                `).bind(...potIds).all();
                if (timelines.results) {
                    timelines.results.forEach((t: any) => {
                        if (t.images) {
                            try {
                                const imgs = JSON.parse(t.images);
                                if (Array.isArray(imgs)) imageUrls.push(...imgs);
                            } catch (e) {
                                console.warn('解析时间轴图片 JSON 失败:', e);
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn('Error querying timelines, proceeding anyway:', e);
            }
        }

        // 3. 执行 R2 物理删除
        console.log(`Collecting R2 objects to delete. Collection size: ${imageUrls.length}`);
        if (imageUrls.length > 0) {
            try {
                const objectKeys = extractObjectKeysFromUrls(imageUrls);
                if (objectKeys.length > 0) {
                    console.log(`Deleting ${objectKeys.length} objects from R2`);
                    await deleteFilesFromR2(env, objectKeys);
                }
            } catch (e) {
                console.warn('Error during R2 deletion, proceeding with DB cleanup:', e);
            }
        }

        // 4. 执行数据库物理删除
        console.log(`Deleting all associated records and user ${id} from database`);
        const cleanupBatch = [
            env.DB.prepare('DELETE FROM pot_collaborators WHERE user_id = ?').bind(id),
            env.DB.prepare('DELETE FROM pot_viewers WHERE user_id = ?').bind(id),
            env.DB.prepare('UPDATE care_records SET user_id = ? WHERE user_id = ?').bind(DELETED_USER_PLACEHOLDER_ID, id),
            env.DB.prepare('UPDATE timelines SET user_id = ? WHERE user_id = ?').bind(DELETED_USER_PLACEHOLDER_ID, id),
            env.DB.prepare('UPDATE pot_comments SET sender_id = ? WHERE sender_id = ?').bind(DELETED_USER_PLACEHOLDER_ID, id),
            env.DB.prepare('UPDATE pot_collab_invites SET claimed_by_user_id = NULL WHERE claimed_by_user_id = ?').bind(id),
            env.DB.prepare('UPDATE pot_view_invites SET claimed_by_user_id = NULL WHERE claimed_by_user_id = ?').bind(id),
            env.DB.prepare('UPDATE pot_batch_invites SET claimed_by_user_id = NULL WHERE claimed_by_user_id = ?').bind(id),
            env.DB.prepare('DELETE FROM messages WHERE user_id = ?').bind(id),
            env.DB.prepare('DELETE FROM messages WHERE sender_id = ? AND type != ?').bind(id, 'pot_comment'),
            env.DB.prepare('DELETE FROM pot_collab_invites WHERE owner_id = ?').bind(id),
            env.DB.prepare('DELETE FROM pot_view_invites WHERE owner_id = ?').bind(id),
            env.DB.prepare('DELETE FROM pot_batch_invites WHERE owner_id = ?').bind(id)
        ];

        const potCommentMessages = await env.DB.prepare(`
            SELECT id, content, extra_data
            FROM messages
            WHERE sender_id = ? AND type = 'pot_comment'
        `).bind(id).all();

        for (const row of potCommentMessages.results || []) {
            const sanitized = buildAnonymizedPotCommentMessage((row as any).extra_data, (row as any).content);
            cleanupBatch.push(
                env.DB.prepare(`
                    UPDATE messages
                    SET sender_id = ?, content = ?, extra_data = ?
                    WHERE id = ?
                `).bind(
                    DELETED_USER_PLACEHOLDER_ID,
                    sanitized.content,
                    sanitized.extraData,
                    (row as any).id
                )
            );
        }

        const potIds = pots.results?.map((p: any) => p.id) || [];

        if (potIds.length > 0) {
            const placeholders = potIds.map(() => '?').join(',');
            // 手动清理子表，防止数据库未正确配置 ON DELETE CASCADE
            cleanupBatch.push(env.DB.prepare(`DELETE FROM care_schedules WHERE pot_id IN (${placeholders})`).bind(...potIds));
            cleanupBatch.push(env.DB.prepare(`DELETE FROM care_records WHERE pot_id IN (${placeholders})`).bind(...potIds));
            cleanupBatch.push(env.DB.prepare(`DELETE FROM timelines WHERE pot_id IN (${placeholders})`).bind(...potIds));
        }

        // 删除花盆本身
        cleanupBatch.push(env.DB.prepare('DELETE FROM pots WHERE user_id = ?').bind(id));
        // 最后删除用户
        cleanupBatch.push(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id));

        await env.DB.batch(cleanupBatch);

        console.log(`Successfully deleted user ${id} and all related records`);
        return jsonResponse({
            success: true,
            message: `User ${id} and all related data deleted successfully. Files checked: ${imageUrls.length}`
        });
    } catch (error: any) {
        console.error('Delete user error full stack:', error);
        return errorResponse(`Failed to delete user: ${error.message || String(error)}`, 500);
    }
}
