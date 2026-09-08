import type { MouseEvent, ReactNode } from "react";
import { useHref, useNavigate } from "react-router";

// A table row that opens a page when clicked anywhere, while links inside it keep working
// and text selection does not trigger navigation.
export function LinkRow({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate();
  const href = useHref(to);

  function onClick(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, select")) return;
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    void navigate(to);
  }

  return (
    <tr className="link-row" onClick={onClick}>
      {children}
    </tr>
  );
}
