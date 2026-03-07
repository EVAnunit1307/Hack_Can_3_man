/**
 * Cloudinary Analyze API – Content Analysis add-on.
 * Uses captioning for a text description and LVIS for object/ingredient detection (1000+ classes).
 * Requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
 */

const https = require('https');
const { isFoodLabel } = require('./food-filter');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

function analyzeRequest(model, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v2/analysis/${cloudName}/analyze/${model}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Basic ${auth}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error?.message || json.message || `Analyze API ${res.statusCode}: ${data}`));
            return;
          }
          resolve(json);
        } catch (e) {
          reject(new Error(`Analyze API response parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Extract all detected label names from LVIS-style response (tags object or tags array).
 * LVIS has 1000+ classes (ingredients, objects, etc.).
 */
function extractLvisLabels(lvisData) {
  const labels = [];
  const analysis = lvisData?.data?.analysis;
  if (!analysis) return labels;

  const tags = analysis.tags;
  if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
    for (const [label, items] of Object.entries(tags)) {
      if (Array.isArray(items) && items.length > 0) labels.push(label);
      else if (items && typeof items === 'object' && (items.confidence != null || items.length > 0)) labels.push(label);
    }
  }
  if (Array.isArray(tags)) {
    for (const t of tags) {
      const name = t?.name ?? t?.label ?? t?.category ?? (typeof t === 'string' ? t : null);
      if (name) labels.push(name);
    }
  }
  return [...new Set(labels)].filter(isFoodLabel);
}

/**
 * Run content analysis on an image URL (e.g. Cloudinary secure_url).
 * Uses LVIS for 100s of ingredients/objects; returns { caption, foodDetected }.
 */
async function analyzeImageContent(imageUrl) {
  if (!cloudName || !apiKey || !apiSecret) {
    return { caption: null, foodDetected: null, error: 'Cloudinary credentials not configured' };
  }

  const source = { uri: imageUrl };
  const result = { caption: null, foodDetected: null, error: null };

  try {
    const captionRes = await analyzeRequest('captioning', { source });
    const capData = captionRes?.data?.analysis?.data;
    if (capData?.caption) {
      result.caption = capData.caption;
    }
  } catch (err) {
    result.error = err.message || 'Captioning failed';
    return result;
  }

  try {
    const lvisRes = await analyzeRequest('lvis', { source });
    result.foodDetected = extractLvisLabels(lvisRes);
  } catch {
    // lvis is optional; don't overwrite result.error
  }

  return result;
}

/**
 * Returns a single text string describing what food/content is seen (for UI).
 */
function getContentAnalysisText(analysis) {
  if (!analysis) return null;
  if (analysis.error) return `Content analysis: ${analysis.error}`;
  const parts = [];
  if (analysis.foodDetected?.length) {
    parts.push(`Detected (ingredients & items): ${analysis.foodDetected.join(', ')}.`);
  }
  if (analysis.caption) {
    parts.push(analysis.caption);
  }
  return parts.length ? parts.join(' ') : null;
}

module.exports = { analyzeImageContent, getContentAnalysisText };
