import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders admin-written Markdown. Raw HTML in the text is ignored (react-markdown's default), so
// content can't inject scripts. Works on the server and in the admin preview.

const components: Components = {
  h1: ({ children }) => <h2 className="mt-8 text-2xl font-semibold text-zinc-900">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-8 text-xl font-semibold text-zinc-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 text-lg font-semibold text-zinc-900">{children}</h3>,
  p: ({ children }) => <p className="mt-3 leading-relaxed text-zinc-700">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-6 text-zinc-700">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-6 text-zinc-700">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-4 border-teal-600 bg-teal-50/60 px-4 py-2 text-zinc-700">{children}</blockquote>
  ),
  hr: () => <hr className="my-8 border-zinc-200" />,
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-zinc-200 bg-zinc-50 px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-zinc-200 px-3 py-2">{children}</td>,
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Link href={href} className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener" className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900">
        {children}
      </a>
    ),
  // Images in the text are left out: covers and product photos go through the image pipeline.
  img: () => null,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[15px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
