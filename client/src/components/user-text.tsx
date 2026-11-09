import { cn } from "@/lib/utils";
import type { ElementType, ReactNode } from "react";

/**
 * Text that people typed: project and supplier names, notes, descriptions, and the Arabic-only permit
 * catalogue. It is never translated — it is shown exactly as entered, in whatever language that was.
 *
 * What this adds is direction. `dir="auto"` alone is not enough: it decides from the FIRST strong
 * character in the node, so "ملاحظة: Acme Corp وصلت" is laid out as one Arabic run and the Latin name
 * lands in the wrong place. `unicode-bidi: plaintext` applies the same rule per paragraph instead,
 * which is what makes mixed content read correctly inside either interface language.
 */
export function UserText({
  children,
  as: Tag = "span",
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return (
    <Tag dir="auto" data-user-text="" className={cn("[unicode-bidi:plaintext]", className)}>
      {children}
    </Tag>
  );
}
