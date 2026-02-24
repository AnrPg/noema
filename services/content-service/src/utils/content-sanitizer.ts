/**
 * @noema/content-service - Content Sanitizer
 *
 * Deep-walks card content objects and sanitizes all string values to prevent
 * stored XSS attacks. Uses sanitize-html with a curated allow-list of safe
 * HTML tags and attributes.
 *
 * Fields whose key appears in {@link SKIP_SANITIZATION_FIELDS} are left
 * untouched — these are fields that contain code, formulas, or other
 * intentionally raw content where HTML-like syntax is expected.
 */

import sanitizeHtml from 'sanitize-html';

// ============================================================================
// Configuration
// ============================================================================

/**
 * HTML tags permitted in sanitized content.
 * Covers basic formatting, structure, tables, code, links, images, and math.
 */
const ALLOWED_TAGS = [
  // Inline formatting
  'b', 'i', 'em', 'strong', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  // Block structure
  'p', 'br', 'hr', 'blockquote', 'div', 'span',
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // Code & preformatted
  'code', 'pre', 'kbd', 'samp', 'var',
  // Media
  'img', 'figure', 'figcaption', 'audio', 'source',
  // Links
  'a', 'abbr',
  // Ruby (for CJK annotations)
  'ruby', 'rt', 'rp',
  // Math (MathML subset for KaTeX output)
  'math', 'mi', 'mo', 'mn', 'mrow', 'msup', 'msub', 'mfrac', 'msqrt',
  'mover', 'munder', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace',
  'annotation', 'semantics',
];

/**
 * Allowed attributes per tag.
 */
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  audio: ['src', 'controls', 'preload'],
  source: ['src', 'type'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  code: ['class'], // language-* classes for syntax highlighting
  pre: ['class'],
  span: ['class', 'style'],
  div: ['class'],
  math: ['xmlns', 'display'],
  annotation: ['encoding'],
  col: ['span'],
  colgroup: ['span'],
};

/**
 * Fields whose values should NOT be sanitized.
 * These contain code snippets, formulas, or other intentionally raw content
 * where HTML-like syntax is expected and must be preserved verbatim.
 */
export const SKIP_SANITIZATION_FIELDS: ReadonlySet<string> = new Set([
  'code',
  'codeSnippet',
  'pre',
  'hint',
  'formula',
  'latex',
  'sourceCode',
]);

// ============================================================================
// Sanitization Functions
// ============================================================================

/**
 * Sanitize a single HTML string, removing scripts and dangerous elements
 * while preserving allowed formatting tags.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    // Disallow all URL schemes for non-link/media attributes
    disallowedTagsMode: 'discard',
  });
}

/**
 * Deep-sanitize card content: walk through all string values in the content
 * object and sanitize them, skipping fields in {@link SKIP_SANITIZATION_FIELDS}.
 */
export function sanitizeCardContent<T extends Record<string, unknown>>(
  content: T
): T {
  return deepSanitize(content, null) as T;
}

/**
 * Recursively sanitize all string values in a structure.
 * @param value — the value to sanitize
 * @param fieldName — the key under which this value was found (null for root)
 */
function deepSanitize(value: unknown, fieldName: string | null): unknown {
  if (typeof value === 'string') {
    // Skip sanitization for fields that contain intentionally raw content
    if (fieldName !== null && SKIP_SANITIZATION_FIELDS.has(fieldName)) {
      return value;
    }
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepSanitize(item, fieldName));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepSanitize(val, key);
    }
    return result;
  }

  return value;
}
