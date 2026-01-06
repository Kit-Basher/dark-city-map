const fs = require('fs');
const path = require('path');
const { MongoClient, GridFSBucket } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const GRIDFS_BUCKET = process.env.GRIDFS_BUCKET || 'darkCityAssets';
const MAP_GLB_FILENAME = process.env.MAP_GLB_FILENAME || 'dark.city.map.glb';

async function main() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: npm run upload:glb -- /absolute/path/to/dark.city.map.glb');
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath);
  await fs.promises.access(resolvedPath, fs.constants.R_OK);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db();
    const bucket = new GridFSBucket(db, { bucketName: GRIDFS_BUCKET });

    const existing = await bucket.find({ filename: MAP_GLB_FILENAME }).toArray();
    for (const file of existing) {
      await bucket.delete(file._id);
    }

    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(resolvedPath);
      const uploadStream = bucket.openUploadStream(MAP_GLB_FILENAME, {
        contentType: 'model/gltf-binary',
      });

      readStream.on('error', reject);
      uploadStream.on('error', reject);
      uploadStream.on('finish', resolve);

      readStream.pipe(uploadStream);
    });

    // eslint-disable-next-line no-console
    console.log(`Uploaded ${resolvedPath} to GridFS as ${MAP_GLB_FILENAME} (bucket: ${GRIDFS_BUCKET})`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
