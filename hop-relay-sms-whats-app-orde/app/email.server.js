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
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
        .code { font-size: 32px; font-weight: bold; color: #4CAF50; text-align: center; letter-spacing: 5px; margin: 20px 0; padding: 15px; background: white; border: 2px dashed #4CAF50; }
        .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>HopRelay Shopify Integration</h1>
        </div>
        <div class="content">
          <h2>Hello${name ? ' ' + name : ''}!</h2>
          <p>Your verification code for connecting your HopRelay account is:</p>
          <div class="code">${code}</div>
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} HopRelay. All rights reserved.</p>
          <p>This is an automated email, please do not reply.</p>
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
  // Example configuration for Gmail
  // You'll need to enable "Less secure app access" or use App Passwords
  const nodemailer = await import('nodemailer');
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
    to,
    subject,
    text,
    html,
  });

  console.log('[sendViaSMTP] Message sent:', info.messageId);
  return { success: true, method: 'smtp', messageId: info.messageId };
}

/**
 * Send via SendGrid
 * npm install @sendgrid/mail
 */
async function sendViaSendGrid({ to, subject, html, text }) {
  const sgMail = await import('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

  const result = await sgMail.send(msg);
  console.log('[sendViaSendGrid] Message sent');
  return { success: true, method: 'sendgrid' };
}

/**
 * Send via AWS SES
 * npm install @aws-sdk/client-ses
 */
async function sendViaAWSSES({ to, subject, html, text }) {
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
}

/**
 * Send via Resend
 * npm install resend
 */
async function sendViaResend({ to, subject, html, text }) {
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
