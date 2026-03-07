/**
 * Match detected ingredients to Indigenous recipes dataset.
 * Returns recipes you can make, sorted by ingredient overlap.
 */
const path = require('path');
const fs = require('fs');

const DATA_PATH = path.join(__dirname, '..', 'data', 'indigenous-recipes.json');
let recipes = null;

function loadRecipes() {
  if (recipes) return recipes;
  try {
    recipes = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    recipes = [];
  }
  return recipes;
}

const SYNONYMS = {
  maize: ['corn'], corn: ['maize', 'cornmeal', 'tortilla', 'taco'],
  pumpkin: ['squash'], squash: ['pumpkin'],
  beef: ['meat', 'venison', 'game', 'bison', 'steak'],
  meat: ['beef', 'venison', 'game', 'bison', 'steak', 'chicken', 'pork', 'sausage'],
  game: ['meat', 'beef'], venison: ['meat', 'beef'], bison: ['meat', 'beef'],
  broth: ['soup'], soup: ['broth'], cornmeal: ['corn', 'flour'],
  lard: ['oil', 'fat'], fat: ['oil'], oil: ['fat', 'lard'],
  tortilla: ['taco', 'quesadilla', 'burrito'],
  taco: ['tortilla', 'quesadilla', 'burrito'],
  quesadilla: ['tortilla', 'taco', 'cheese'],
  burrito: ['tortilla', 'taco', 'bean'],
  lettuce: ['salad'], salad: ['lettuce', 'spinach', 'kale'],
  bread: ['toast', 'dough', 'biscuit'], toast: ['bread'],
  fish: ['salmon', 'tuna', 'seafood'], salmon: ['fish'], tuna: ['fish'],
  berry: ['blueberry', 'blackberry', 'raspberry', 'strawberry', 'cherry'],
  cream: ['milk', 'sour-cream'], cranberry: ['cherry', 'raspberry'],
};

function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
}

function expandIngredient(name) {
  const n = normalize(name);
  const out = new Set([n]);
  if (SYNONYMS[n]) SYNONYMS[n].forEach((x) => out.add(normalize(x)));
  for (const [key, vals] of Object.entries(SYNONYMS)) {
    if (vals.some((v) => normalize(v) === n)) out.add(normalize(key));
  }
  return [...out];
}

/**
 * @param {string[]} detectedIngredients - e.g. ['corn', 'bean', 'squash']
 * @param {{ minScore?: number, maxResults?: number }} opts
 * @returns {{ recipe: object, score: number, matchedIngredients: string[] }[]}
 */
function matchRecipes(detectedIngredients, opts = {}) {
  const minScore = opts.minScore ?? 0.15;
  const maxResults = opts.maxResults ?? 16;
  const expanded = new Set();
  for (const i of detectedIngredients) {
    expandIngredient(i).forEach((x) => expanded.add(x));
  }
  const list = loadRecipes();
  const scored = list.map((recipe) => {
    const ings = (recipe.ingredients || []).map((x) => normalize(x));
    const matched = ings.filter((x) => expanded.has(x));
    const score = ings.length ? matched.length / ings.length : 0;
    return { recipe, score, matchedIngredients: matched };
  });
  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

module.exports = { matchRecipes, loadRecipes };
