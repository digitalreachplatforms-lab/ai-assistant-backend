# AI Assistant Backend - Railway Deployment

Production-ready WebSocket backend for Unreal Engine AI Companion.

## Features

- WebSocket server for real-time communication
- Player registration and session management
- AI chat processing (rule-based, no API costs)
- Voice data handling
- Memory management
- Conversation history
- Auto-cleanup of old data

## Deployment to Railway

### Step 1: Create Railway Account
1. Go to https://railway.app
2. Click "Login" → "Login with GitHub"
3. Authorize Railway to access your GitHub

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Click "Deploy Now" (or connect your GitHub first)

### Step 3: Deploy This Backend

**Option A: Deploy from GitHub (Recommended)**
1. Push this code to a GitHub repository
2. In Railway, click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect Node.js and deploy

**Option B: Deploy with Railway CLI**
1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Deploy: `railway up`

### Step 4: Get Your URLs

After deployment, Railway will provide:
- **HTTP URL**: `https://your-app.up.railway.app`
- **WebSocket URL**: `wss://your-app.up.railway.app`

### Step 5: Update Unreal Engine

1. Open `AICompanionManager.h`
2. Update these lines:
```cpp
FString BackendURL = TEXT("https://your-app.up.railway.app");
FString WebSocketURL = TEXT("wss://your-app.up.railway.app");
```
3. Recompile your Unreal project

## Environment Variables

Railway automatically provides:
- `PORT` - The port your app should listen on

No additional configuration needed!

## Testing

After deployment, test your backend:

```bash
# Test HTTP endpoint
curl https://your-app.up.railway.app/api/health

# Should return:
{
  "status": "healthy",
  "uptime": 123.45,
  "connections": 0,
  "sessions": 0,
  "timestamp": "2025-11-03T..."
}
```

## Monitoring

Railway Dashboard shows:
- Deployment status
- Logs (real-time)
- Metrics (CPU, memory, network)
- Custom domain setup (optional)

## Cost

- **Free Tier**: $5 credit/month
- **Usage**: This backend uses ~$0-1/month
- **No credit card required** for free tier

## Support

If deployment fails:
1. Check Railway logs in dashboard
2. Verify all files are committed to Git
3. Ensure `package.json` has correct `start` script
4. Check Node.js version compatibility

## Files Included

- `index.js` - Main server file
- `ai-integration.js` - AI response logic
- `voice-processor.js` - Voice processing
- `package.json` - Dependencies and scripts
- `Procfile` - Railway process configuration
- `.gitignore` - Files to exclude from Git

## Production Ready

This backend is production-ready with:
- ✅ Error handling
- ✅ Graceful shutdown
- ✅ Auto-reconnection support
- ✅ Session cleanup
- ✅ Logging
- ✅ CORS enabled
- ✅ WebSocket heartbeat (ping/pong)

## Next Steps

1. Deploy to Railway
2. Get permanent URLs
3. Update Unreal Engine
4. Test connection
5. Build your game!

---

**Deployment time: ~5 minutes**
**Permanent URL: ✅**
**Always online: ✅**
**Free tier: ✅**
