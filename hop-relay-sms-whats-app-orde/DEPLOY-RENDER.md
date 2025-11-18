# Deploy to Render.com - Step by Step

## 📋 Prerequisites

Before you start, gather these values:

1. **SHOPIFY_API_SECRET**: Get from [Shopify Partners Dashboard](https://partners.shopify.com)
   - Go to Apps → Your App → App credentials
   - Copy "Client secret"

2. **HOPRELAY_SYSTEM_TOKEN**: Get from HopRelay admin panel
   - Your HopRelay account admin area
   - API settings or system token section

## 🚀 Deployment Steps

### Step 1: Push Your Code to GitLab ✅ DONE

Your code is already on GitLab at:
`https://gitlab.com/taimoorrehman.sid/hoprelay`

Branch: `production-setup`

### Step 2: Create Render Account

1. Go to: https://dashboard.render.com/register
2. Sign up (use GitLab authentication for easy setup)

### Step 3: Deploy from GitLab

1. Go to: https://dashboard.render.com/web/new
2. Click "Connect account" → Select GitLab
3. Authorize Render to access your GitLab repos
4. Select repository: `taimoorrehman.sid/hoprelay`
5. Configure:
   - **Name**: `hoprelay-shopify-app`
   - **Region**: Oregon (or closest to you)
   - **Branch**: `production-setup`
   - **Runtime**: Docker
   - **Plan**: Starter ($7/month) or Free (sleeps after 15 min inactivity)

### Step 4: Add PostgreSQL Database

1. In Render dashboard, click "New +" → "PostgreSQL"
2. Configure:
   - **Name**: `hoprelay-db`
   - **Plan**: Starter ($7/month) or Free (90 days, then expires)
   - **Region**: Same as your web service
3. Click "Create Database"
4. Copy the **Internal Database URL** (starts with `postgresql://`)

### Step 5: Configure Environment Variables

In your web service settings → Environment tab, add:

```env
# Shopify Configuration
SHOPIFY_API_KEY=2ba8e6117cba33bf73b057cb11b169db
SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_APP_URL=https://hoprelay-shopify-app.onrender.com
SCOPES=read_orders,read_customers

# Database (paste the Internal Database URL from Step 4)
DATABASE_URL=postgresql://hoprelay:xxxxx@dpg-xxxxx.oregon-postgres.render.com/hoprelay

# HopRelay Configuration
HOPRELAY_ADMIN_BASE_URL=https://hoprelay.com/admin
HOPRELAY_API_BASE_URL=https://hoprelay.com/api
HOPRELAY_SYSTEM_TOKEN=your_hoprelay_system_token_here

# Optional HopRelay Defaults
HOPRELAY_DEFAULT_COUNTRY=US
HOPRELAY_DEFAULT_TIMEZONE=America/New_York
HOPRELAY_DEFAULT_LANGUAGE_ID=1
HOPRELAY_DEFAULT_ROLE_ID=2

# Node Environment
NODE_ENV=production
```

**Important**: Replace:
- `SHOPIFY_API_SECRET` with your actual secret from Shopify Partners
- `SHOPIFY_APP_URL` with your actual Render URL (shown after deployment)
- `DATABASE_URL` with the Internal Database URL from your PostgreSQL instance
- `HOPRELAY_SYSTEM_TOKEN` with your actual HopRelay token

### Step 6: Deploy

1. Click "Create Web Service"
2. Render will automatically:
   - Build Docker image
   - Run `npm run setup` (Prisma migrations)
   - Start your app
3. Watch the logs for any errors

Your app will be available at: `https://hoprelay-shopify-app.onrender.com`

### Step 7: Update Shopify App Configuration

#### 7.1 Update Local Configuration

Edit `shopify.app.toml`:
```toml
application_url = "https://hoprelay-shopify-app.onrender.com"
```

Commit and push:
```powershell
git add shopify.app.toml
git commit -m "Update app URL for production"
git push origin production-setup
```

#### 7.2 Update Shopify Partners Dashboard

1. Go to: https://partners.shopify.com
2. Select your app: "HopRelay – SMS & WhatsApp Orde"
3. App setup → URLs:
   - **App URL**: `https://hoprelay-shopify-app.onrender.com`
   - **Allowed redirection URL**: `https://hoprelay-shopify-app.onrender.com/auth/callback`
4. Save changes

### Step 8: Test Your Production App

1. In Partners Dashboard → Test your app
2. Select a development store
3. Install the app
4. Verify:
   - OAuth flow works
   - App loads in Shopify admin
   - Settings page accessible
   - HopRelay connection works

5. Create a test order:
   - Go to your test store
   - Create an order with phone number
   - Check if webhook is received (view Render logs)
   - Verify SMS/WhatsApp notification sent

### Step 9: Monitor Deployment

View logs in Render:
1. Go to your web service
2. Click "Logs" tab
3. Watch for:
   - `Prisma migration complete`
   - `Server started on port 3000`
   - Webhook events
   - Any errors

## 🔧 Troubleshooting

### Issue: Build Fails

**Check Render logs for errors**:
- Database connection issues → Verify `DATABASE_URL`
- Missing environment variables → Add in Environment tab
- Docker build errors → Check `Dockerfile` syntax

### Issue: App URL Not Working

1. Verify Render service is running (check dashboard)
2. Check environment variables are set correctly
3. View logs for startup errors

### Issue: OAuth Redirect Error

1. Ensure `SHOPIFY_APP_URL` matches your Render URL exactly
2. Update allowed redirect URLs in Partners Dashboard
3. Must include `/auth/callback` path

### Issue: Webhooks Not Received

1. Check Render logs for incoming requests
2. Verify webhook URLs in `shopify.app.toml`
3. In Partners Dashboard → Analytics → Webhooks delivery
4. Ensure app has proper scopes (`read_orders`, `read_customers`)

### Issue: Database Connection Error

1. Verify `DATABASE_URL` is the **Internal Database URL**
2. Ensure database is in the same region as web service
3. Run migrations manually:
   ```bash
   # In Render Shell (Service → Shell tab)
   npm run setup
   ```

### Issue: HopRelay API Not Working

1. Check `HOPRELAY_SYSTEM_TOKEN` is set correctly
2. Verify token has proper permissions in HopRelay admin
3. Test API endpoint manually:
   ```bash
   curl "https://hoprelay.com/api/get/credits?secret=YOUR_TOKEN"
   ```

## 💰 Pricing

**Render Pricing** (as of Nov 2025):

| Service | Free Tier | Starter Plan |
|---------|-----------|--------------|
| Web Service | Yes (sleeps after 15min) | $7/month |
| PostgreSQL | 90 days free | $7/month |

**Total**: $0 (limited) or $14/month for always-on production

**Recommendation**: Start with free tier for testing, upgrade to Starter for production.

## 📊 Production Checklist

Before going live:

- [ ] App deployed successfully on Render
- [ ] PostgreSQL database created and connected
- [ ] All environment variables set correctly
- [ ] Shopify app URLs updated in Partners Dashboard
- [ ] OAuth flow tested and working
- [ ] Webhook delivery tested (create test order)
- [ ] SMS notification sent successfully
- [ ] WhatsApp notification sent successfully
- [ ] Error monitoring setup (check Render logs)
- [ ] Custom domain configured (optional)

## 🎯 Next Steps After Deployment

1. **Custom Domain** (optional):
   - In Render: Settings → Custom Domain
   - Add your own domain instead of `.onrender.com`
   - Update Shopify configuration accordingly

2. **Enable Auto-Deploy**:
   - Render → Settings → Build & Deploy
   - Enable "Auto-Deploy" for `production-setup` branch
   - Every git push will auto-deploy

3. **Set Up Monitoring**:
   - Use Render's built-in metrics
   - Set up email alerts for service downtime
   - Monitor webhook delivery in Shopify Partners

4. **Prepare for App Store**:
   - Privacy policy URL
   - Support email/documentation
   - App screenshots and description
   - Pricing plan details

## 🔗 Useful Links

- **Render Dashboard**: https://dashboard.render.com
- **Shopify Partners**: https://partners.shopify.com
- **Your GitLab Repo**: https://gitlab.com/taimoorrehman.sid/hoprelay
- **Render Docs**: https://render.com/docs
- **Shopify App Deployment**: https://shopify.dev/docs/apps/deployment

## 🆘 Support

- **Render Support**: https://render.com/docs/support
- **Shopify Dev Forums**: https://community.shopify.com/c/shopify-apps/bd-p/shopify-apps
- **Render Community**: https://community.render.com

Good luck with your deployment! 🚀
