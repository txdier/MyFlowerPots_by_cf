// Email service for My Flower Pots API
// Supports Resend or logging-only mode

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email using Resend or log it if no API key is configured
 */
export async function sendEmail(options: EmailOptions, env: any): Promise<boolean> {
  const { to, subject, html, text } = options;
  const resendApiKey = env.RESEND_API_KEY;
  const fromEmail = env.EMAIL_FROM || 'noreply@kaside365.com';
  const appBaseUrl = env.APP_BASE_URL || 'https://app.kaside365.com';

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
    subject: 'Verify your email for My Flower Pots',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to My Flower Pots! 🌱</h2>
        <p>Thank you for registering. Please verify your email address to complete your account setup.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" 
             style="background-color: #4CAF50; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; font-weight: bold;">
            Verify Email Address
          </a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationLink}</p>
        <p>This link will expire in 24 hours.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          If you didn't create an account with My Flower Pots, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Welcome to My Flower Pots!\n\nPlease verify your email by clicking this link: ${verificationLink}\n\nThis link will expire in 24 hours.\n\nIf you didn't create an account, you can ignore this email.`
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
  const resetLink = `${appBaseUrl}/reset-password.html?token=${resetToken}`;

  return {
    to: email,
    subject: 'Reset your password for My Flower Pots',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password for your My Flower Pots account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" 
             style="background-color: #2196F3; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetLink}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          For security reasons, please don't share this email with anyone.
        </p>
      </div>
    `,
    text: `Password Reset Request\n\nClick this link to reset your password: ${resetLink}\n\nThis link will expire in 24 hours.\n\nIf you didn't request a password reset, you can ignore this email.`
  };
}

/**
 * Generate welcome email for new users
 */
export function generateWelcomeEmail(
  email: string,
  displayName: string | null,
  appBaseUrl: string
): EmailOptions {
  const name = displayName || 'there';

  return {
    to: email,
    subject: 'Welcome to My Flower Pots!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to My Flower Pots, ${name}! 🌸</h2>
        <p>We're excited to have you join our community of plant lovers.</p>
        
        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Getting Started:</h3>
          <ul>
            <li>Add your first flower pot from the home screen</li>
            <li>Record watering and fertilizing schedules</li>
            <li>Track growth with photos and notes</li>
            <li>Get personalized care advice based on weather</li>
          </ul>
        </div>
        
        <p>If you have any questions or feedback, feel free to reply to this email.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${appBaseUrl}" 
             style="background-color: #4CAF50; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; font-weight: bold;">
            Start Growing!
          </a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          Happy planting!<br>
          The My Flower Pots Team
        </p>
      </div>
    `,
    text: `Welcome to My Flower Pots, ${name}!\n\nWe're excited to have you join our community of plant lovers.\n\nGetting Started:\n- Add your first flower pot from the home screen\n- Record watering and fertilizing schedules\n- Track growth with photos and notes\n- Get personalized care advice based on weather\n\nVisit ${appBaseUrl} to start growing!\n\nHappy planting!\nThe My Flower Pots Team`
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
    subject: `📦 花盆移交确认：${senderName} 想要向您移交“${potName}”`,
    html: `
      <div style="font-family: 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #4CAF50;">您收到一个花盆移交请求！🌱</h2>
        <p>亲爱的用户，您的好友 <strong>${senderName}</strong> 想要将他/她的花盆 <strong>“${potName}”</strong> 移交给您管理。</p>
        
        <div style="background-color: #f4fdf4; border-left: 4px solid #4CAF50; padding: 20px; margin: 25px 0; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #2e7d32;">移交详情：</h3>
          <p style="margin-bottom: 0;"><strong>花盆名称：</strong> ${potName}</p>
          <p style="margin-bottom: 0;"><strong>发起人：</strong> ${senderName}</p>
        </div>

        <p>如果您接受此移交，您将成为该花盆的新主人，并拥有全部管理权限（包括删除记录、进一步转让等）。</p>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${transferLink}" 
             style="background-color: #4CAF50; color: white; padding: 14px 32px; 
                    text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px;
                    box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);">
            立即查看并接受移交
          </a>
        </div>
        
        <p style="color: #999; font-size: 13px;">或者复制此链接到浏览器直接打开：</p>
        <p style="word-break: break-all; color: #007bff; font-size: 12px; background: #f0f7ff; padding: 10px; border-radius: 5px;">${transferLink}</p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">如果您不想接收此花盆，可以直接忽略此邮件或在系统中点击“拒绝”。</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 40px 0;">
        <p style="color: #bbb; font-size: 12px; text-align: center;">
          我的花盆 (My Flower Pots) - 记录每一寸生长<br>
          本邮件由系统自动发出，请勿直接回复。
        </p>
      </div>
    `,
    text: `花盆移交请求\n\n${senderName} 想要向您移交花盆 “${potName}”。\n\n请点击以下链接查看详情并接受：\n${transferLink}\n\n如果您不想接收，请忽略此邮件。`
  };
}
