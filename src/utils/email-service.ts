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
