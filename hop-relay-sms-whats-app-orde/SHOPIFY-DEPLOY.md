# 🛍️ Shopify App Deployment Guide

## Overview

This guide covers deploying your HopRelay Shopify App to production using the Shopify CLI and hosting on Railway or Render.

## Prerequisites

✅ **Before you begin:**
- [ ] Shopify Partner account
- [ ] App created in Shopify Partners dashboard
- [ ] Railway or Render account
- [ ] Code pushed to GitHub/GitLab
- [ ] All environment variables ready

## 🎯 Deployment Options

### Option 1: Railway (Recommended)
- Follow `RAILWAY-QUICKSTART.md`
- Deploy time: ~5 minutes
- Cost: ~$7-10/month

### Option 2: Render
- Follow `DEPLOY-RENDER.md`
- Deploy time: ~10 minutes
- Cost: ~$14/month

## 📋 Step-by-Step Shopify Deployment

### Step 1: Push Code to Git

```powershell
# Use the helper script
.\push-all.ps1 "Ready for production deployment"

# Or manually:
git add .
git commit -m "Ready for production"
git push origin main
git push github main
```

### Step 2: Deploy to Hosting Platform

**For Railway:**
```bash
# 1. Login to Railway: https://railway.app
# 2. Create new project from GitHub
# 3. Add PostgreSQL database
# 4. Set environment variables (from RAILWAY-ENV-VARS.txt)
# 5. Wait for deployment (30-60 seconds)
```

**For Render:**
```bash
# 1. Login to Render: https://render.com
# 2. Create new web service from GitHub
# 3. Render will use render.yaml automatically
# 4. Wait for deployment (2-3 minutes)
```

### Step 3: Get Your App URL

After deployment, you'll get a URL:

**Railway:**
```
https://your-app-name.up.railway.app
```

**Render:**
```
https://your-app-name.onrender.com
```

### Step 4: Update Shopify App Configuration

1. **Go to Shopify Partners Dashboard:**
   - Visit: https://partners.shopify.com
   - Navigate to: Apps → Your App

2. **Update App URLs:**
   - Click "Configuration" → "URLs"
   - **App URL:** `https://your-deployed-url.com`
   - **Allowed redirection URLs:** 
     - `https://your-deployed-url.com/auth/callback`
     - `https://your-deployed-url.com/auth/shopify/callback`

3. **Update OAuth Settings:**
   - Click "Configuration" → "App Setup"
   - Verify **Scopes:** `read_orders,read_customers`
   - Copy **API key** and **API secret**

### Step 5: Update Environment Variables

Update your hosting platform with the correct Shopify URLs:

**Railway:**
```bash
# Go to: Railway → Your Service → Variables
# Update:
SHOPIFY_APP_URL=https://your-app.up.railway.app
```

**Render:**
```bash
# Go to: Render → Your Service → Environment
# Update:
SHOPIFY_APP_URL=https://your-app.onrender.com
```

### Step 6: Test Your Deployment

1. **Test App Installation:**
   ```
   https://your-deployed-url.com
   ```
   Should redirect to Shopify OAuth

2. **Install on Development Store:**
   - Go to: Shopify Partners → Development stores
   - Select a store
   - Install your app
   - Verify OAuth flow works

3. **Test Webhook Endpoints:**
   ```bash
   # Order created webhook
   POST https://your-deployed-url.com/webhooks/orders/create
   
   # Order fulfilled webhook
   POST https://your-deployed-url.com/webhooks/orders/fulfilled
   
   # Order cancelled webhook
   POST https://your-deployed-url.com/webhooks/orders/cancelled
   ```

### Step 7: Configure Shopify CLI (Optional)

If you want to use Shopify CLI for future updates:

```bash
# Link to your app
shopify app config link

# Deploy updates
shopify app deploy
```

## 🔐 Security Checklist

Before going live:

- [ ] All environment variables set correctly
- [ ] API keys and secrets are secure
- [ ] Database backups enabled
- [ ] HTTPS enabled (automatic on Railway/Render)
- [ ] Rate limiting configured
- [ ] Error logging enabled
- [ ] Email notifications working

## 🧪 Testing Checklist

Test these features:

- [ ] **OAuth Flow:**
  - App installation works
  - Store redirects correctly
  - Session is created

- [ ] **Dashboard Access:**
  - Admin can access app
  - Settings page loads
  - HopRelay integration shows

- [ ] **Order Webhooks:**
  - Order created → Notification sent
  - Order fulfilled → Notification sent
  - Order cancelled → Notification sent

