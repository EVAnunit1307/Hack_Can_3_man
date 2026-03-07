/**
 * HF routes — proxies Hugging Face Inference API calls server-side.
 *
 *  POST /api/hf/depth    — Depth Anything depth estimation on a cropped ingredient
 *  POST /api/hf/segment  — BLIP image captioning for shape/context hint
 *
 * Both accept multipart with field "crop" (JPEG blob).
 * Depth returns { depthMap: "data:image/png;base64,..." }
 * Segment returns { caption, shape }
 */
const express = require('express');
const https   = require('https');
const multer  = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Shared HF fetch ──────────────────────────────────────────────────────────
function callHF(model, buffer, token, expectImage = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-inference.huggingface.co',
      path:     `/models/${model}`,
      method:   'POST',
      headers:  {
        Authorization:    `Bearer ${token}`,
        'Content-Type':   'application/octet-stream',
        'Content-Length': buffer.length,
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data',  c  => chunks.push(c));
      res.on('end',   () => {
        const raw = Buffer.concat(chunks);
        if (expectImage) {
          resolve({ status: res.statusCode, buffer: raw, contentType: res.headers['content-type'] });
        } else {
          try   { resolve({ status: res.statusCode, body: JSON.parse(raw.toString()) }); }
          catch { resolve({ status: res.statusCode, body: null }); }
        }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

// ── POST /depth ──────────────────────────────────────────────────────────────
// Uses Depth Anything (best single-image depth model on HF inference API).
// Falls back to Intel/dpt-large if Depth Anything is cold.
router.post('/depth', upload.single('crop'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No crop image provided' });
  const token = process.env.HF_TOKEN || process.env.REACT_APP_HF_TOKEN;
  if (!token)  return res.status(500).json({ error: 'HF_TOKEN not configured' });

  const MODELS = [
    'LiheYoung/depth-anything-large-hf',
    'Intel/dpt-large',
    'Intel/dpt-hybrid-midas',
  ];

  for (const model of MODELS) {
    try {
      const { status, buffer, contentType } = await callHF(model, req.file.buffer, token, true);

      if (status === 503) {
        // Model loading — try next
        console.log(`[HF] ${model} loading, trying next…`);
        continue;
      }
      if (status >= 400) {
        console.error(`[HF] ${model} returned ${status}`);
        continue;
      }

      // Check we actually got an image back
      const ct = (contentType || '').toLowerCase();
      if (!ct.includes('image') && !ct.includes('octet-stream')) {
        console.error(`[HF] ${model} unexpected content-type: ${ct}`);
        continue;
      }

      const b64 = buffer.toString('base64');
      const mime = ct.includes('jpeg') ? 'image/jpeg' : 'image/png';
      console.log(`[HF] depth OK from ${model} (${buffer.length} bytes)`);
      return res.json({ depthMap: `data:${mime};base64,${b64}`, model });

    } catch (err) {
      console.error(`[HF] ${model} error:`, err.message);
    }
  }

  res.status(502).json({ error: 'All depth models unavailable' });
});

// ── POST /segment ─────────────────────────────────────────────────────────────
// BLIP captioning → shape hint for Three.js geometry fallback.
router.post('/segment', upload.single('crop'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No crop image provided' });
  const token = process.env.HF_TOKEN || process.env.REACT_APP_HF_TOKEN;
  if (!token)  return res.status(500).json({ error: 'HF_TOKEN not configured' });

  try {
    const { status, body } = await callHF('Salesforce/blip-image-captioning-base', req.file.buffer, token, false);
    if (status === 503) return res.status(503).json({ error: 'Model loading', shape: 'box' });
    if (status >= 400)  return res.status(502).json({ error: 'HF error', shape: 'box' });

    const caption = Array.isArray(body) ? body[0]?.generated_text : body?.generated_text;
    const shape   = inferShape(caption);
    return res.json({ caption, shape });
  } catch (err) {
    return res.status(500).json({ error: err.message, shape: 'box' });
  }
});

function inferShape(caption) {
  if (!caption) return 'box';
  const c = caption.toLowerCase();
  if (/\b(round|sphere|ball|circular|globe)\b/.test(c))        return 'sphere';
  if (/\b(long|elongated|stick|cylinder|cylindrical)\b/.test(c)) return 'cylinder';
  if (/\b(flat|slice|bread|loaf|block)\b/.test(c))             return 'flat';
  return 'box';
}

module.exports = router;
