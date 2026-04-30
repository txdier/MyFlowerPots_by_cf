/// <reference types="@cloudflare/workers-types" />

/**
 * 动态分享卡片 Meta 注入
 *
 * 当用户分享花盆链接时（pot-detail?token=xxx），微信/社交媒体会抓取页面
 * 的 OG meta 标签用于预览。此函数使用 HTMLRewriter 将静态 HTML 中的占位 meta
 * 替换为真实的花盆名称、描述和图片，而无需修改前端 HTML 文件本身。
 *
 * 注意：用户上传的媒体文件（花盆图片等）仍存储在 R2，
 * 通过 img.kaside365.com 独立域名访问，与此函数无关。
 */
export async function servePotDetailWithMeta(
  response: Response,
  env: any,
  options: {
    shareToken?: string | null;
    id?: string | null;
    collabToken?: string | null;
    viewerToken?: string | null;
  }
): Promise<Response> {
  try {
    // 1. 从 D1 获取花盆基本信息
    // 支持按 token 查询（优先）或按 id 查询（需验证 is_shared）
    let pot: any = null;
    if (options.shareToken) {
      pot = await env.DB.prepare(`
        SELECT name, image_url, note, NULL as meta_prefix
        FROM pots
        WHERE share_token = ? AND is_shared = 1
      `).bind(options.shareToken).first();
    } else if (options.id) {
      pot = await env.DB.prepare(`
        SELECT name, image_url, note, NULL as meta_prefix
        FROM pots
        WHERE id = ? AND is_shared = 1
      `).bind(options.id).first();
    } else if (options.collabToken) {
      pot = await env.DB.prepare(`
        SELECT p.name, p.image_url, p.note, '邀请共同照料' as meta_prefix
        FROM pot_collab_invites i
        JOIN pots p ON p.id = i.pot_id
        WHERE i.token = ?
          AND i.used_at IS NULL
          AND i.revoked_at IS NULL
          AND datetime(i.expires_at) > datetime('now')
      `).bind(options.collabToken).first();
    } else if (options.viewerToken) {
      pot = await env.DB.prepare(`
        SELECT p.name, p.image_url, p.note, '邀请查看' as meta_prefix
        FROM pot_view_invites i
        JOIN pots p ON p.id = i.pot_id
        WHERE i.token = ?
          AND i.used_at IS NULL
          AND i.revoked_at IS NULL
          AND datetime(i.expires_at) > datetime('now')
      `).bind(options.viewerToken).first();
    }

    if (!pot) {
      console.log('servePotDetailWithMeta: 未找到对应的公开花盆数据');
      return response;
    }

    // 构建绝对路径图片地址 (微信要求 og:image 必须带域名)
    let fullImageUrl = pot.image_url || '';
    if (fullImageUrl && !fullImageUrl.startsWith('http')) {
      const baseUrl = env.APP_BASE_URL || 'https://app.kaside365.com';
      const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const cleanPath = fullImageUrl.startsWith('/') ? fullImageUrl : '/' + fullImageUrl;
      fullImageUrl = cleanBase + cleanPath;
    }

    const title = pot.meta_prefix
      ? `${pot.meta_prefix}：${pot.name} - 我的花盆`
      : `${pot.name} - 我的花盆`;

    console.log('servePotDetailWithMeta: 成功获取数据，准备注入:', title, '图片:', fullImageUrl);

    // 2. 使用 HTMLRewriter 动态修改 Meta 标签
    const rewriter = new (globalThis as any).HTMLRewriter()
      .on('title', {
        element(e: any) {
          e.setInnerContent(title);
        }
      })
      .on('meta[property="og:title"]', {
        element(e: any) {
          e.setAttribute('content', title);
        }
      })
      .on('meta[property="og:description"]', {
        element(e: any) {
          const desc = pot.note ? (pot.note.length > 50 ? pot.note.substring(0, 47) + '...' : pot.note) : '正在分享一盆可爱的植物';
          e.setAttribute('content', desc);
        }
      })
      .on('meta[property="og:image"]', {
        element(e: any) {
          if (fullImageUrl) {
            e.setAttribute('content', fullImageUrl);
          }
        }
      })
      .on('meta[name="description"]', {
        element(e: any) {
          const desc = pot.note ? (pot.note.length > 50 ? pot.note.substring(0, 47) + '...' : pot.note) : '正在分享一盆可爱的植物';
          e.setAttribute('content', desc);
        }
      })
      .on('meta[name="twitter:title"]', {
        element(e: any) {
          e.setAttribute('content', title);
        }
      })
      .on('meta[name="twitter:image"]', {
        element(e: any) {
          if (fullImageUrl) {
            e.setAttribute('content', fullImageUrl);
          }
        }
      });

    return rewriter.transform(response);
  } catch (err) {
    console.error('servePotDetailWithMeta error:', err);
    return response; // 失败时退回到原始响应
  }
}

export function servePublicPageWithSeo(response: Response, canonicalUrl: string): Response {
  try {
    const HTMLRewriterCtor = (globalThis as any).HTMLRewriter;
    if (!HTMLRewriterCtor) {
      const headers = new Headers(response.headers);
      headers.set('Link', `<${canonicalUrl}>; rel="canonical"`);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    const rewriter = new HTMLRewriterCtor()
      .on('link[rel="canonical"]', {
        element(e: any) {
          e.setAttribute('href', canonicalUrl);
        }
      })
      .on('meta[property="og:url"]', {
        element(e: any) {
          e.setAttribute('content', canonicalUrl);
        }
      })
      .on('meta[name="twitter:url"]', {
        element(e: any) {
          e.setAttribute('content', canonicalUrl);
        }
      });

    return rewriter.transform(response);
  } catch (err) {
    console.error('servePublicPageWithSeo error:', err);
    const headers = new Headers(response.headers);
    headers.set('Link', `<${canonicalUrl}>; rel="canonical"`);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
}
