/* eslint-disable no-unused-vars */
'use strict';

// Hardcoded ingredient positions on the counter.
// Slot names follow the pattern: ingredientName_N (1-indexed).
// Move ingredients in the 3D view and use the live position panel to read
// updated coordinates, then paste them back here.
var INGREDIENT_POSITIONS = {
  tomato_1:  { x: -2.3359, y: 2.9709, z: 0.5000 },
  tomato_2:  { x: -1.4891, y: 2.9539, z: 0.6085 },
  tomato_3:  { x: -2.0000, y: 2.9922, z: -0.0636 },
  tomato_4:  { x: -1.7961, y: 2.9727, z: 0.3426 },
  garlic_1:  { x: -1.4899, y: 3.1141, z: -0.2336 },
  garlic_2:  { x: -1.2885, y: 3.1127, z: -0.0101 },
  cabbage_1: { x: 1.0,     y: 3.1,    z: 0.5    },
};

// Per-ingredient scale overrides (uniform). Falls back to DEFAULT_SCALE.
var INGREDIENT_SCALES = {
  tomato: 1.0,
  garlic: 0.25,
  cabbage: 0.8,
};
var DEFAULT_SCALE = 0.5;

// Per-ingredient rotation overrides in radians { x, y, z }.
// Falls back to DEFAULT_ROTATION.
var INGREDIENT_ROTATIONS = {
  // e.g. garlic: { x: 0, y: Math.PI / 4, z: 0 },
};
var DEFAULT_ROTATION = { x: 0, y: 0, z: 0 };