- [ ] **HopRelay Integration:**
  - User creation works
  - API key generation works
  - Subscription creation works
  - SMS/WhatsApp sending works

- [ ] **Email Notifications:**
  - Welcome emails send
  - Order notifications send
  - Error alerts work

## 📊 Monitoring

### Railway Monitoring:
```bash
# View logs
railway logs

# Check metrics
# Railway Dashboard → Metrics

# Monitor costs
# Railway Dashboard → Usage
```

### Render Monitoring:
```bash
# View logs
# Render Dashboard → Logs

# Check metrics
# Render Dashboard → Metrics

# Monitor costs
# Render Dashboard → Billing
```

## 🚨 Troubleshooting

### App Not Loading
```bash
# Check deployment status
# Check environment variables
# Review application logs
# Verify database connection
```

### OAuth Not Working
```bash
# Verify SHOPIFY_APP_URL is correct
# Check API key and secret
# Verify callback URL in Shopify
# Check scopes match
```

### Webhooks Not Firing
```bash
# Verify webhook URLs in Shopify
# Check webhook signatures
# Review webhook logs
# Test endpoints manually
```

### Database Connection Issues
```bash
# Verify DATABASE_URL is set
# Check database is running
# Review migration logs
# Test connection manually
```

## 🔄 Updating Your App

### Method 1: Git Push (Auto-Deploy)
```powershell
# Make your changes
.\push-all.ps1 "Update feature X"
# Railway/Render will auto-deploy
```

### Method 2: Shopify CLI
```bash
# Make your changes
shopify app deploy
```

### Method 3: Manual Deploy
```bash
# Push to git
git push origin main

# Trigger manual deploy in Railway/Render dashboard
```

## 📝 Environment Variables Checklist

Required variables for production:

```bash
# Shopify
✅ SHOPIFY_API_KEY
✅ SHOPIFY_API_SECRET
✅ SHOPIFY_APP_URL
✅ SCOPES

# Database
✅ DATABASE_URL

# HopRelay
✅ HOPRELAY_ADMIN_BASE_URL
✅ HOPRELAY_API_BASE_URL
✅ HOPRELAY_ADMIN_API_TOKEN
✅ HOPRELAY_SYSTEM_TOKEN
✅ HOPRELAY_SSO_PLUGIN_TOKEN
✅ HOPRELAY_DEFAULT_COUNTRY
✅ HOPRELAY_DEFAULT_TIMEZONE
✅ HOPRELAY_DEFAULT_LANGUAGE_ID
✅ HOPRELAY_DEFAULT_ROLE_ID

# Email
✅ EMAIL_SERVICE
✅ SMTP_HOST
✅ SMTP_PORT
✅ SMTP_SECURE
✅ SMTP_USER
✅ SMTP_PASS

# Node
✅ NODE_ENV=production
✅ PORT=3000
```

## 🎉 Going Live

### Final Steps Before Public Release:

1. **Test on Multiple Stores:**
   - Install on 3+ development stores
   - Test all features thoroughly
   - Document any issues

2. **Performance Testing:**
   - Load test with multiple orders
   - Monitor memory usage
   - Check response times

3. **Submit for Review:**
   - Follow `SHOPIFY-SUBMISSION-CHECKLIST.md`
   - Prepare screenshots/videos
   - Write clear app description

4. **Monitor First Installations:**
   - Watch logs closely
   - Be ready to fix issues
   - Respond to user feedback

## 📞 Support

### Hosting Issues:
- **Railway:** Discord - https://discord.gg/railway
- **Render:** Email - support@render.com

### Shopify Issues:
- **Partners:** https://partners.shopify.com/support
- **Docs:** https://shopify.dev

### HopRelay Issues:
- **Website:** https://hoprelay.com
- **Support:** Contact HopRelay support

## 🔗 Quick Links

- **GitLab Repo:** https://gitlab.com/taimoorrehman.sid/hoprelay
- **GitHub Repo:** https://github.com/TaimoorSiddiquiOfficial/HopRelayShopify
- **Shopify Partners:** https://partners.shopify.com
- **Railway Dashboard:** https://railway.app/dashboard
- **Render Dashboard:** https://dashboard.render.com

## ✅ Deployment Complete!

Your app is now live! 🎊

**Next steps:**
1. Monitor logs for 24 hours
2. Test with real stores
3. Gather user feedback
4. Iterate and improve

**Happy deploying! 🚀**
