/**
 * Support inbox API handlers.
 * Routes (all under /api/admin/support/, protected by existing admin auth):
 *   GET    /api/admin/support/emails           — list emails (paginated)
 *   GET    /api/admin/support/emails/:id       — get email + replies (marks read)
 *   POST   /api/admin/support/emails/:id/reply — send reply via Resend
 *   PATCH  /api/admin/support/emails/:id/read  — mark as read
 *   DELETE /api/admin/support/emails/:id       — delete email
 */

import { corsResponse } from '../utils/response-utils';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function handleSupportRequest(
  request: Request,
  env: any,
  path: string,
  url: URL
): Promise<Response> {
  const method = request.method;

  // Strip the /api/admin/support prefix to get the sub-path
  const subPath = path.replace(/^\/api\/admin\/support/, '');

  // ── GET /emails ───────────────────────────────────────────────────────────
  if (subPath === '/emails' && method === 'GET') {
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    const { results } = await env.DB.prepare(
      `SELECT id, from_addr, to_addr, subject, received_at, read, replied
       FROM support_emails ORDER BY received_at DESC LIMIT ? OFFSET ?`
    )
      .bind(limit, offset)
      .all();

    const { results: countResult } = await env.DB.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) as unread
       FROM support_emails`
    ).all();

    return json({ emails: results, meta: countResult[0], page });
  }

  // ── GET /emails/:id ───────────────────────────────────────────────────────
  const emailMatch = subPath.match(/^\/emails\/([^/]+)$/);
  if (emailMatch && method === 'GET') {
    const id = emailMatch[1];

    const email = await env.DB.prepare(
      `SELECT * FROM support_emails WHERE id = ?`
    )
      .bind(id)
      .first();

    if (!email) return json({ error: 'Email not found' }, 404);

    // Mark as read
    await env.DB.prepare(
      `UPDATE support_emails SET read = 1 WHERE id = ?`
    ).bind(id).run();

    // Fetch replies
    const { results: replies } = await env.DB.prepare(
      `SELECT * FROM support_replies WHERE email_id = ? ORDER BY sent_at ASC`
    )
      .bind(id)
      .all();

    // Parse attachments json if exists
    if (email.attachments && typeof email.attachments === 'string') {
      try {
        email.attachments = JSON.parse(email.attachments);
      } catch(e) {
        email.attachments = [];
      }
    }

    return json({ ...email, read: 1, replies });
  }

  // ── GET /emails/:id/attachments/:filename ─────────────────────────────────
  const attachmentMatch = subPath.match(/^\/emails\/([^/]+)\/attachments\/(.+)$/);
  if (attachmentMatch && method === 'GET') {
    const id = attachmentMatch[1];
    const filename = decodeURIComponent(attachmentMatch[2]);
    
    if (!env.STATIC_BUCKET) {
      return json({ error: 'R2 Storage unconfigured' }, 500);
    }
    
    const r2Key = `support-attachments/${id}/${filename}`;
    const object = await env.STATIC_BUCKET.get(r2Key);
    
    if (!object) {
      return json({ error: 'Attachment not found v2' }, 404);
    }
    
    const resHeaders = new Headers();
    object.writeHttpMetadata(resHeaders);
    resHeaders.set('etag', object.httpEtag);
    // Force download with the correct filename
    resHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    
    return new Response(object.body, { headers: resHeaders });
  }

  // ── POST /emails/:id/reply ────────────────────────────────────────────────
  const replyMatch = subPath.match(/^\/emails\/([^/]+)\/reply$/);
  if (replyMatch && method === 'POST') {
    const id = replyMatch[1];

    const email = await env.DB.prepare(
      `SELECT id, from_addr, subject, text_body FROM support_emails WHERE id = ?`
    )
      .bind(id)
      .first() as { id: string; from_addr: string; subject: string; text_body: string } | null;

    if (!email) return json({ error: 'Email not found' }, 404);

    let body = '';
    try {
      const bodyData = (await request.json()) as { body?: string };
      body = bodyData.body?.trim() ?? '';
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body) return json({ error: 'Reply body is required' }, 400);

    // Build reply subject
    const replySubject = email.subject.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject}`;

    // Sender identity specifically for support
    const fromAddress = env.SUPPORT_EMAIL_FROM ?? 'support@kaside365.com';
    const fromName = env.SUPPORT_EMAIL_FROM_NAME ?? 'My Flower Pots Support';

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [email.from_addr],
        subject: replySubject,
        text: body,
        html: `<p style="font-family:sans-serif;line-height:1.6">${body.replace(/\n/g, '<br>')}</p>
               <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
               <blockquote style="color:#888;border-left:3px solid #ddd;padding-left:12px;margin:0;font-size:0.9em">
                 <p style="margin:0 0 4px;font-size:0.85em;color:#aaa">原始消息：</p>
                 ${email.text_body.replace(/\n/g, '<br>')}
               </blockquote>`,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend error:', err);
      return json({ error: `Failed to send email: ${err}` }, 502);
    }

    // Save reply record
    const replyId = crypto.randomUUID();
    const sentAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO support_replies (id, email_id, body, sent_at) VALUES (?, ?, ?, ?)`
    )
      .bind(replyId, id, body, sentAt)
      .run();

    await env.DB.prepare(
      `UPDATE support_emails SET replied = 1 WHERE id = ?`
    ).bind(id).run();

    return json({ success: true, replyId, sentAt });
  }

  // ── PATCH /emails/:id/read ────────────────────────────────────────────────
  const readMatch = subPath.match(/^\/emails\/([^/]+)\/read$/);
  if (readMatch && method === 'PATCH') {
    const id = readMatch[1];
    const result = await env.DB.prepare(
      `UPDATE support_emails SET read = 1 WHERE id = ?`
    ).bind(id).run();

    if (result.meta.changes === 0) return json({ error: 'Email not found' }, 404);
    return json({ success: true });
  }

  // ── DELETE /emails/:id ────────────────────────────────────────────────────
  const deleteMatch = subPath.match(/^\/emails\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const id = deleteMatch[1];
    // Cascade deletes replies via FK constraint
    await env.DB.prepare(
      `DELETE FROM support_emails WHERE id = ?`
    ).bind(id).run();
    return json({ success: true });
  }

  return json({ error: 'Not found' }, 404);
}
