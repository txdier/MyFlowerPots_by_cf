// Email service for My Flower Pots API
// Supports Resend or logging-only mode

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailDetailItem {
  label: string;
  value: string;
}

interface EmailLayoutOptions {
  preheader: string;
  title: string;
  intro: string[];
  actionLabel?: string;
  actionUrl?: string;
  actionNote?: string;
  details?: EmailDetailItem[];
  bullets?: string[];
  footer: string[];
  accentColor?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailLayout(options: EmailLayoutOptions): string {
  const {
    preheader,
    title,
    intro,
    actionLabel,
    actionUrl,
    actionNote,
    details = [],
    bullets = [],
    footer,
    accentColor = '#4CAF50',
  } = options;

  const introHtml = intro
    .map((line) => `<p style="margin: 0 0 14px; color: #374151; font-size: 15px; line-height: 1.8;">${escapeHtml(line)}</p>`)
    .join('');

  const detailsHtml = details.length
    ? `
      <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px 18px; margin: 24px 0;">
        ${details
      .map(
        (item) => `
              <div style="margin: 0 0 10px;">
                <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">${escapeHtml(item.label)}</div>
                <div style="color: #111827; font-size: 15px; font-weight: 600; word-break: break-word;">${escapeHtml(item.value)}</div>
              </div>
            `
      )
      .join('')}
      </div>
    `
    : '';

  const bulletsHtml = bullets.length
    ? `
      <div style="background: #f8fafc; border-radius: 14px; padding: 18px 20px; margin: 24px 0;">
        <div style="color: #111827; font-size: 14px; font-weight: 700; margin-bottom: 12px;">您可以从这里开始：</div>
        <ul style="padding-left: 20px; margin: 0; color: #374151; font-size: 14px; line-height: 1.9;">
          ${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  const actionHtml = actionLabel && actionUrl
    ? `
      <div style="text-align: center; margin: 30px 0 22px;">
        <a href="${escapeHtml(actionUrl)}"
           style="display: inline-block; background: ${accentColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 13px 26px; border-radius: 999px;">
          ${escapeHtml(actionLabel)}
        </a>
      </div>
      <p style="margin: 0 0 10px; color: #6b7280; font-size: 13px; line-height: 1.7;">如果按钮无法点击，请复制以下链接到浏览器打开：</p>
      <p style="margin: 0 0 16px; padding: 12px 14px; border-radius: 10px; background: #f3f4f6; color: #2563eb; font-size: 13px; line-height: 1.7; word-break: break-all;">
        ${escapeHtml(actionUrl)}
      </p>
    `
    : '';

  const actionNoteHtml = actionNote
    ? `<p style="margin: 0 0 20px; color: #6b7280; font-size: 13px; line-height: 1.7;">${escapeHtml(actionNote)}</p>`
    : '';

  const footerHtml = footer
    .map((line) => `<p style="margin: 0 0 8px; color: #6b7280; font-size: 12px; line-height: 1.7;">${escapeHtml(line)}</p>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)} - 我的花盆</title>
    </head>
    <body style="margin: 0; padding: 0; background: #f5f7f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;">
      <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; visibility: hidden;">
        ${escapeHtml(preheader)}
      </div>
      <div style="max-width: 640px; margin: 0 auto; padding: 28px 16px;">
        <div style="text-align: center; margin-bottom: 16px; color: #2f855a; font-size: 13px; font-weight: 700; letter-spacing: 0.08em;">
          我的花盆
        </div>
        <div style="background: #ffffff; border-radius: 20px; padding: 32px 28px; box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);">
          <h1 style="margin: 0 0 18px; color: #111827; font-size: 24px; line-height: 1.4;">${escapeHtml(title)}</h1>
          ${introHtml}
          ${detailsHtml}
          ${bulletsHtml}
          ${actionHtml}
          ${actionNoteHtml}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0 18px;">
          ${footerHtml}
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send an email using Resend or log it if no API key is configured
 */
