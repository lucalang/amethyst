import Image from "next/image";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { isAllowedImageUrl } from "@/lib/validation/image-hosts";
import { cn } from "@/lib/utils";

// GitHub-style sanitization; raw HTML is never rendered (no rehype-raw).
const schema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"], src: ["https"] },
};

export function Markdown({ content, imageHosts, className }: { content: string; imageHosts: readonly string[]; className?: string }) {
  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-jade underline underline-offset-2">
        {children}
      </a>
    ),
    img: ({ src, alt }) => {
      const url = typeof src === "string" ? src : "";
      if (!isAllowedImageUrl(url, imageHosts)) {
        return (
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-jade underline underline-offset-2">
            {alt || "Image"} (external image)
          </a>
        );
      }
      return (
        <Image
          src={url}
          alt={alt ?? ""}
          width={960}
          height={540}
          sizes="(min-width: 768px) 720px, 100vw"
          className="my-3 h-auto max-w-full rounded-md border border-border"
        />
      );
    },
  };

  return (
    <div
      className={cn(
        "prose-archive text-sm leading-relaxed break-words [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-border [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-secondary [&_pre]:p-3 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-secondary [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, schema]]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
