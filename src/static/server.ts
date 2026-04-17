/// <reference types="@cloudflare/workers-types" />

/**
 * 动态分享卡片 Meta 注入
 *
 * 当用户分享花盆链接时（pot-detail.html?token=xxx），微信/社交媒体会抓取页面
 * 的 OG meta 标签用于预览。此函数使用 HTMLRewriter 将静态 HTML 中的占位 meta
 * 替换为真实的花盆名称、描述和图片，而无需修改前端 HTML 文件本身。
 *
 * 注意：用户上传的媒体文件（花盆图片等）仍存储在 R2，
 * 通过 img.kaside365.com 独立域名访问，与此函数无关。
 */
export async function servePotDetailWithMeta(
  response: Response,
  env: any,
  token: string | null,
  id: string | null
): Promise<Response> {
  try {
    // 1. 从 D1 获取花盆基本信息
    // 支持按 token 查询（优先）或按 id 查询（需验证 is_shared）
    let pot: any = null;
    if (token) {
      pot = await env.DB.prepare(`
        SELECT name, image_url, note
        FROM pots
        WHERE share_token = ? AND is_shared = 1
      `).bind(token).first();
    } else if (id) {
      pot = await env.DB.prepare(`
        SELECT name, image_url, note
        FROM pots
        WHERE id = ? AND is_shared = 1
      `).bind(id).first();
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

    console.log('servePotDetailWithMeta: 成功获取数据，准备注入:', pot.name, '图片:', fullImageUrl);

    // 2. 使用 HTMLRewriter 动态修改 Meta 标签
    const rewriter = new (globalThis as any).HTMLRewriter()
      .on('title', {
        element(e: any) {
          e.setInnerContent(`${pot.name} - 我的花盆`);
        }
      })
      .on('meta[property="og:title"]', {
        element(e: any) {
          e.setAttribute('content', `${pot.name} - 我的花盆`);
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
          e.setAttribute('content', `${pot.name} - 我的花盆`);
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
