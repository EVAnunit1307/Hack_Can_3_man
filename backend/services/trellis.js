const { fal } = require('@fal-ai/client');
const { normalizeLabel } = require('./food-filter');

fal.config({ credentials: process.env.FAL_KEY });

// In-memory cache: normalizedLabel -> glbUrl
const glbCache = new Map();

/**
 * Generate a 3D GLB model from an image URL using Trellis 2 via Fal.ai.
 * Results are cached by normalized food label.
 * @param {string} imageUrl - URL of the cropped ingredient image
 * @param {string} label - Food label for caching
 * @returns {Promise<{glbUrl: string, cached: boolean}>}
 */
async function generateModel(imageUrl, label) {
  const key = normalizeLabel(label);

  if (glbCache.has(key)) {
    console.log(`[Trellis] Cache hit for "${key}"`);
    return { glbUrl: glbCache.get(key), cached: true };
  }

  console.log(`[Trellis] Generating 3D model for "${key}"...`);

  const result = await fal.subscribe('fal-ai/trellis-2', {
    input: { image_url: imageUrl },
    logs: true,
    onQueueUpdate(update) {
      if (update.status === 'IN_PROGRESS' && update.logs?.length) {
        console.log(`[Trellis:${key}]`, update.logs.map(l => l.message).join('\n'));
      }
    },
  });

  console.log(`[Trellis] Raw result keys:`, JSON.stringify(Object.keys(result)));
  console.log(`[Trellis] Raw result:`, JSON.stringify(result).slice(0, 500));

  const glbUrl = result.data?.model_glb?.url || result.model_glb?.url;

  if (glbUrl) {
    glbCache.set(key, glbUrl);
  }

  return { glbUrl, cached: false, _rawKeys: Object.keys(result), _rawSnippet: JSON.stringify(result).slice(0, 800) };
}

/**
 * Generate 3D models for multiple ingredients in parallel.
 * @param {Array<{imageUrl: string, label: string, bbox: object}>} items
 * @returns {Promise<Array<{label: string, glbUrl: string|null, bbox: object, cached: boolean, error?: string}>>}
 */
async function generateModels(items) {
  return Promise.all(
    items.map(async ({ imageUrl, label, bbox }) => {
      try {
        const { glbUrl, cached, _rawKeys, _rawSnippet } = await generateModel(imageUrl, label);
        return { label, glbUrl, bbox, cached, _rawKeys, _rawSnippet };
      } catch (err) {
        console.error(`[Trellis] Failed for "${label}":`, err.message);
        return { label, glbUrl: null, bbox, cached: false, error: err.message };
      }
    })
  );
}

module.exports = { generateModel, generateModels };