export async function sendEmail(options: EmailOptions, env: any): Promise<boolean> {
  const { to, subject, html, text } = options;
  const resendApiKey = env.RESEND_API_KEY;
  const fromEmail = env.EMAIL_FROM || 'noreply@kaside365.com';

  // If no Resend API key, just log and return success (for development)
  if (!resendApiKey) {
    return true;
  }

  try {
    // Send real email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        text: text || html.replace(/<[^>]*>/g, ''),
        html,
      }),
    });

    if (resendResponse.ok) {
      return true;
    } else {
      const errorText = await resendResponse.text();
      console.error(`Resend API error: ${resendResponse.status}`, errorText);
      return false;
    }
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

/**
 * Generate email verification email
 */
export function generateVerificationEmail(
  email: string,
  verificationToken: string,
  appBaseUrl: string
): EmailOptions {
  const verificationLink = `${appBaseUrl}/api/auth/verify-email?token=${verificationToken}`;

  return {
    to: email,
    subject: '请验证您的邮箱 | 我的花盆',
    html: renderEmailLayout({
      preheader: '完成邮箱验证，保护账号安全并开始记录植物成长。',
      title: '完成邮箱验证，开始安心记录植物成长',
      intro: [
        '感谢您注册“我的花盆”。请点击下方按钮验证邮箱，完成账号设置。',
        '验证邮箱后，您将更方便地找回密码，也能更好地保护账号安全。'
      ],
      actionLabel: '立即验证邮箱',
      actionUrl: verificationLink,
      actionNote: '此链接将在 24 小时后失效。',
      footer: [
        '如果这不是您本人的操作，直接忽略此邮件即可。',
        '本邮件由系统自动发送，请勿直接回复。'
      ]
    }),
    text: `感谢注册“我的花盆”。\n\n请点击以下链接验证您的邮箱，完成账号设置：\n${verificationLink}\n\n此链接将在 24 小时后失效。\n如果这不是您本人的操作，直接忽略此邮件即可。\n\n我的花盆\n记录每一寸生长`
  };
}

/**
 * Generate password reset email
 */
