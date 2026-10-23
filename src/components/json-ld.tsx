import { jsonLdString } from "@/lib/seo";

/** Structured data for search engines (schema.org JSON-LD). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
