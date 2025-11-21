# 🚨 CRITICAL: Render Environment Variables Update Required

## Issue
Production logs show TWO token issues:
1. `"Invalid system token supplied!"` - Admin API token missing (FIXED in version 123)
2. `"Invalid API token"` for SSO - Using wrong token (Admin token instead of SSO token)

## What Was Fixed in Version 123-124
- ✅ Changed all Admin API calls to use `HOPRELAY_ADMIN_API_TOKEN` (instead of `HOPRELAY_SYSTEM_TOKEN`)
- ✅ Added comprehensive logging to debug Admin API responses
- ✅ Code is now correct and matches local .env configuration
- ✅ **Version 124**: Added `credits` parameter to Admin API user creation (required by API)
- ✅ **Version 124**: Uses `DEFAULT_ROLE_ID` environment variable for role assignment

## What You MUST Do on Render

### Go to Render Dashboard
1. Open: https://dashboard.render.com/
2. Select your service: `hoprelay-sms-whatsapp-orde`
3. Go to: **Environment** tab

### Add/Update These Environment Variables

#### Required for Admin API (User Creation):
```
HOPRELAY_ADMIN_API_TOKEN=b9dfcbb971107f6a6742858ae2865e76f0f97641421972f30b03d3f9e565bd01
```

#### ⚠️ CRITICAL: SSO Plugin Token (Currently Using Wrong Token!)
**Current Issue**: SSO is using Admin API token instead of SSO token, causing "Invalid API token" errors.
```
HOPRELAY_SSO_PLUGIN_TOKEN=40ca899844a5fd8d0a8a16947ca3e0932debb2cf59f5bccdeb97d815f2e41707
```
**Make sure this is set to the DIFFERENT token value above!**

#### Required for SMTP Email (Already in logs but confirm):
```
EMAIL_SERVICE=smtp
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@hoprelay.com
SMTP_PASS=Taimoor3109@
```

### After Adding Variables
1. Click **"Save Changes"**
2. Render will automatically redeploy your app
3. Wait for deployment to complete (~2-3 minutes)

## How to Verify It's Working

### Test with a new email:
1. Open your Shopify app
2. Enter a NEW email (e.g., `testuser123@example.com`)
3. Check Render logs - you should see:

**BEFORE FIX (Current Production):**
```
[checkHopRelayUserExists] ⚠️ Admin API Token configured: false
[initializeHopRelayAccount] Admin API response: { status: 401, message: 'Invalid system token supplied!', data: false }
```

**AFTER FIX (After Render Update):**
```
[checkHopRelayUserExists] ✅ Admin API Token configured: true
[checkHopRelayUserExists] Calling Admin API /get/users
[checkHopRelayUserExists] Admin API response status: 200
[initializeHopRelayAccount] ✅ User created via admin API: [REAL_USER_ID]
```

### What Should Happen After Fix:
1. ✅ Admin API will successfully create users
2. ✅ Real user IDs will be retrieved (not placeholder 999999)
3. ✅ Users will appear in https://hoprelay.com/dashboard/admin/users
4. ✅ API keys will auto-create with correct user ID
5. ✅ Free packages will auto-assign
6. ✅ SMTP emails will send (already working, but will show "smtp" mode instead of "console")

## Why This Happened
- Local `.env` has both tokens configured correctly
- Render environment only had old `HOPRELAY_SYSTEM_TOKEN` (or it was missing/invalid)
- Code was updated to use the correct variable name `HOPRELAY_ADMIN_API_TOKEN`
- Now Render needs the environment variable added to match

## Deployment Info
- **Version**: 123 (hoprelay-sms-whatsapp-orde-123)
- **Commit**: 1b87c33
- **GitLab Branch**: production-setup
- **Deployed**: ✅ Yes, to Shopify Partners
- **Render**: ⚠️ Needs environment variable update

## Next Steps
1. ✅ Code fixed (version 123)
2. ✅ Deployed to Shopify
3. ⏳ **YOU NEED TO DO**: Update Render environment variables
4. ⏳ Test user creation after Render redeploys
5. ⏳ Verify users appear in HopRelay admin dashboard
