const express = require('express');
const router = express.Router();

/**
 * POST /api/generate3d
 * Body: { boundingBoxes: Array<{name, confidence}> }
 * Returns: { ingredients: Array<{name, confidence}> }
 */
router.post('/', express.json(), async (req, res) => {
  const { boundingBoxes } = req.body;

  if (!boundingBoxes?.length) {
    return res.status(400).json({ error: 'boundingBoxes array is required' });
  }

  try {
    const ingredients = boundingBoxes.map(({ name, confidence }) => ({
      name: name.toLowerCase().trim(),
      confidence,
    }));

    res.json({ ingredients });
  } catch (err) {
    console.error('[generate3d]', err);
    res.status(500).json({ error: err.message || 'Failed to process ingredients' });
  }
});

module.exports = router;