# dark-city-map-web

Minimal standalone web service for viewing the Dark City `.glb` in the browser.

## Run locally

```bash
npm install
cp .env.example .env
export MONGODB_URI="mongodb://..."
npm run upload:glb -- /absolute/path/to/dark.city.map.glb
npm start
```

Then open:

- http://localhost:3001

## Render

- **Build command**: `npm install`
- **Start command**: `npm start`
- **Environment**: Node (>= 18)

The server listens on `process.env.PORT`.

## MongoDB (GridFS)

This service streams the map model from MongoDB GridFS.

Required env var:

- `MONGODB_URI`

Optional env vars:

- `GRIDFS_BUCKET` (default: `darkCityAssets`)
- `MAP_GLB_FILENAME` (default: `dark.city.map.glb`)

### Upload the GLB to GridFS

Set `MONGODB_URI`, then run:

```bash
npm run upload:glb -- /absolute/path/to/dark.city.map.glb
```
