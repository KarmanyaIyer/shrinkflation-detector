import { createContext, useContext, useEffect } from "react";

// Lets the article tell the masthead that its sections did not render (the API is down), so the
// masthead does not offer links to sections that are not on the page.
export const ArticleDownContext = createContext<(down: boolean) => void>(() => undefined);

export function useReportArticleDown(down: boolean): void {
  const report = useContext(ArticleDownContext);
  useEffect(() => {
    report(down);
    return () => report(false);
  }, [down, report]);
}
