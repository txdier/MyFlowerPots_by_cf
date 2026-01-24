import { jsonResponse, errorResponse } from '../utils/response-utils';
import { getTokenFromHeader } from '../utils/auth-utils';
import { extractObjectKeysFromUrls, deleteFilesFromR2 } from '../utils/storage-utils';

export async function isAdmin(request: Request, env: any, userId: string | null): Promise<boolean> {
    if (!userId) {
        console.error('isAdmin: No userId (token) provided');
        return false;
    }

    // 获取管理员邮箱列表
    const adminEmailsAttr = env.ADMIN_EMAILS || '';
    if (!adminEmailsAttr) {
        console.error('isAdmin: ADMIN_EMAILS env var is missing or empty');
        return false;
    }

    const adminEmails = adminEmailsAttr.split(',').map((e: string) => e.trim().toLowerCase()).filter((e: string) => e.length > 0);

    if (adminEmails.length === 0) {
        console.error('isAdmin: No valid admin emails after parsing');
        return false;
    }

    try {
        // 根据 token (userId) 查找用户邮箱
        const user: any = await env.DB
            .prepare('SELECT email, email_verified FROM users WHERE id = ?')
            .bind(userId)
            .first();

        if (!user || !user.email) {
            console.error('isAdmin: User not found or has no email for userId:', userId);
            return false;
        }

        const userEmail = user.email.toLowerCase();
        const isUserAdmin = adminEmails.includes(userEmail);

        // 安全加固：管理员必须是已验证邮箱的用户
        if (isUserAdmin && user.email_verified !== 1) {
            console.warn(`isAdmin: User ${userEmail} is in admin list but email is not verified.`);
            return false;
        }

        if (!isUserAdmin) {
            console.warn(`isAdmin: User ${userEmail} is not in admin list:`, adminEmails);
        }

        return isUserAdmin;
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
        return errorResponse('Forbidden: Admin access required. Please verify your email is in ADMIN_EMAILS.', 403);
    }

    // 2. 路由分发

    // GET /api/admin/check - 校验管理权限
    if (path === '/api/admin/check' && request.method === 'GET') {
        return jsonResponse({ success: true, message: 'Admin access granted' });
    }

    // GET /api/admin/plants - 分页获取植物列表
    if (path === '/api/admin/plants' && request.method === 'GET') {
        return handleGetPlants(request, env, url);
    }

    // POST /api/admin/plants - 新增植物
    if (path === '/api/admin/plants' && request.method === 'POST') {
        return handleCreatePlant(request, env);
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

    // POST /api/admin/plants/batch - 批量导入
    if (path === '/api/admin/plants/batch' && request.method === 'POST') {
        return handleBatchImport(request, env);
    }

    // DELETE /api/admin/plants/batch - 批量删除
    if (path === '/api/admin/plants/batch' && request.method === 'DELETE') {
        return handleBatchDelete(request, env);
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

    return errorResponse('Not Found', 404);
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
        const params: any[] = [];

        if (search) {
            query += ' WHERE u.email LIKE ? OR u.display_name LIKE ? OR u.id LIKE ?';
            countQuery += ' WHERE email LIKE ? OR display_name LIKE ? OR id LIKE ?';
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
        // 1. 查找用户是否存在
        const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
        if (!user) {
            console.log(`User ${id} not found`);
            return errorResponse('User not found', 404);
        }

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
        const cleanupBatch = [];

        const potIds = pots.results?.map((p: any) => p.id) || [];

        if (potIds.length > 0) {
            const placeholders = potIds.map(() => '?').join(',');
            // 手动清理子表，防止数据库未正确配置 ON DELETE CASCADE
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
