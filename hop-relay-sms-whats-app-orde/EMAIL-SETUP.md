# Email Service Configuration Guide

This document explains how to configure email sending for verification codes and account credentials in your HopRelay Shopify plugin.

## Overview

The plugin uses email to send:
1. **Verification codes** - 6-digit codes for account linking
2. **New account credentials** - Password and login details for newly created accounts

## Email Service Options

### 1. Console (Development Only)
**Use for:** Local development and testing
```env
EMAIL_SERVICE=console
```
- Emails are logged to console instead of being sent
- Verification codes appear in server logs
- **Do not use in production!**

### 2. SMTP (Gmail, Outlook, etc.)
**Use for:** Simple setup with existing email account

```env
EMAIL_SERVICE=smtp
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=HopRelay Shopify
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

**Gmail Setup:**
1. Enable 2-factor authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password as `SMTP_PASS`

**Dependencies:**
```bash
npm install nodemailer
```

### 3. SendGrid
**Use for:** Reliable transactional emails with good deliverability

```env
EMAIL_SERVICE=sendgrid
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=HopRelay Shopify
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
```

**Setup:**
1. Create account at https://sendgrid.com
2. Get API key from Settings > API Keys
3. Verify sender email in Settings > Sender Authentication

**Dependencies:**
```bash
npm install @sendgrid/mail
```

### 4. AWS SES
**Use for:** High-volume emails at low cost

```env
EMAIL_SERVICE=ses
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=HopRelay Shopify
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
```

**Setup:**
1. Create AWS account
2. Verify email/domain in SES console
3. Request production access (sandbox mode limits sending)
4. Create IAM user with SES permissions

**Dependencies:**
```bash
npm install @aws-sdk/client-ses
```

### 5. Resend
**Use for:** Modern email API with great developer experience

```env
EMAIL_SERVICE=resend
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=HopRelay Shopify
RESEND_API_KEY=re_...
```

**Setup:**
1. Create account at https://resend.com
2. Get API key from Settings
3. Verify domain

**Dependencies:**
```bash
npm install resend
```

## Recommended Setup for Production

### Option 1: Resend (Easiest)
- Quick setup
- Free tier: 100 emails/day
- Great deliverability
- Simple API

### Option 2: SendGrid (Most Popular)
- Free tier: 100 emails/day
- Proven reliability
- Good documentation

### Option 3: AWS SES (Best for Scale)
- Very cheap ($0.10 per 1,000 emails)
- Highly scalable
- Requires AWS account setup

## Testing Email Configuration

1. Set `EMAIL_SERVICE=console` in development
2. Check server logs for verification codes
3. Test the full flow before switching to production email service

## Email Templates

The plugin sends two types of emails:

### Verification Code Email
- Subject: "Your HopRelay Verification Code"
- Contains 6-digit code
- Expires in 10 minutes

### New Account Email
- Subject: "Welcome to HopRelay - Your Account Details"
- Contains email, password, and dashboard link
- Includes security warning to save credentials

## Troubleshooting

### Emails not being sent
1. Check `EMAIL_SERVICE` is set correctly
2. Verify API keys/credentials
3. Check server logs for errors
4. Ensure email domain is verified (for SES/SendGrid)

### Emails going to spam
1. Verify your sending domain (SPF, DKIM, DMARC)
2. Use a professional "from" address
3. Avoid spam trigger words
4. Consider using SendGrid or AWS SES

### Gmail blocking SMTP
1. Enable "Less secure app access" (not recommended)
2. Use App Passwords with 2FA (recommended)
3. Or switch to SendGrid/Resend

## Security Best Practices

1. **Never commit API keys** - Use environment variables
2. **Use verified domains** - Don't send from generic emails
3. **Rotate credentials** - Change API keys periodically
4. **Monitor usage** - Set up alerts for unusual activity
5. **Use TLS/SSL** - Ensure encrypted email transmission

## Cost Comparison

| Service | Free Tier | Paid Pricing |
|---------|-----------|--------------|
| Console | Unlimited | Free (dev only) |
| SMTP | Varies | Depends on provider |
| SendGrid | 100/day | $15/mo for 40k emails |
| AWS SES | 62k/mo (from EC2) | $0.10 per 1,000 |
| Resend | 100/day | $20/mo for 50k emails |

## Next Steps

1. Choose an email service based on your needs
2. Set up account and get credentials
3. Update `.env` file with configuration
4. Install required npm packages
5. Test in development mode
6. Deploy to production