export function generatePasswordResetEmail(
  email: string,
  resetToken: string,
  appBaseUrl: string
): EmailOptions {
  const resetLink = `${appBaseUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

  return {
    to: email,
    subject: '重置密码 | 我的花盆',
    html: renderEmailLayout({
      preheader: '您正在重置“我的花盆”账号密码。',
      title: '重置您的登录密码',
      intro: [
        '我们收到了您为“我的花盆”账号发起的密码重置请求。',
        '如果这是您本人操作，请点击下方按钮设置新密码。'
      ],
      actionLabel: '立即重置密码',
      actionUrl: resetLink,
      actionNote: '此链接将在 24 小时后失效。',
      accentColor: '#2563eb',
      footer: [
        '如果不是您本人发起，请忽略此邮件，您的密码不会被修改。',
        '如您担心账号安全，建议登录后尽快修改密码。'
      ]
    }),
    text: `我们收到了您为“我的花盆”账号发起的密码重置请求。\n\n请通过以下链接设置新密码：\n${resetLink}\n\n此链接将在 24 小时后失效。\n如果不是您本人发起，请忽略此邮件，您的密码不会被修改。\n\n我的花盆\n记录每一寸生长`
  };
}

/**
 * Generate welcome email for verified users
 */
export function generateWelcomeEmail(
  email: string,
  displayName: string | null,
  appBaseUrl: string
): EmailOptions {
  const name = displayName?.trim() || '你好';
  const greeting = name === '你好' ? '欢迎来到“我的花盆”' : `${name}，欢迎来到“我的花盆”`;

  return {
    to: email,
    subject: '欢迎来到我的花盆',
    html: renderEmailLayout({
      preheader: '邮箱验证成功，现在就开始记录植物成长。',
      title: greeting,
      intro: [
        '您的邮箱已经验证成功，现在可以开始记录植物成长、养护节奏和照片变化了。',
        '为了方便您快速上手，我们准备了几个常用入口：'
      ],
      bullets: [
        '添加第一盆植物，建立自己的植物档案',
        '记录浇水、施肥和其他养护动作',
        '上传照片与备注，持续观察成长变化',
        '跟好友分享你的植物'
      ],
      actionLabel: '进入我的花盆',
      actionUrl: appBaseUrl,
      actionNote: '登录后即可从首页开始管理您的植物。',
      footer: [
        '如需帮助或想反馈建议，直接回复此邮件即可。',
        '祝您把每一盆植物都养得更好。'
      ]
    }),
    text: `${greeting}\n\n您的邮箱已经验证成功，现在可以开始记录植物成长了。\n\n您可以先从这些操作开始：\n- 添加第一盆植物\n- 记录浇水、施肥和其他养护动作\n- 上传照片与备注\n- 跟好友分享你的植物\n\n立即开始：${appBaseUrl}\n\n如需帮助，直接回复此邮件即可。\n\n我的花盆\n记录每一寸生长`
  };
}

/**
 * Generate new email verification email
 */
export function generateNewEmailVerificationEmail(
  newEmail: string,
  currentEmail: string,
  verificationToken: string,
  appBaseUrl: string
): EmailOptions {
  const verificationLink = `${appBaseUrl}/api/auth/verify-new-email?token=${verificationToken}`;

  return {
    to: newEmail,
    subject: '请验证您的新邮箱 | 我的花盆',
    html: renderEmailLayout({
      preheader: '确认新的登录邮箱地址。',
      title: '确认新的邮箱地址',
      intro: [
        '我们收到了您修改登录邮箱的请求。',
        '请确认以下信息无误后，点击下方按钮完成新邮箱验证。'
      ],
      details: [
        { label: '当前邮箱', value: currentEmail },
        { label: '新邮箱', value: newEmail }
      ],
      actionLabel: '验证新邮箱',
      actionUrl: verificationLink,
      actionNote: '此链接将在 24 小时后失效。',
      footer: [
        '如果这不是您本人的操作，请尽快检查账号安全。',
        '本邮件由系统自动发送，请勿直接回复。'
      ]
    }),
    text: `我们收到了您修改登录邮箱的请求。\n\n当前邮箱：${currentEmail}\n新邮箱：${newEmail}\n\n请通过以下链接完成新邮箱验证：\n${verificationLink}\n\n此链接将在 24 小时后失效。\n如果这不是您本人的操作，请尽快检查账号安全。\n\n我的花盆\n记录每一寸生长`
  };
}

/**
 * Generate pot transfer notification email
 */
export function generateTransferEmail(
  toEmail: string,
  potName: string,
  senderName: string,
  transferLink: string
): EmailOptions {
  return {
    to: toEmail,
    subject: `花盆移交通知 | ${senderName} 邀请您接收“${potName}”`,
    html: renderEmailLayout({
      preheader: '您收到一个新的花盆移交邀请。',
      title: '您收到一个花盆移交邀请',
      intro: [
        `${senderName} 希望将花盆“${potName}”移交给您管理。`,
        '接受后，您将成为该花盆的新主人，并拥有完整管理权限。'
      ],
      details: [
        { label: '花盆名称', value: potName },
        { label: '发起人', value: senderName }
      ],
      actionLabel: '查看并处理移交',
      actionUrl: transferLink,
      actionNote: '此链接将在 24 小时后失效。',
      footer: [
        '如果您暂时不想处理，忽略此邮件即可。',
        '本邮件由系统自动发送，请勿直接回复。'
      ]
    }),
    text: `您收到一个花盆移交邀请。\n\n${senderName} 邀请您接收花盆“${potName}”。接受后，您将成为该花盆的新主人，并拥有完整管理权限。\n\n请通过以下链接查看并处理：\n${transferLink}\n\n此链接将在 24 小时后失效。\n如果您暂时不想处理，忽略此邮件即可。\n\n我的花盆\n记录每一寸生长`
  };
}
