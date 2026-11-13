const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * Interpolates {{variable}} placeholders.
 * - Missing/undefined variables: placeholder is preserved and reported.
 * - Non-string values are stringified.
 * - Only explicit {{name}} tokens are replaced (no accidental broad replacement).
 */
function format(template, variables = {}, options = {}) {
  const reportMissing = options.reportMissing !== false;
  const missing = [];

  if (typeof template !== "string") {
    return { value: template, missing, ok: typeof template === "number" || typeof template === "boolean" };
  }

  const value = template.replace(PLACEHOLDER_RE, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name) || variables[name] === undefined) {
      if (reportMissing) missing.push(name);
      return match; // preserve unresolved placeholder
    }
    const v = variables[name];
    if (v === null) return "null";
    return String(v);
  });

  return { value, missing, ok: missing.length === 0 };
}

module.exports = { format, PLACEHOLDER_RE };
