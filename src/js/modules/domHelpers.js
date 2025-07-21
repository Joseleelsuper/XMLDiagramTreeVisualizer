// DOM helper functions for selecting and creating elements

/**
 * Safely get an element by ID and optionally warn if not found
 * @param {string} id
 * @param {boolean} warn
 * @returns {HTMLElement|null}
 */
export function getElement(id, warn = false) {
  const el = document.getElementById(id);
  if (!el && warn) {
    console.warn(`Element with ID \"${id}\" not found`);
  }
  return el;
}

/**
 * Creates a div with given id and class, append to parent
 * @param {string} id
 * @param {string} className
 * @param {HTMLElement} parent
 * @returns {HTMLElement}
 */
export function createDiv(id, className, parent) {
  const div = document.createElement('div');
  div.id = id;
  div.className = className;
  parent.appendChild(div);
  return div;
}
