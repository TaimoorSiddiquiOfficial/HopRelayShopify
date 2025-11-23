/**
 * Email Service for sending verification codes
 * 
 * Configure your preferred email service in environment variables:
 * - SMTP (Gmail, Outlook, etc.)
 * - SendGrid
 * - AWS SES
 * - Resend
 */

const EMAIL_SERVICE = process.env.EMAIL_SERVICE || 'console'; // 'smtp', 'sendgrid', 'ses', 'resend', 'console'
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@hoprelay.com';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'HopRelay Shopify';

/**
 * Send verification code email
 */
export async function sendVerificationEmail({ to, code, name }) {
  const subject = 'Your HopRelay Verification Code';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
          line-height: 1.6; 
          color: #ffffff; 
          background-color: #0a0a0a;
          margin: 0;
          padding: 0;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background-color: #1a1a1a;
        }
        .header { 
          background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
          padding: 40px 20px; 
          text-align: center;
          border-bottom: 2px solid #333;
        }
        .logo { 
          max-width: 180px; 
          height: auto;
          margin-bottom: 10px;
        }
        .content { 
          background-color: #1a1a1a;
          padding: 40px 30px; 
        }
        .greeting {
          font-size: 24px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 20px;
        }
        .message {
          font-size: 16px;
          color: #cccccc;
          margin-bottom: 30px;
        }
        .code-container {
          text-align: center;
          margin: 30px 0;
        }
        .code { 
          display: inline-block;
          font-size: 36px; 
          font-weight: bold; 
          color: #4CAF50; 
          letter-spacing: 8px; 
          padding: 20px 40px;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          border: 2px solid #4CAF50;
          border-radius: 10px;
          box-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
        }
        .expiry {
          text-align: center;
          font-size: 14px;
          color: #999;
          margin-top: 20px;
        }
        .warning {
          background-color: #2a2a2a;
          border-left: 4px solid #ff9800;
          padding: 15px;
          margin-top: 30px;
          font-size: 14px;
          color: #cccccc;
        }
        .footer { 
          background-color: #0a0a0a;
          padding: 30px 20px; 
          text-align: center; 
          font-size: 12px; 
          color: #666;
          border-top: 2px solid #333;
        }
        .footer a {
          color: #4CAF50;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://hoprelay.com/uploads/theme/logo-light.png" alt="HopRelay" class="logo">
          <div style="color: #ffffff; font-size: 18px; font-weight: 300; margin-top: 10px;">
            Shopify Integration
          </div>
        </div>
        <div class="content">
          <div class="greeting">Hello${name ? ' ' + name : ''}! 👋</div>
          <div class="message">
            Your verification code for connecting your HopRelay account to Shopify is ready:
          </div>
          <div class="code-container">
            <div class="code">${code}</div>
          </div>
          <div class="expiry">
            ⏰ This code will expire in <strong style="color: #ff9800;">10 minutes</strong>
          </div>
          <div class="warning">
            🔒 <strong>Security Notice:</strong> If you didn't request this code, please ignore this email and ensure your account is secure.
          </div>
        </div>
        <div class="footer">
          <p style="margin: 10px 0;">© ${new Date().getFullYear()} HopRelay. All rights reserved.</p>
          <p style="margin: 10px 0;">
            <a href="https://hoprelay.com">Visit HopRelay</a> | 
            <a href="https://hoprelay.com/support">Support</a>
          </p>
          <p style="margin: 10px 0; color: #555;">This is an automated email, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Hello${name ? ' ' + name : ''}!

Your verification code for connecting your HopRelay account is: ${code}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

© ${new Date().getFullYear()} HopRelay. All rights reserved.
  `.trim();

  try {
    switch (EMAIL_SERVICE) {
      case 'smtp':
        return await sendViaSMTP({ to, subject, html, text });
      
      case 'sendgrid':
        return await sendViaSendGrid({ to, subject, html, text });
      
      case 'ses':
        return await sendViaAWSSES({ to, subject, html, text });
      
      case 'resend':
        return await sendViaResend({ to, subject, html, text });
      
      case 'console':
      default:
        // Development mode - just log to console
        console.log('='.repeat(80));
        console.log('📧 EMAIL (Development Mode)');
        console.log('To:', to);
        console.log('Subject:', subject);
        console.log('Verification Code:', code);
        console.log('='.repeat(80));
        return { success: true, method: 'console' };
    }
  } catch (error) {
    console.error('[sendVerificationEmail] Error:', error);
    throw error;
  }
}

/**
 * Send via SMTP (requires nodemailer)
 * npm install nodemailer
 */
async function sendViaSMTP({ to, subject, html, text }) {
  try {
    const nodemailer = await import('nodemailer');
    
    const smtpConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };
    
    console.log('[sendViaSMTP] SMTP Config:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.auth.user,
      hasPassword: !!smtpConfig.auth.pass,
    });
    
    const transporter = nodemailer.default.createTransport(smtpConfig);

    const info = await transporter.sendMail({
      from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('[sendViaSMTP] Message sent successfully:', info.messageId);
    return { success: true, method: 'smtp', messageId: info.messageId };
  } catch (error) {
    console.error('[sendViaSMTP] Failed to send email:', error.message);
    console.error('[sendViaSMTP] Error details:', error);
    throw new Error(`SMTP email failed: ${error.message}`);
  }
}

/**
 * Send via SendGrid
 * npm install @sendgrid/mail
 */
async function sendViaSendGrid({ to, subject, html, text }) {
  try {
    const sgMail = await import('@sendgrid/mail');
    sgMail.default.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to,
      from: {
        email: EMAIL_FROM,
        name: EMAIL_FROM_NAME,
      },
      subject,
      text,
      html,
    };

    const result = await sgMail.default.send(msg);
    console.log('[sendViaSendGrid] Message sent');
    return { success: true, method: 'sendgrid' };
  } catch (error) {
    console.error('[sendViaSendGrid] Failed to load @sendgrid/mail. Install with: npm install @sendgrid/mail');
    throw new Error('SendGrid email service not configured. Please install @sendgrid/mail or use a different email service.');
  }
}

/**
 * Send via AWS SES
 * npm install @aws-sdk/client-ses
 */
async function sendViaAWSSES({ to, subject, html, text }) {
  try {
    const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
    
    const client = new SESClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new SendEmailCommand({
      Source: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: text,
            Charset: 'UTF-8',
          },
          Html: {
            Data: html,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const result = await client.send(command);
    console.log('[sendViaAWSSES] Message sent:', result.MessageId);
    return { success: true, method: 'ses', messageId: result.MessageId };
  } catch (error) {
    console.error('[sendViaAWSSES] Failed to load @aws-sdk/client-ses. Install with: npm install @aws-sdk/client-ses');
    throw new Error('AWS SES email service not configured. Please install @aws-sdk/client-ses or use a different email service.');
  }
}

/**
 * Send via Resend
 * npm install resend
 */
async function sendViaResend({ to, subject, html, text }) {
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const result = await resend.emails.send({
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('[sendViaResend] Message sent:', result.id);
    return { success: true, method: 'resend', messageId: result.id };
  } catch (error) {
    console.error('[sendViaResend] Failed to load resend. Install with: npm install resend');
    throw new Error('Resend email service not configured. Please install resend or use a different email service.');
  }
}

/**
 * Send new account credentials
 */
export async function sendNewAccountEmail({ to, password, name }) {
  const subject = 'Welcome to HopRelay - Your Account Details';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
        .credentials { background: white; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
        .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #666; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to HopRelay!</h1>
        </div>
        <div class="content">
          <h2>Hello${name ? ' ' + name : ''}!</h2>
          <p>Your HopRelay account has been created successfully. Here are your login credentials:</p>
          <div class="credentials">
            <p><strong>Email:</strong> ${to}</p>
            <p><strong>Password:</strong> ${password}</p>
            <p><strong>Dashboard URL:</strong> <a href="https://hoprelay.com">https://hoprelay.com</a></p>
          </div>
          <p><strong>⚠️ Important:</strong> Please save this password securely. You'll need it to access your HopRelay dashboard.</p>
          <p>You can use your HopRelay account to:</p>
          <ul>
            <li>Send SMS and WhatsApp messages</li>
            <li>Manage your contacts and campaigns</li>
            <li>Track your message history</li>
            <li>Configure advanced automation</li>
          </ul>
          <a href="https://hoprelay.com/dashboard/auth" class="button">Login to Dashboard</a>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} HopRelay. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Welcome to HopRelay!

Your HopRelay account has been created successfully. Here are your login credentials:

Email: ${to}
Password: ${password}
Dashboard URL: https://hoprelay.com

⚠️ Important: Please save this password securely. You'll need it to access your HopRelay dashboard.

You can use your HopRelay account to:
- Send SMS and WhatsApp messages
- Manage your contacts and campaigns
- Track your message history
- Configure advanced automation

Login to Dashboard: https://hoprelay.com/dashboard/auth

© ${new Date().getFullYear()} HopRelay. All rights reserved.
  `.trim();

  // Use the same sending method as verification emails
  try {
    switch (EMAIL_SERVICE) {
      case 'smtp':
        return await sendViaSMTP({ to, subject, html, text });
      case 'sendgrid':
        return await sendViaSendGrid({ to, subject, html, text });
      case 'ses':
        return await sendViaAWSSES({ to, subject, html, text });
      case 'resend':
        return await sendViaResend({ to, subject, html, text });
      case 'console':
      default:
        console.log('='.repeat(80));
        console.log('📧 NEW ACCOUNT EMAIL (Development Mode)');
        console.log('To:', to);
        console.log('Password:', password);
        console.log('='.repeat(80));
        return { success: true, method: 'console' };
    }
  } catch (error) {
    console.error('[sendNewAccountEmail] Error:', error);
    throw error;
  }
}
