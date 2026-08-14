/**
 * Escapes a string for safe interpolation into an HTML email body.
 * Every `html:` template literal built from user/dealer-controlled input
 * (lead name/message, dealership name, notification body, etc.) must wrap
 * each interpolated value with this - the `& < > " '` characters are the
 * ones that let a value break out of text content or an attribute.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
