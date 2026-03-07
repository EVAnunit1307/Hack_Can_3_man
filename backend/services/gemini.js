/**
 * Gemini media analysis service.
 * Returns a structured JSON payload with Indigenous food context,
 * general analysis, and detected objects.
 *
 * Output schema (all fields may be null / empty-array if not determinable):
 * {
 *   summary:           string,
 *   indigenousContext: {
 *     traditionalNames: [{ nation: string, name: string }],
 *     culturalUses:     string[],
 *     traditionalPreparations: string[],
 *     seasonality:      string | null,
 *     culturalSignificance: string | null,
 *   },
 *   recipes:        [{ name: string, description: string }],
 *   nutritionNotes: string | null,
 *   detectedObjects: string[],
 *   keyEvents:       string[],         // for video
 *   timestamps:      [{ time: string, description: string }],  // for video
 *   notableActions:  string[],         // for video
 * }
 */

const JSON_PROMPT = `You are a knowledgeable assistant specializing in Indigenous North American food traditions, ethnobotany, and traditional ecological knowledge.

Analyze the provided media and respond with ONLY valid JSON — no markdown fences, no extra text.

Use this exact schema:
{
  "summary": "brief 1–2 sentence description of what is shown",
  "indigenousContext": {
    "traditionalNames": [{ "nation": "Nation name", "name": "traditional name in that language (if known)" }],
    "culturalUses": ["how this ingredient has been traditionally used by Indigenous peoples"],
    "traditionalPreparations": ["traditional preparation or cooking method"],
    "seasonality": "when and where this ingredient is traditionally harvested (or null)",
    "culturalSignificance": "brief note on cultural or ceremonial significance (or null)"
  },
  "recipes": [{ "name": "recipe name", "description": "brief description using traditional methods" }],
  "nutritionNotes": "brief note on nutritional value in traditional diet context (or null)",
  "detectedObjects": ["ingredient or object 1", "ingredient or object 2"],
  "keyEvents": [],
  "timestamps": [],
  "notableActions": []
}

For video content, also populate keyEvents, timestamps (with approximate times), and notableActions.
If the image does not show food or ingredients, still provide indigenousContext as best you can for what is shown, or return null for fields you cannot determine.
Do NOT wrap in markdown. Return pure JSON only.`;

/**
 * @param {string} mediaUrl - Public URL of the uploaded media
 * @param {'image'|'video'} mediaType
 * @returns {Promise<object>} Parsed analysis object matching the schema above
 * @throws {Error} if upload or generation fails
 */
async function analyzeMedia(mediaUrl, mediaType) {
  const { GoogleGenAI, createUserContent, createPartFromUri } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Fetch and upload media to Gemini Files API
  const res = await fetch(mediaUrl);
  if (!res.ok) throw new Error(`Failed to fetch media for analysis: HTTP ${res.status}`);

  const buf      = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim()
    || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
  const blob = new Blob([buf], { type: mimeType });

  const file = await ai.files.upload({ file: blob, config: { mimeType } });
  if (!file.uri) throw new Error('Gemini file upload did not return a URI');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: createUserContent([
      createPartFromUri(file.uri, file.mimeType),
      JSON_PROMPT,
    ]),
  });

  const raw = (
    response?.text
    ?? response?.candidates?.[0]?.content?.parts?.[0]?.text
    ?? ''
  ).trim();

  // Strip accidental markdown fences (defensive)
  const jsonStr = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Gemini returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  // Ensure all expected top-level keys exist so callers don't need null-guards
  return {
    summary:           parsed.summary           ?? null,
    indigenousContext: parsed.indigenousContext  ?? null,
    recipes:           Array.isArray(parsed.recipes) ? parsed.recipes : [],
    nutritionNotes:    parsed.nutritionNotes     ?? null,
    detectedObjects:   Array.isArray(parsed.detectedObjects) ? parsed.detectedObjects : [],
    keyEvents:         Array.isArray(parsed.keyEvents)       ? parsed.keyEvents       : [],
    timestamps:        Array.isArray(parsed.timestamps)      ? parsed.timestamps      : [],
    notableActions:    Array.isArray(parsed.notableActions)  ? parsed.notableActions  : [],
  };
}

module.exports = { analyzeMedia };
