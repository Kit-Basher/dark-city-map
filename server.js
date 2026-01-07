const express = require('express');
const path = require('path');
const { MongoClient, GridFSBucket } = require('mongodb');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');

const app = express();

const port = process.env.PORT || 3001;
const publicDir = path.join(__dirname, 'public');

const MONGODB_URI = process.env.MONGODB_URI;
const GRIDFS_BUCKET = process.env.GRIDFS_BUCKET || 'darkCityAssets';
const MAP_GLB_FILENAME = process.env.MAP_GLB_FILENAME || 'dark.city.map.glb';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;

const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_MOD_ROLE_ID = process.env.DISCORD_MOD_ROLE_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

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

app.use(compression());

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

const roleCheckCache = new Map();

async function userHasModeratorRole(userId) {
  if (!DISCORD_GUILD_ID || !DISCORD_MOD_ROLE_ID || !DISCORD_BOT_TOKEN) {
    throw new Error('Moderator role check is not configured');
  }

  const key = String(userId);
  const cached = roleCheckCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  const url = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${userId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
  });

  if (!res.ok) {
    roleCheckCache.set(key, { allowed: false, expiresAt: Date.now() + 1000 * 60 * 2 });
    return false;
  }

  const data = await res.json();
  const roles = Array.isArray(data?.roles) ? data.roles : [];
  const allowed = roles.includes(String(DISCORD_MOD_ROLE_ID));
  roleCheckCache.set(key, { allowed, expiresAt: Date.now() + 1000 * 60 * 10 });
  return allowed;
}

function isPublicPath(pathname) {
  if (!pathname) return false;
  if (pathname === '/auth/discord') return true;
  if (pathname === '/auth/discord/callback') return true;
  if (pathname === '/auth/logout') return true;
  if (pathname === '/api/me') return true;
  return false;
}

function requireModerator(req, res, next) {
  const isAuthed = req.isAuthenticated && req.isAuthenticated() && req.user && req.user.id;
  if (!isAuthed) {
    const returnTo = req.originalUrl || '/';
    res.redirect(`/auth/discord?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }
  userHasModeratorRole(req.user.id)
    .then((ok) => {
      if (!ok) {
        res.status(403).send('Forbidden');
        return;
      }
      next();
    })
    .catch((err) => {
      res.status(500).send(err?.message || 'Server error');
    });
}

app.get('/', (req, res, next) => {
  const edit = typeof req.query.edit === 'string' ? req.query.edit : '';
  if (edit === '1') {
    requireModerator(req, res, () => res.sendFile(path.join(publicDir, 'index.html')));
    return;
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(
  express.static(publicDir, {
    etag: true,
    lastModified: true,
    maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0,
    setHeaders(res, filePath) {
      if (!filePath) return;
      if (process.env.NODE_ENV !== 'production') return;

      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    },
  })
);

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

async function isModerator(req) {
  try {
    if (!(req.isAuthenticated && req.isAuthenticated() && req.user && req.user.id)) return false;
    return await userHasModeratorRole(req.user.id);
  } catch {
    return false;
  }
}

const DISTRICT_CONFIG_DOC_ID = 'districts_v1';

app.get('/api/districts/config', async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection('map_config').findOne({ _id: DISTRICT_CONFIG_DOC_ID });
    res.json({ config: doc ? doc.config : null });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

app.put('/api/districts/config', requireAuth, async (req, res) => {
  try {
    const mod = await isModerator(req);
    if (!mod) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body || {};
    const config = body.config && typeof body.config === 'object' ? body.config : null;
    if (!config) {
      res.status(400).json({ error: 'config is required' });
      return;
    }

    const update = {
      _id: DISTRICT_CONFIG_DOC_ID,
      config,
      updatedAt: new Date(),
      updatedBy: {
        id: req.user.id,
        username: req.user.username,
      },
    };

    const db = await getDb();
    await db.collection('map_config').updateOne(
      { _id: DISTRICT_CONFIG_DOC_ID },
      { $set: update },
      { upsert: true }
    );

    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

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
    const mod = await isModerator(req);
    if (!mod && existing.ownerId !== req.user.id) {
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
    const mod = await isModerator(req);
    if (!mod && existing.ownerId !== req.user.id) {
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

    const files = await bucket.find({ filename: MAP_GLB_FILENAME }).limit(1).toArray();
    const file = files && files[0] ? files[0] : null;
    if (!file) {
      res.status(404).send('Map GLB not found in GridFS');
      return;
    }

    const etag = `\"${String(file._id)}:${String(file.length)}\"`;
    const lastModified = file.uploadDate ? new Date(file.uploadDate).toUTCString() : null;

    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('ETag', etag);
    if (lastModified) res.setHeader('Last-Modified', lastModified);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    if (lastModified && req.headers['if-modified-since']) {
      const ims = new Date(req.headers['if-modified-since']);
      if (!Number.isNaN(ims.valueOf()) && file.uploadDate && ims >= file.uploadDate) {
        res.status(304).end();
        return;
      }
    }

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

app.listen(port, () => {
  console.log(`dark-city-map-web listening on port ${port}`);
});
