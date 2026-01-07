# Committing / pushing (dark-city-map-web)

This repo contains the **3D map viewer service**.

## Quick decision map (what did you change?)

Commit in **this repo** if you changed:

- `server.js` (Express server)
- `scripts/*` (upload helpers)
- `public/index.html` or `public/app.js` (viewer UI)

Do **not** commit here if you changed:

- `../dark-city-game/*` (game hub / character system)
- `../dark-city-bot/*` (Discord bot)

## Common workflows

### Updating the viewer UI

- Edit: `public/index.html`, `public/app.js`
- Commit: here

### Changing how the model is hosted

- Edit: `server.js`, `scripts/upload-glb.js`
- Commit: here

## Push checklist

- Make sure you’re inside the `dark-city-map-web/` repo (look for `dark-city-map-web/.git/`).
- Confirm deployment env vars exist:
  - `MONGODB_URI`
  - Discord OAuth vars if you use moderator edit mode
