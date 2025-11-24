# Quick Start: Deploy HopRelay Shopify App to Railway

## 🚀 5-Minute Railway Deployment

### Step 1: Create Railway Project (2 minutes)

1. **Sign up/Login:** Visit https://railway.app
2. **New Project:** Click "New Project"
3. **Deploy from GitHub:**
   - Click "Deploy from GitHub repo"
   - Connect GitHub account if needed
   - Select: `TaimoorSiddiquiOfficial/HopRelayShopify`
   - Choose branch: `main` or `production-setup`

### Step 2: Add PostgreSQL Database (1 minute)

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Database is ready! Railway auto-creates `DATABASE_URL`

### Step 3: Set Environment Variables (2 minutes)

1. Click your **service** → **"Variables"** tab
2. Click **"Raw Editor"** 
3. **Paste the following** (update `SHOPIFY_API_SECRET`):

```bash
SHOPIFY_API_KEY=2ba8e6117cba33bf73b057cb11b169db
SHOPIFY_API_SECRET=your_secret_from_shopify_partners
SHOPIFY_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
SCOPES=read_orders,read_customers
DATABASE_URL=${{Postgres.DATABASE_URL}}
HOPRELAY_ADMIN_BASE_URL=https://hoprelay.com/admin
HOPRELAY_API_BASE_URL=https://hoprelay.com/api
HOPRELAY_ADMIN_API_TOKEN=b9dfcbb971107f6a6742858ae2865e76f0f97641421972f30b03d3f9e565bd01
HOPRELAY_SYSTEM_TOKEN=515f2c5deead70eb5cfa4e4d6a63b536e3c61fd3148bccd72b24985ca236acc8
HOPRELAY_SSO_PLUGIN_TOKEN=40ca899844a5fd8d0a8a16947ca3e0932debb2cf59f5bccdeb97d815f2e41707
HOPRELAY_DEFAULT_COUNTRY=PK
HOPRELAY_DEFAULT_TIMEZONE=Asia/Karachi
HOPRELAY_DEFAULT_LANGUAGE_ID=1
HOPRELAY_DEFAULT_ROLE_ID=1
EMAIL_SERVICE=smtp
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@hoprelay.com
SMTP_PASS=Taimoor3109@
NODE_ENV=production
PORT=3000
```

4. Click **"Save"**

### Step 4: Generate Public Domain

1. Go to **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Copy your Railway URL (e.g., `your-app.up.railway.app`)

### Step 5: Update Shopify App URLs

1. Go to **Shopify Partners** → Your App → **App Setup**
2. Update these URLs with your Railway domain:
   - **App URL:** `https://your-app.up.railway.app`
   - **Allowed redirection URL:** `https://your-app.up.railway.app/auth/callback`
3. Click **"Save"**

### Step 6: Deploy & Monitor

Railway auto-deploys on push! Monitor:
- **Deployments tab:** View build progress
- **Logs:** Check application logs
- **Metrics:** Monitor performance

---

## ✅ Verification Checklist

- [ ] Railway project created
- [ ] PostgreSQL database added
- [ ] All environment variables set
- [ ] Public domain generated
- [ ] Shopify app URLs updated
- [ ] First deployment successful
- [ ] Health check passing
- [ ] Database migrations completed

---

## 🔧 Troubleshooting

**Build failing?**
```bash
# Check Dockerfile exists
# Verify package.json scripts
# Review build logs in Railway
```

**App not starting?**
```bash
# Verify PORT=3000 is set
# Check DATABASE_URL is linked
# Review environment variables
```

**Database connection error?**
```bash
# Ensure PostgreSQL service is running
# Verify DATABASE_URL format
# Check network connectivity
```

---

## 📚 Next Steps

- [ ] Set up custom domain (optional)
- [ ] Configure staging environment
- [ ] Enable automatic deployments from GitHub
- [ ] Set up monitoring alerts
- [ ] Review Railway billing

---

## 🆘 Need Help?

- **Full Guide:** See `RAILWAY-SETUP.md`
- **Railway Docs:** https://docs.railway.app
- **Shopify Docs:** https://shopify.dev
- **Discord:** https://discord.gg/railway

---

## 💰 Cost Information

**Hobby Plan (Free):**
- $5/month credit
- Great for testing

**Developer Plan:**
- $20/month
- Production-ready
- Includes PostgreSQL

**Usage-based:**
- Pay only for what you use
- Scales automatically

---

## 🔐 Security Reminder

⚠️ **Never commit these files:**
- `.env`
- `RAILWAY-ENV-VARS.txt`
- Any file with tokens/secrets

✅ **Always:**
- Use Railway's environment variables
- Rotate tokens regularly
- Enable 2FA on Railway account
