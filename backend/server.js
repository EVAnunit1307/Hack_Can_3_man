require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const path    = require('path');
const express = require('express');

const uploadRoute   = require('./routes/upload');
const hfRoute       = require('./routes/hf');

// Teammate routes (generate3d + story) — load only if files exist
let generate3dRoute = null;
let storyRoute      = null;
try { generate3dRoute = require('./routes/generate3d'); } catch (_) {}
try { storyRoute      = require('./routes/story');      } catch (_) {}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Minimal request logger (no extra dependency)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Static frontend ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/upload', uploadRoute);
app.use('/api/hf',     hfRoute);             // /api/hf/depth, /api/hf/segment
if (generate3dRoute) app.use('/api/generate3d', generate3dRoute);
if (storyRoute)      app.use('/api',            storyRoute);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      cloudinary:  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
      gemini:      !!process.env.GEMINI_API_KEY,
      elevenlabs:  !!(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY),
      huggingface: !!(process.env.HF_TOKEN || process.env.REACT_APP_HF_TOKEN),
    },
  });
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () =>
  console.log(`[server] http://localhost:${PORT}`)
);

// ── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down`);
  server.close(() => { console.log('[server] Closed.'); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
