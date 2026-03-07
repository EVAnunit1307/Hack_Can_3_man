const express = require('express');
const path = require('path');
const fs = require('fs');
const { textToSpeech } = require('../services/elevenlabs');

const router = express.Router();
const STORIES_PATH = path.join(__dirname, '..', 'data', 'recipe-stories.json');
let storiesCache = null;

function getStories() {
  if (storiesCache) return storiesCache;
  storiesCache = JSON.parse(fs.readFileSync(STORIES_PATH, 'utf8'));
  return storiesCache;
}

function getScriptForRecipe(recipeId) {
  const stories = getStories();
  const entry = stories[recipeId] || stories._default;
  return entry ? entry.script : null;
}

router.get('/story-audio', async (req, res) => {
  const recipeId = (req.query.recipeId || '').trim();
  if (!recipeId) return res.status(400).json({ error: 'Missing recipeId' });

  const script = getScriptForRecipe(recipeId);
  if (!script) return res.status(404).json({ error: 'No story for this recipe' });

  try {
    const audioBuffer = await textToSpeech(script);
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
    res.send(audioBuffer);
  } catch (err) {
    console.error('[story] TTS error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate story audio' });
  }
});

router.get('/story', (req, res) => {
  const recipeId = (req.query.recipeId || '').trim();
  if (!recipeId) return res.status(400).json({ error: 'Missing recipeId' });
  const stories = getStories();
  const entry = stories[recipeId] || stories._default;
  if (!entry) return res.status(404).json({ error: 'No story for this recipe' });
  res.json({ title: entry.title, script: entry.script });
});

// Short instruction TTS for cooking guide (e.g. "Cube the squash")
const TTS_MAX_CHARS = 300;
router.get('/tts', async (req, res) => {
  const raw = (req.query.text || '').trim();
  if (!raw) return res.status(400).json({ error: 'Missing text' });
  const text = raw.slice(0, TTS_MAX_CHARS);
  console.log('[tts] request:', text.slice(0, 50) + (text.length > 50 ? '...' : ''));
  try {
    const audioBuffer = await textToSpeech(text);
    console.log('[tts] ok, bytes:', audioBuffer.length);
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
    res.send(audioBuffer);
  } catch (err) {
    console.error('[tts] error:', err.message);
    res.status(500).json({ error: err.message || 'TTS failed' });
  }
});

module.exports = router;
