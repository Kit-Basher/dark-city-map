const express = require('express');
const path = require('path');
const { MongoClient, GridFSBucket } = require('mongodb');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');

const app = express();

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const MONGODB_URI = process.env.MONGODB_URI;
const GRIDFS_BUCKET = process.env.GRIDFS_BUCKET || 'darkCityAssets';
const MAP_GLB_FILENAME = process.env.MAP_GLB_FILENAME || 'dark.city.map.glb';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;

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

async function getDb() {
  const client = await getMongoClient();
  return client.db();
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

if (DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET && DISCORD_CALLBACK_URL) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: DISCORD_CLIENT_ID,
        clientSecret: DISCORD_CLIENT_SECRET,
        callbackURL: DISCORD_CALLBACK_URL,
        scope: ['identify'],
      },
      (accessToken, refreshToken, profile, done) => {
        done(null, {
          id: profile.id,
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar,
        });
      }
    )
  );
}

app.set('trust proxy', 1);

app.use(express.json({ limit: '256kb' }));
app.use(
  session({
    secret: SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
    store: MONGODB_URI
      ? MongoStore.create({
          mongoUrl: MONGODB_URI,
          collectionName: 'sessions',
          ttl: 60 * 60 * 24 * 30,
        })
      : undefined,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(publicDir));

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.get('/api/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json({ user: req.user });
    return;
  }
  res.json({ user: null });
});

app.get('/auth/discord', (req, res, next) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_CALLBACK_URL) {
    res.status(500).send('Discord OAuth is not configured');
    return;
  }
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  req.session.returnTo = returnTo;
  next();
}, passport.authenticate('discord'));

app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

app.post('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

app.get('/api/pins', async (req, res) => {
  try {
    const db = await getDb();
    const pins = await db.collection('pins').find({}).toArray();
    res.json({ pins });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

app.post('/api/pins', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const id = typeof body.id === 'string' ? body.id : null;
    if (!id) {
      res.status(400).json({ error: 'Pin id is required' });
      return;
    }
    if (!body.pos || typeof body.pos.x !== 'number' || typeof body.pos.y !== 'number' || typeof body.pos.z !== 'number') {
      res.status(400).json({ error: 'Pin pos is required' });
      return;
    }

    const doc = {
      _id: id,
      id,
      name: typeof body.name === 'string' ? body.name : '',
      type: typeof body.type === 'string' ? body.type : '',
      desc: typeof body.desc === 'string' ? body.desc : '',
      districtId: typeof body.districtId === 'string' ? body.districtId : '',
      pos: { x: body.pos.x, y: body.pos.y, z: body.pos.z },
      ownerId: req.user.id,
      ownerUsername: req.user.username,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await getDb();
    const existing = await db.collection('pins').findOne({ _id: id });
    if (existing) {
      res.status(409).json({ error: 'Pin id already exists' });
      return;
    }
    await db.collection('pins').insertOne(doc);
    res.json({ pin: doc });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

app.put('/api/pins/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const db = await getDb();
    const existing = await db.collection('pins').findOne({ _id: id });
    if (!existing) {
      res.status(404).json({ error: 'Pin not found' });
      return;
    }
    if (existing.ownerId !== req.user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const body = req.body || {};
    const update = {
      updatedAt: new Date(),
    };
    if (typeof body.name === 'string') update.name = body.name;
    if (typeof body.type === 'string') update.type = body.type;
    if (typeof body.desc === 'string') update.desc = body.desc;
    if (typeof body.districtId === 'string') update.districtId = body.districtId;
    if (body.pos && typeof body.pos.x === 'number' && typeof body.pos.y === 'number' && typeof body.pos.z === 'number') {
      update.pos = { x: body.pos.x, y: body.pos.y, z: body.pos.z };
    }

    await db.collection('pins').updateOne({ _id: id }, { $set: update });
    const pin = await db.collection('pins').findOne({ _id: id });
    res.json({ pin });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

app.delete('/api/pins/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const db = await getDb();
    const existing = await db.collection('pins').findOne({ _id: id });
    if (!existing) {
      res.status(404).json({ error: 'Pin not found' });
      return;
    }
    if (existing.ownerId !== req.user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await db.collection('pins').deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

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
