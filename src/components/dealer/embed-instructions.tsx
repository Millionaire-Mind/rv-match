import { CopyLinkButton } from "@/components/dealer/copy-link-button";

/**
 * Gap 4E: basic instructions for putting an RV Match link on the
 * dealership's own website - a single copyable HTML snippet, not a live
 * embeddable widget/iframe (out of scope - this is a link, not a
 * graphic-design or embed-builder tool).
 */
export function EmbedInstructions({ link }: { link: string | null }) {
  const snippet = link
    ? `<a href="${link}" target="_blank" rel="noopener">Find Your RV</a>`
    : null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Add RV Match to Your Website</h2>
      {link ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste this into your site&apos;s HTML (a button, your menu, anywhere) to send visitors into
            your video-first inventory. Every click is tracked back to your general link above.
          </p>
          <div className="mt-3 flex items-start gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-secondary px-3 py-2 text-xs">{snippet}</code>
            <CopyLinkButton link={snippet!} label="Copy Snippet" />
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Create a general (no specific RV) link below first, then come back here for a copy-paste snippet
          for your website.
        </p>
      )}
    </section>
  );
}
