import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

// With no `to`, returns to the previous page, or Home when this is the first page of the tab
export function BackButton({ label, to }: { label: string; to?: string }) {
  const [, navigate] = useLocation();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 w-8 p-0 md:h-auto md:w-auto md:px-3 md:py-2 text-muted-foreground hover:text-foreground shrink-0 shadow-sm"
      onClick={() => {
        if (to) navigate(to);
        else if (window.history.length > 1) window.history.back();
        else navigate("/");
      }}
      data-testid="button-back"
    >
      <ArrowLeft className="w-5 h-5 md:mr-2" />
      <span className="hidden md:inline font-semibold">{label}</span>
    </Button>
  );
}
