# dark-city-map-web/public

Static assets for the map web service.

## Key files

- `index.html`: main page for the 3D viewer
- `app.js`: client-side code that loads the map model and talks to the server
- `models/`: optional local models directory (often ignored in git)

## How the model is loaded

By default the service streams the `.glb` from MongoDB GridFS via:

- `GET /api/map.glb`

See `../README.md` for server setup and the upload script.
