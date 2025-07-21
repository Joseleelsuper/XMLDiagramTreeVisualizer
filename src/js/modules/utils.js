// Utility functions used across the XML Tree Visualizer

/**
 * Generates a unique ID string for tree nodes
 * @returns {string}
 */
export function generateId() {
  return 'node_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Debounces a function so it's not called too frequently
 * @param {Function} fn - original function
 * @param {number} delay - milliseconds
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}
