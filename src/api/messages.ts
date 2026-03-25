import { jsonResponse, errorResponse } from '../utils/response-utils';

export async function handleMessagesRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  if (!userId) return errorResponse('Authentication required', 401);

  // GET /api/messages - 获取消息列表
  if (request.method === 'GET' && path === '/api/messages') {
    try {
      const messages = await env.DB.prepare(`
        SELECT * FROM messages 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 100
      `).bind(userId).all();
      return jsonResponse({ success: true, data: messages.results });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // GET /api/messages/unread-count - 获取未读数
  if (request.method === 'GET' && path === '/api/messages/unread-count') {
    try {
      const unread: any = await env.DB.prepare(`
        SELECT COUNT(*) as unread_count FROM messages 
        WHERE user_id = ? AND status = 'unread'
      `).bind(userId).first();
      return jsonResponse({ success: true, count: unread?.unread_count || 0 });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/:id/read - 标记已读
  if (request.method === 'POST' && path.match(/^\/api\/messages\/[^/]+\/read$/)) {
    try {
      const id = path.split('/')[3];
      await env.DB.prepare(`
        UPDATE messages SET status = 'read' 
        WHERE id = ? AND user_id = ? AND status = 'unread'
      `).bind(id, userId).run();
      return jsonResponse({ success: true });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/read-all - 全部标记已读
  if (request.method === 'POST' && path === '/api/messages/read-all') {
    try {
      await env.DB.prepare(`
        UPDATE messages SET status = 'read' 
        WHERE user_id = ? AND status = 'unread'
      `).bind(userId).run();
      return jsonResponse({ success: true });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // DELETE /api/messages/:id - 删除单条消息
  const deleteMatch = path.match(/^\/api\/messages\/([^/]+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    try {
      const id = deleteMatch[1];
      await env.DB.prepare(`
        DELETE FROM messages 
        WHERE id = ? AND user_id = ?
      `).bind(id, userId).run();
      return jsonResponse({ success: true });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/clear-read - 清理已读消息
  if (request.method === 'POST' && path === '/api/messages/clear-read') {
    try {
      await env.DB.prepare(`
        DELETE FROM messages 
        WHERE user_id = ? AND (status = 'read' OR status = 'processed')
      `).bind(userId).run();
      return jsonResponse({ success: true });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  return errorResponse('Not Found', 404);
}
