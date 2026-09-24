import { useEffect, useMemo, useRef } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router";
import { getAllChanges, getCategories, getField, getStats } from "../api/client";
import { ArticleHead } from "../components/ArticleHead";
import { AskSection } from "../components/AskSection";
import { ChangesSection } from "../components/ChangesSection";
import { FindSection } from "../components/FindSection";
import { Footnotes } from "../components/Footnotes";
import { MethodSection } from "../components/MethodSection";
import { describeLoadError } from "../components/Status";
import { Story } from "../components/Story";
import { buildStory } from "../lib/story";
import { useApi, usePageTitle } from "../lib/useApi";

export function HomePage() {
  const stats = useApi(getStats, []);
  const categories = useApi(getCategories, []);
  const field = useApi(getField, []);
  const changes = useApi(getAllChanges, []);
  const location = useLocation();
  const [params] = useSearchParams();
  usePageTitle(null);

  const story = useMemo(
    () =>
      stats.status === "ok" && changes.status === "ok" && categories.status === "ok"
        ? buildStory({ stats: stats.data, changes: changes.data, categories: categories.data, now: new Date() })
        : null,
    [stats, changes, categories],
  );

  const failure = [stats, categories, field, changes].find((state) => state.status === "error")?.error ?? null;
  const ready = story !== null && field.status === "ok";

  // Hash links scroll once the sections exist. Old links of the form /?kind=shrink land on
  // the change table.
  const landedOnKind = useRef(!location.hash && params.has("kind"));
  useEffect(() => {
    if (!ready) return;
    const hash = location.hash.slice(1);
    let target = hash ? document.getElementById(hash) : null;
    if (!target && landedOnKind.current) {
      landedOnKind.current = false;
      target = document.getElementById("changes");
    }
    if (!target) return;
    const element = target;
    const frame = requestAnimationFrame(() => element.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [ready, location.hash, location.key]);

  function retry() {
    for (const state of [stats, categories, field, changes]) if (state.status === "error") state.reload();
  }

  if (failure) {
    return (
      <article>
        <header className="head" id="top">
          <p className="kicker">Grocery prices</p>
          <h1>The records could not be loaded.</h1>
          <p className="dek" role="alert">
            {describeLoadError(failure)}
          </p>
          <button type="button" className="more" onClick={retry}>
            Retry
          </button>
        </header>
        <div className="tools">
          <MethodSection method={null} />
          <Footnotes />
        </div>
      </article>
    );
  }

  return (
    <article>
      <ArticleHead story={story} />
      <Story
        story={story}
        products={field.status === "ok" ? field.data.products : null}
        changes={changes.status === "ok" ? changes.data : null}
        categories={categories.status === "ok" ? categories.data : null}
      />
      <div className="tools">
        <AskSection products={field.status === "ok" ? field.data.products : null} />
        <ChangesSection
          changes={changes.status === "ok" ? changes.data : null}
          categories={categories.status === "ok" ? categories.data : null}
        />
        <FindSection
          products={field.status === "ok" ? field.data.products : null}
          categories={categories.status === "ok" ? categories.data : null}
        />
        <MethodSection method={story?.method ?? null} />
        <Footnotes />
      </div>
      <Outlet />
    </article>
  );
}
