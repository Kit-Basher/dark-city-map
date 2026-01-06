const express = require('express');
const path = require('path');
const { MongoClient, GridFSBucket } = require('mongodb');

const app = express();

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const MONGODB_URI = process.env.MONGODB_URI;
const GRIDFS_BUCKET = process.env.GRIDFS_BUCKET || 'darkCityAssets';
const MAP_GLB_FILENAME = process.env.MAP_GLB_FILENAME || 'dark.city.map.glb';

let mongoClient;

async function getMongoClient() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  if (mongoClient) return mongoClient;

  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  return mongoClient;
}

app.use(express.static(publicDir));

app.get('/api/map.glb', async (req, res) => {
  try {
    const client = await getMongoClient();
    const db = client.db();
    const bucket = new GridFSBucket(db, { bucketName: GRIDFS_BUCKET });

    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const downloadStream = bucket.openDownloadStreamByName(MAP_GLB_FILENAME);

    downloadStream.on('error', (err) => {
      if (err && err.code === 'ENOENT') {
        res.status(404).send('Map GLB not found in GridFS');
        return;
      }
      res.status(500).send('Failed to stream GLB');
    });

    downloadStream.pipe(res);
  } catch (err) {
    res.status(500).send(err?.message || 'Server error');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`dark-city-map-web listening on port ${port}`);
});
