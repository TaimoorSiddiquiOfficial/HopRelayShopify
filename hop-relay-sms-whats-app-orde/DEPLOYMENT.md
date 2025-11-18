# Production Deployment Guide

## Prerequisites
- GitHub account
- Railway.app account (or other hosting provider)
- HopRelay production credentials
- Shopify Partner account

## Step 1: Prepare Your Code

### 1.1 Update Prisma for Production
✅ Already done - PostgreSQL configured

### 1.2 Create Production Environment Variables
Copy `.env.example` to `.env` locally and fill in your values.

**Never commit `.env` to git!** Add to `.gitignore`:
```
.env
.env.local
```

## Step 2: Deploy to Railway.app (Recommended)

### 2.1 Push to GitHub
```powershell
# Initialize git if not done
git init
git add .
git commit -m "Ready for production deployment"

# Create GitHub repo and push
git remote add origin https://github.com/YOUR_USERNAME/hoprelay-shopify-app.git
git branch -M main
git push -u origin main
```

### 2.2 Deploy on Railway
1. Go to https://railway.app
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your `hoprelay-shopify-app` repository
5. Railway will auto-detect the Dockerfile

### 2.3 Configure Environment Variables in Railway
Go to your project → Variables tab and add:

```env
SHOPIFY_API_KEY=2ba8e6117cba33bf73b057cb11b169db
SHOPIFY_API_SECRET=your_secret_from_shopify_partners
SHOPIFY_APP_URL=https://yourapp.up.railway.app
SCOPES=read_orders,read_customers
HOPRELAY_SYSTEM_TOKEN=your_token_here
NODE_ENV=production
```

### 2.4 Add PostgreSQL Database
1. In Railway project, click "New" → "Database" → "PostgreSQL"
2. Railway automatically creates `DATABASE_URL` variable
3. Your app will connect automatically

### 2.5 Deploy
Railway automatically builds and deploys. Check the deployment logs.

Your app will be available at: `https://yourapp.up.railway.app`

## Step 3: Update Shopify App Configuration

### 3.1 Update shopify.app.toml
Change the `application_url` to your Railway URL:
```toml
application_url = "https://yourapp.up.railway.app"
```

### 3.2 Update App URLs in Partners Dashboard
1. Go to https://partners.shopify.com
2. Select your app
3. App setup → URLs:
   - **App URL**: `https://yourapp.up.railway.app`
   - **Allowed redirection URLs**: `https://yourapp.up.railway.app/auth/callback`

### 3.3 Run Database Migrations
In Railway console or locally connected to prod DB:
```bash
npx prisma migrate deploy
```

## Step 4: Test Production App

1. Install on a test store from Partners dashboard
2. Verify OAuth flow works
3. Create a test order
4. Check webhook is received
5. Verify SMS/WhatsApp notifications work

## Step 5: Submit to App Store

Once everything works in production:

1. **Partners Dashboard** → Your App → **App listing**
2. Fill in:
   - App description
   - Screenshots (at least 2)
   - Support email
   - Privacy policy URL
   - Pricing details
3. **Distribution** → **Shopify App Store** → **Submit for review**

## Alternative Hosting Options

### Render.com
- Similar to Railway
- Free tier available
- Auto-detects Dockerfile

### Fly.io
- Great for global deployments
- Free tier: 3 VMs
```bash
fly launch
fly deploy
```

### DigitalOcean App Platform
- $5/month starter
- Managed PostgreSQL included

### Google Cloud Run
- Pay per use
- Scales to zero
- Deploy with:
```bash
gcloud run deploy hoprelay-shopify --source .
```

## Monitoring Production

### Add Error Tracking
Install Sentry:
```bash
npm install @sentry/node
```

### Health Check Endpoint
Add to your app:
```javascript
// app/routes/health.jsx
export async function loader() {
  return new Response("OK", { status: 200 });
}
```

### Monitor Webhooks
Check Shopify Partners → Your App → Analytics → Webhook delivery

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check if database accepts connections from Railway's IP
- Run `npx prisma migrate deploy` after first deployment

### OAuth Redirect Issues
- Ensure `SHOPIFY_APP_URL` matches Partners dashboard
- Check allowed redirect URLs include `/auth/callback`

### HopRelay API Errors
- Verify `HOPRELAY_SYSTEM_TOKEN` is set
- Check API is accessible from your server
- Review logs for API response errors

## Environment Variables Reference

| Variable | Required | Example |
|----------|----------|---------|
| `SHOPIFY_API_KEY` | Yes | From Partners dashboard |
| `SHOPIFY_API_SECRET` | Yes | From Partners dashboard |
| `SHOPIFY_APP_URL` | Yes | `https://yourapp.railway.app` |
| `DATABASE_URL` | Yes | Auto-provided by Railway |
| `HOPRELAY_SYSTEM_TOKEN` | Yes | From HopRelay admin |
| `SCOPES` | Yes | `read_orders,read_customers` |
| `NODE_ENV` | Yes | `production` |

## Cost Estimate

**Railway.app**:
- Starter: $5/month
- Pro: $20/month (recommended for production)
- PostgreSQL: Included

**Total**: ~$5-20/month for hosting

## Next Steps After Deployment

1. ✅ Test all features on production
2. ✅ Set up monitoring/alerts
3. ✅ Create support documentation
4. ✅ Prepare app store listing assets
5. ✅ Submit for Shopify review
6. 🎉 Launch!
