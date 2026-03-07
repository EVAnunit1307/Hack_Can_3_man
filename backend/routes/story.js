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

module.exports = router;
