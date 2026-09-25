import { useEffect, useMemo, useRef } from "react";
import { Outlet, useLocation, useNavigationType, useSearchParams } from "react-router";
import { getAllChanges, getCategories, getField, getStats } from "../api/client";
import { ArticleHead } from "../components/ArticleHead";
import { AskSection } from "../components/AskSection";
import { ChangesSection } from "../components/ChangesSection";
import { FindSection } from "../components/FindSection";
import { Footnotes, NO_REFS } from "../components/Footnotes";
import { MethodSection } from "../components/MethodSection";
import { describeLoadError } from "../components/Status";
import { Story } from "../components/Story";
import { useReportArticleDown } from "../lib/articleStatus";
import { buildStory } from "../lib/story";
import { useApi, usePageTitle } from "../lib/useApi";

export function HomePage() {
  const stats = useApi(getStats, []);
  const categories = useApi(getCategories, []);
  const field = useApi(getField, []);
  const changes = useApi(getAllChanges, []);
  const location = useLocation();
  const navigationType = useNavigationType();
  const [params] = useSearchParams();
  usePageTitle(null);

  // useApi returns a new wrapper object on every render; the data inside only changes when a
  // response lands, so the story is rebuilt only then.
  const statsData = stats.data;
  const changesData = changes.data;
  const categoriesData = categories.data;
  const story = useMemo(
    () =>
      statsData && changesData && categoriesData
        ? buildStory({ stats: statsData, changes: changesData, categories: categoriesData, now: new Date() })
        : null,
    [statsData, changesData, categoriesData],
  );
  // The products the article names, for the search suggestions.
  const featured = useMemo(
    () =>
      story
        ? [
            ...story.shrinks.map((item) => item.id),
            ...story.grows.map((item) => item.id),
            story.annotations.down?.id,
            story.annotations.up?.id,
          ].filter((id): id is string => Boolean(id))
        : [],
    [story],
  );

  const failure = [stats, categories, field, changes].find((state) => state.status === "error")?.error ?? null;
  const ready = story !== null && field.status === "ok";
  useReportArticleDown(failure !== null);

  // Hash links scroll once the sections exist. Old links of the form /?kind=shrink land on
  // the change table. Going back or forward (which is also how the drawer closes) leaves the
  // scroll position to the browser, so returning to /#ask does not jump the article again.
  const landedOnKind = useRef(!location.hash && params.has("kind"));
  const handled = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const wentBack = handled.current && navigationType === "POP";
    handled.current = true;
    if (wentBack) return;
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
  }, [ready, location.hash, location.key, navigationType]);

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
          <Footnotes refs={NO_REFS} />
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
        <FindSection products={field.status === "ok" ? field.data.products : null} featured={featured} />
        <MethodSection method={story?.method ?? null} />
        <Footnotes
          refs={{ 1: story !== null, 2: (story?.shrinks.length ?? 0) > 0, 3: changes.status === "ok" }}
          sizeNote={story?.sizeNote}
        />
      </div>
      <Outlet />
    </article>
  );
}
