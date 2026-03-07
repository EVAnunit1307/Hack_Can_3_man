require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const path    = require('path');
const express = require('express');

const uploadRoute = require('./routes/upload');
const hfRoute     = require('./routes/hf');

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

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/upload', uploadRoute);
app.use('/api/hf',     hfRoute);      // /api/hf/depth, /api/hf/segment

// ── Health check (useful for deployment platforms & integration tests) ───────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      cloudinary: !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY    &&
        process.env.CLOUDINARY_API_SECRET
      ),
      gemini: !!process.env.GEMINI_API_KEY,
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
  server.close(() => {
    console.log('[server] Closed. Goodbye.');
    process.exit(0);
  });
  // Force-kill after 5 s if connections are lingering
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
