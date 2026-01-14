const express = require('express');
const path = require('path');
const { MongoClient, GridFSBucket } = require('mongodb');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');
const { AuthMiddleware, RBAC, DiscordAPI } = require('./auth-system');

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

if (process.env.NODE_ENV === 'production' && !SESSION_SECRET) {
  throw new Error('Missing required environment variable in production: SESSION_SECRET');
}

const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const TELEMETRY_INGEST_URL = String(process.env.TELEMETRY_INGEST_URL || '').trim();
const TELEMETRY_INGEST_TOKEN = String(process.env.TELEMETRY_INGEST_TOKEN || '').trim();

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

async function postTelemetryEvent(payload) {
  try {
    if (!TELEMETRY_INGEST_URL || !TELEMETRY_INGEST_TOKEN) return;
    await fetch(TELEMETRY_INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telemetry-token': TELEMETRY_INGEST_TOKEN,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }
}

function telemetry(service, level, category, event, message, actorUserId, meta) {
  const body = {
    service,
    level,
    category,
    event,
    message,
    actorUserId,
    meta,
  };
  void postTelemetryEvent(body);
}

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

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'map', ts: new Date().toISOString() });
});

app.get('/status-ping', (req, res) => {
  res.status(200).send('OK');
});


function isPublicPath(pathname) {
  if (!pathname) return false;
  if (pathname === '/auth/discord') return true;
  if (pathname === '/auth/discord/callback') return true;
  if (pathname === '/auth/logout') return true;
  if (pathname === '/api/me') return true;
  return false;
}

function requireModerator(req, res, next) {
  // Custom check for moderator or admin role ONLY (for full map editing)
  (async () => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user.id) {
        return AuthMiddleware.requireDiscordAuth()(req, res, next);
      }

      const userRole = await DiscordAPI.getUserHighestRole(req.user.id);
      if (userRole === RBAC.ROLES.MODERATOR || userRole === RBAC.ROLES.ADMIN) {
        return next();
      }

      return res.status(403).send('Access denied');
    } catch (error) {
      console.error('Map editor auth error:', error);
      return res.status(403).send('Access denied');
    }
  })();
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
  AuthMiddleware.requireDiscordAuth()(req, res, next);
}

async function requireDiscordGuildMembership(req, res, next) {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user.id) {
      res.status(401).json({ error: 'Discord login required' });
      return;
    }

    const userRole = await DiscordAPI.getUserHighestRole(req.user.id);
    if (userRole === RBAC.ROLES.PUBLIC) {
      res.status(403).json({ error: 'You must be a member of the Dark City Discord server to perform this action' });
      return;
    }

    next();
  } catch (error) {
    console.error('Error checking Discord guild membership:', error);
    res.status(500).json({ error: 'Failed to verify Discord membership' });
    return;
  }
}

async function isModerator(req) {
  try {
    if (!(req.isAuthenticated && req.isAuthenticated() && req.user && req.user.id)) return false;
    const userRole = await DiscordAPI.getUserHighestRole(req.user.id);
    return userRole === RBAC.ROLES.MODERATOR || userRole === RBAC.ROLES.ADMIN;
  } catch {
    return false;
  }
}

async function isWriter(req) {
  try {
    if (!(req.isAuthenticated && req.isAuthenticated() && req.user && req.user.id)) return false;
    const userRole = await DiscordAPI.getUserHighestRole(req.user.id);
    return userRole === RBAC.ROLES.WRITER || userRole === RBAC.ROLES.MODERATOR || userRole === RBAC.ROLES.ADMIN;
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
      telemetry('map', 'security', 'districts', 'districts_update_forbidden', null, String(req.user.id), null);
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

    telemetry('map', 'info', 'districts', 'districts_config_updated', null, String(req.user.id), {
      resourceId: DISTRICT_CONFIG_DOC_ID,
    });
    res.json({ ok: true, config });
  } catch (err) {
    telemetry('map', 'error', 'districts', 'districts_config_update_error', err?.message || 'Server error', req.user ? String(req.user.id) : null, {
      resourceId: DISTRICT_CONFIG_DOC_ID,
    });
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

app.get('/api/me', (req, res) => {
  const authed = req.isAuthenticated && req.isAuthenticated() && req.user;
  if (!authed) return res.json({ user: null, isModerator: false, isAdmin: false, isWriter: false, isEditor: false });

  DiscordAPI.getUserHighestRole(req.user.id)
    .then((userRole) => {
      const isModerator = userRole === RBAC.ROLES.MODERATOR || userRole === RBAC.ROLES.ADMIN;
      const isAdmin = userRole === RBAC.ROLES.ADMIN;
      const isWriter = userRole === RBAC.ROLES.WRITER || userRole === RBAC.ROLES.MODERATOR || userRole === RBAC.ROLES.ADMIN;
      const isEditor = isModerator; // Editors are moderators in this context
      res.json({ user: req.user, isModerator, isAdmin, isWriter, isEditor, role: userRole });
    })
    .catch(() => {
      res.json({ user: req.user, isModerator: false, isAdmin: false, isWriter: false, isEditor: false });
    });
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

app.post('/api/pins', requireDiscordGuildMembership, async (req, res) => {
  try {
    // Check if user is writer or higher
    const writer = await isWriter(req);
    if (!writer) {
      res.status(403).json({ error: 'Writer role required to create pins' });
      return;
    }

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
    telemetry('map', 'info', 'pins', 'pin_created', null, String(req.user.id), {
      resourceId: String(doc._id),
    });
    res.json({ pin: doc });
  } catch (err) {
    telemetry('map', 'error', 'pins', 'pin_create_error', err?.message || 'Server error', req.user ? String(req.user.id) : null, null);
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

app.put('/api/pins/:id', requireDiscordGuildMembership, async (req, res) => {
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
      telemetry('map', 'security', 'pins', 'pin_update_forbidden', null, String(req.user.id), {
        resourceId: String(id),
      });
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
    telemetry('map', 'info', 'pins', 'pin_updated', null, String(req.user.id), {
      resourceId: String(id),
    });
    res.json({ pin });
  } catch (err) {
    telemetry('map', 'error', 'pins', 'pin_update_error', err?.message || 'Server error', req.user ? String(req.user.id) : null, {
      resourceId: String(req.params?.id || ''),
    });
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

app.delete('/api/pins/:id', requireDiscordGuildMembership, async (req, res) => {
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
      telemetry('map', 'security', 'pins', 'pin_delete_forbidden', null, String(req.user.id), {
        resourceId: String(id),
      });
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await db.collection('pins').deleteOne({ _id: id });
    telemetry('map', 'info', 'pins', 'pin_deleted', null, String(req.user.id), {
      resourceId: String(id),
    });
    res.json({ ok: true });
  } catch (err) {
    telemetry('map', 'error', 'pins', 'pin_delete_error', err?.message || 'Server error', req.user ? String(req.user.id) : null, {
      resourceId: String(req.params?.id || ''),
    });
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
