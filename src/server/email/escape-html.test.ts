import { describe, expect, it } from "vitest";

import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<script>alert('xss')</script> & "quoted"`)).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Jane Doe, 2024 Forest River Rockwood")).toBe("Jane Doe, 2024 Forest River Rockwood");
  });

  it("neutralizes an img-onerror injection attempt", () => {
    const malicious = `<img src=x onerror=alert(document.cookie)>`;
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<img");
    expect(escaped).not.toContain(">");
  });
});
