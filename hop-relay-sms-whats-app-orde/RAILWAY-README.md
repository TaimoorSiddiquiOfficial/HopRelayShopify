# 🚂 Railway Deployment Files

This directory contains all the configuration files needed to deploy the HopRelay Shopify App to Railway.

## 📁 Files Overview

| File | Purpose | Required |
|------|---------|----------|
| `railway.json` | Railway service configuration (JSON format) | ✅ Yes |
| `railway.toml` | Railway service configuration (TOML format) | ⚠️ Optional |
| `.railwayignore` | Files to exclude from deployment | ✅ Yes |
| `RAILWAY-ENV-VARS.txt` | Environment variables template | ✅ Yes |
| `RAILWAY-QUICKSTART.md` | 5-minute deployment guide | 📖 Docs |
| `RAILWAY-SETUP.md` | Complete deployment guide | 📖 Docs |
| `RAILWAY-VS-RENDER.md` | Platform comparison | 📖 Docs |

## 🚀 Quick Deploy

**New to Railway?** Start here:

```bash
# 1. Open the quick start guide
# RAILWAY-QUICKSTART.md

# 2. It takes only 5 minutes:
# - Create Railway project
# - Add PostgreSQL
# - Set environment variables
# - Deploy!
```

## 📖 Documentation

### For Beginners
👉 **Start with:** `RAILWAY-QUICKSTART.md`
- Step-by-step guide
- Takes 5 minutes
- No Railway experience needed

### For Detailed Setup
👉 **Read:** `RAILWAY-SETUP.md`
- Complete configuration guide
- Troubleshooting section
- Best practices
- CLI commands

### For Platform Comparison
👉 **Read:** `RAILWAY-VS-RENDER.md`
- Railway vs Render comparison
- Cost analysis
- Feature comparison
- Recommendations

## 🔧 Configuration Files Explained

### `railway.json`
Main configuration file that tells Railway:
- Use Dockerfile for builds
- Start command: `npm run docker-start`
- Health check path: `/`
- Restart policy

### `.railwayignore`
Excludes unnecessary files from deployment:
- Documentation files
- Development files
- Logs and temporary files
- Reduces deployment size and time

### `RAILWAY-ENV-VARS.txt`
Template for all required environment variables:
- Shopify API keys
- Database connection
- HopRelay API tokens
- Email configuration
- Never commit this file with real values!

## 🎯 Deployment Checklist

Before deploying, ensure you have:

- [ ] Railway account created
- [ ] GitHub repository connected
- [ ] Shopify API credentials ready
- [ ] HopRelay API tokens ready
- [ ] Email SMTP credentials ready
- [ ] Read `RAILWAY-QUICKSTART.md`

## 🔐 Security Notes

**⚠️ NEVER commit:**
- `RAILWAY-ENV-VARS.txt` with real values
- `.env` files
- Any file containing secrets

**✅ ALWAYS:**
- Use Railway's environment variables UI
- Keep tokens in Railway dashboard
- Rotate tokens regularly
- Enable 2FA on Railway account

## 🆘 Need Help?

1. **Quick issues:** Check `RAILWAY-QUICKSTART.md`
2. **Detailed issues:** Check `RAILWAY-SETUP.md` troubleshooting section
3. **Platform questions:** See `RAILWAY-VS-RENDER.md`
4. **Still stuck?**
   - Railway Discord: https://discord.gg/railway
   - Railway Docs: https://docs.railway.app

## 📊 Cost Tracking

Monitor your usage:
1. Railway Dashboard → Project
2. Click "Usage" tab
3. View real-time costs
4. Set budget alerts

**Expected monthly cost:** ~$7-10/month

## 🔄 Update Deployment

When you push code changes:

```bash
# Railway auto-deploys on git push
git add .
git commit -m "Update feature"
git push origin main

# Monitor deployment:
# Railway Dashboard → Deployments
```

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│         Railway Platform            │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────────────────────┐  │
│  │   HopRelay Shopify App       │  │
│  │   (Docker Container)         │  │
│  │   - Node.js 20               │  │
│  │   - React Router v7          │  │
│  │   - Shopify App Bridge       │  │
│  └──────────────────────────────┘  │
│              ↕                      │
│  ┌──────────────────────────────┐  │
│  │   PostgreSQL Database        │  │
│  │   - Prisma ORM               │  │
│  │   - Auto-migrations          │  │
│  └──────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
         ↕
┌─────────────────────────────────────┐
│       External Services             │
├─────────────────────────────────────┤
│  • Shopify API                      │
│  • HopRelay API                     │
│  • SMTP Email Service               │
└─────────────────────────────────────┘
```

## 📝 Notes

- Railway automatically detects Dockerfile
- Database migrations run on every deployment
- Zero-downtime deployments enabled
- Auto-scaling based on traffic
- SSL/HTTPS automatic

## 🎉 Success!

Once deployed, your app will be available at:
```
https://your-app-name.up.railway.app
```

Happy deploying! 🚀
