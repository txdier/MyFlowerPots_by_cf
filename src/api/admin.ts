import { jsonResponse, errorResponse } from '../utils/response-utils';
import { getTokenFromHeader } from '../utils/auth-utils';

export async function isAdmin(request: Request, env: any): Promise<boolean> {
    const token = getTokenFromHeader(request);
    if (!token) {
        console.error('isAdmin: No token found in header');
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
            .prepare('SELECT email FROM users WHERE id = ?')
            .bind(token)
            .first();

        if (!user || !user.email) {
            console.error('isAdmin: User not found or has no email for token:', token);
            return false;
        }

        const userEmail = user.email.toLowerCase();
        const isUserAdmin = adminEmails.includes(userEmail);

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
    url: URL
): Promise<Response> {
    // 1. 权限校验
    if (!(await isAdmin(request, env))) {
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
