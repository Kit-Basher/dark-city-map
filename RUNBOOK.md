# Runbook (Render) — dark-city-map-web

This repo backs **dark-city-map**: a standalone web service that serves the 3D map viewer and streams a `.glb` from MongoDB GridFS.

## Deploy model

- **Provider**: Render
- **Deploy trigger**: Render auto-deploy from GitHub on push to `main` (typical)

Recommended Render settings:

- **Build command**: `npm ci`
- **Start command**: `npm start`

## Required environment variables

- `MONGODB_URI`

Optional GridFS settings:

- `GRIDFS_BUCKET` (default: `darkCityAssets`)
- `MAP_GLB_FILENAME` (default: `dark.city.map.glb`)

Optional Discord OAuth + moderator edit mode:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_CALLBACK_URL`
- `SESSION_SECRET`

Optional moderator role check (only needed if you use role-gated edit mode):

- `DISCORD_GUILD_ID`
- `DISCORD_MOD_ROLE_ID`
- `DISCORD_BOT_TOKEN`

## Key endpoints

- `GET /` viewer UI
- `GET /api/map.glb` streams the `.glb` from GridFS
- `GET /api/districts/config` returns district config
- `PUT /api/districts/config` (auth required) updates district config
- `GET /api/pins` returns pins
- `POST /api/pins` (auth required) creates a pin
- `PUT /api/pins/:id` (auth required) updates a pin
- `DELETE /api/pins/:id` (auth required) deletes a pin

## Verifying the map is working

1. Load `/` and confirm the viewer renders.
2. Open `/api/map.glb` directly.
   - If this returns 404, the model is missing from GridFS.

## Uploading the `.glb` to GridFS

This repo includes:

- `scripts/upload-glb.js`

The flow is:

- Set `MONGODB_URI` locally
- Run `npm run upload:glb -- /absolute/path/to/dark.city.map.glb`

Then redeploy (or restart) the service if needed.

## Common failures and what to check

### 500 on `/api/map.glb`

- Confirm `MONGODB_URI` is set correctly in Render.
- Confirm the GridFS bucket/filename match `GRIDFS_BUCKET` and `MAP_GLB_FILENAME`.

### 403 when using edit mode

- Confirm Discord OAuth vars are set.
- Confirm bot token + guild/role IDs are correct (if role gating is enabled).

## Change checklist

- Any change to auth/login flows should be tested in a staging branch if possible.
- If you change bucket/filename, make sure you also update the upload step.
