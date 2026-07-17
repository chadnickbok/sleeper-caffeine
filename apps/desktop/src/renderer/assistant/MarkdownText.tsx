import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentPropsWithoutRef, MouseEvent } from "react";

function SafeExternalLink({
  href,
  onClick,
  ...props
}: ComponentPropsWithoutRef<"a">) {
  const safeHref = href?.startsWith("https://") ? href : undefined;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (safeHref) void window.sleeperCaffeine.openExternal(safeHref);
  };
  return (
    <a {...props} href={safeHref} onClick={handleClick} rel="noreferrer" />
  );
}

export function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      className="caffeine-markdown"
      remarkPlugins={[remarkGfm]}
      components={{ a: SafeExternalLink }}
      defer
      smooth
    />
  );
}
