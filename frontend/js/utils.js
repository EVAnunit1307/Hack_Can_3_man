'use strict';

/**
 * Escape user-provided strings before inserting into innerHTML.
 * Covers &, <, >, " and single quotes.
 * @param {unknown} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}