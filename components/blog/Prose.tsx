// components/blog/Prose.tsx
// Tailwind typography wrapper for the rendered Markdown body.
// Adds the prose styles (headings, lists, links, blockquotes,
// tables) plus custom link colours that match the brand palette.
//
// Body H2 sections get a small primary-coloured kicker bar above
// the heading so each section visually matches the page-level
// sections (About, Services, FAQ etc. all open with the same
// horizontal bar + uppercase label treatment).

interface ProseProps {
  readonly html: string
}

export function Prose({ html }: ProseProps) {
  return (
    <div
      className="
        prose prose-slate max-w-none
        prose-headings:font-extrabold prose-headings:tracking-tight prose-headings:text-foreground
        prose-h2:mt-14 prose-h2:flex prose-h2:flex-col prose-h2:gap-3
        prose-h2:before:content-[''] prose-h2:before:block prose-h2:before:h-px prose-h2:before:w-12 prose-h2:before:bg-primary
        prose-h2:text-2xl prose-h2:sm:text-3xl prose-h2:font-extrabold
        prose-h3:mt-8 prose-h3:text-xl prose-h3:sm:text-2xl
        prose-p:leading-relaxed prose-p:text-foreground/85
        prose-a:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-strong:font-bold prose-strong:text-foreground
        prose-li:text-foreground/85
        prose-blockquote:border-l-primary prose-blockquote:bg-muted/40 prose-blockquote:py-2 prose-blockquote:text-foreground/80
        prose-table:rounded-lg prose-table:border prose-table:border-border
        [&_table]:block [&_table]:overflow-x-auto
        prose-th:bg-muted/40 prose-th:px-3 prose-th:py-2 prose-th:text-left
        prose-td:border-t prose-td:border-border prose-td:px-3 prose-td:py-2
        prose-img:rounded-xl prose-img:shadow-md
        prose-hr:border-border
        [&_.blog-material-link]:font-semibold [&_.blog-material-link]:text-primary [&_.blog-material-link]:underline-offset-4 [&_.blog-material-link]:decoration-primary/40 [&_.blog-material-link]:transition-colors hover:[&_.blog-material-link]:text-primary-hover hover:[&_.blog-material-link]:decoration-primary
        [&_.blog-town-link]:font-semibold [&_.blog-town-link]:text-foreground [&_.blog-town-link]:underline [&_.blog-town-link]:decoration-primary/50 [&_.blog-town-link]:underline-offset-4 hover:[&_.blog-town-link]:text-primary hover:[&_.blog-town-link]:decoration-primary
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}