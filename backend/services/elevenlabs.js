/**
 * ElevenLabs text-to-speech: convert story text to MP3 audio.
 */
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
const MODEL_ID = 'eleven_multilingual_v2';

async function textToSpeech(text) {
  if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not set');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_22050_32`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      model_id: MODEL_ID,
      voice_settings: { stability: 0.6, similarity_boost: 0.8 },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    let msg = `ElevenLabs TTS failed: ${res.status}`;
    try {
      const j = JSON.parse(errText);
      if (j.detail?.message) msg = j.detail.message;
      else if (j.message) msg = j.message;
    } catch (_) {
      if (errText) msg += ` — ${errText.slice(0, 200)}`;
    }
    throw new Error(msg);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { textToSpeech };
