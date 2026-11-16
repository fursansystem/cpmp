import type { MouseEvent, ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface RefLinkProps {
  /** Page of the record the number belongs to */
  href?: string;
  /** For records that open in a dialog rather than on a page of their own */
  onOpen?: () => void;
  className?: string;
  children: ReactNode;
}

const base =
  "inline cursor-pointer rounded-sm underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none text-inherit font-[inherit] bg-transparent border-0 p-0";

// A reference number that opens its own record. It keeps the look of the text around it, and stops the
// click there so a clickable row or card behind it does not open as well.
export function RefLink({ href, onOpen, className, children }: RefLinkProps) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  if (href) {
    return (
      <Link href={href} onClick={stop} className={cn(base, className)}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onOpen?.();
      }}
      className={cn(base, className)}
    >
      {children}
    </button>
  );
}
