/** Renders an assistant answer from parseMarkup's blocks: plain React elements, no HTML strings. */
import { Fragment, useMemo } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { parseMarkup, type Inline } from "./markup";

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((part, i) => {
        if (part.type === "bold") return <strong key={i} className="font-semibold text-ink">{part.text}</strong>;
        if (part.type === "link")
          return (
            <Link
              key={i}
              to={part.href}
              className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4 hover:decoration-ink"
            >
              {part.text}
            </Link>
          );
        return <Fragment key={i}>{part.text}</Fragment>;
      })}
    </>
  );
}

export function RichAnswer({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkup(text), [text]);
  return (
    <div className={cn("space-y-3 text-[0.95rem] leading-relaxed text-graphite", className)}>
      {blocks.map((block, i) =>
        block.type === "paragraph" ? (
          <p key={i}>
            <Inlines inlines={block.inlines} />
          </p>
        ) : (
          <ul key={i} className="space-y-2 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                <span className="min-w-0">
                  <Inlines inlines={item} />
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
