import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { caffeineClient } from "../api/caffeine-client.js";

function SafeExternalLink({
  href,
  onClick,
  children,
  ...props
}: ComponentPropsWithoutRef<"a">) {
  const safeHref = href?.startsWith("https://") ? href : undefined;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (safeHref) void caffeineClient.openExternal(safeHref);
  };
  return (
    <a {...props} href={safeHref} onClick={handleClick} rel="noreferrer">
      {children}
    </a>
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
