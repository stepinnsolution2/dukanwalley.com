import { Markdown } from "@/components/markdown";

// Long product descriptions are Markdown with "## " sections (written in the admin or by AI).
// Older and imported descriptions are plain text and keep their simple layout.

export function isRichDescription(text: string | null | undefined): text is string {
  return !!text && /^## /m.test(text);
}

/** Markdown reduced to plain text, for meta descriptions and structured data. */
export function markdownToPlain(text: string) {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** The opening paragraph(s) before the first section, shown next to the price. */
export function descriptionIntro(text: string) {
  return text.split(/^## /m)[0].trim();
}

const TAB_FOR: [RegExp, string, string][] = [
  [/^specifications?/i, "specifications", "Specifications"],
  [/^frequently asked|^faq/i, "faq", "Questions & answers"],
];

/** Full-width details below the product: tab links to Overview, Specifications and Q&A. */
export function ProductDetails({ description }: { description: string }) {
  const [intro, ...rest] = description.split(/^## /m);
  const sections = rest.map((chunk) => {
    const [heading, ...body] = chunk.split("\n");
    const tab = TAB_FOR.find(([re]) => re.test(heading.trim()));
    return { heading: heading.trim(), body: body.join("\n").trim(), id: tab?.[1] ?? null, tab: tab?.[2] ?? null };
  });
  const tabs = [{ id: "overview", label: "Product overview" }, ...sections.filter((s) => s.id).map((s) => ({ id: s.id!, label: s.tab! }))];

  return (
    <section id="details" className="mt-8 scroll-mt-20 overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <nav className="flex gap-2 overflow-x-auto border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 sm:px-5" aria-label="Product details">
        {tabs.map((t, i) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${
              i === 0 ? "border-teal-800 bg-teal-800 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:border-teal-700 hover:text-teal-800"
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>
      <div className="max-w-4xl px-4 pb-8 sm:px-6">
        <h2 id="overview" className="mt-6 scroll-mt-24 border-b border-zinc-200 pb-3 text-2xl font-semibold text-zinc-900">
          Product overview
        </h2>
        {intro.trim() ? <Markdown>{intro}</Markdown> : null}
        {sections.map((s) => (
          <div key={s.heading} id={s.id ?? undefined} className="scroll-mt-24">
            <Markdown>{`## ${s.heading}\n\n${s.body}`}</Markdown>
          </div>
        ))}
      </div>
    </section>
  );
}
