import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CategoryCount, ChangeOut, FieldProduct } from "../api/types";
import type { Run, Story as StoryData, StoryStep } from "../lib/story";
import { useOpenProduct } from "../lib/drawerRoute";
import { coarsePointer, STACKED_QUERY } from "../lib/layout";
import { Graphic } from "./Graphic";
import { NoBreak, noBreak } from "./NoBreak";
import { ProductLink } from "./ProductLink";

// Turns a copy run into markup. Kept here so the story module stays free of JSX.
export function renderRuns(runs: Run[], pickVerb = "Select a dot"): ReactNode[] {
  return runs.map((run, i) => {
    if (typeof run === "string") return <NoBreak key={i} text={run} />;
    if ("b" in run) return <strong key={i}>{noBreak(run.b)}</strong>;
    if ("dot" in run) return <i key={i} className={`kd ${run.dot === "more" ? "m" : "l"}`} aria-hidden="true" />;
    if ("fn" in run) {
      return (
        <sup key={i}>
          <a href={`#fn${run.fn}`} id={`r${run.fn}`} aria-label={`Note ${run.fn}`}>
            {run.fn}
          </a>
        </sup>
      );
    }
    if ("link" in run) {
      return (
        <a key={i} href={run.link}>
          {run.text}
        </a>
      );
    }
    if ("product" in run) {
      return (
        <ProductLink key={i} id={run.product} className="pn">
          {noBreak(run.text)}
        </ProductLink>
      );
    }
    return <span key={i}>{pickVerb}</span>;
  });
}

function StepText({ step, pickVerb }: { step: StoryStep; pickVerb: string }) {
  return (
    <>
      {step.paragraphs.map((paragraph, i) => (
        <p key={i}>{renderRuns(paragraph, pickVerb)}</p>
      ))}
      <p className="sr-only">Graphic: {step.alt}</p>
    </>
  );
}

// Where a step becomes active, as a distance from the top of the viewport.
function triggerLine(stacked: boolean): number {
  return window.innerHeight * (stacked ? 0.8 : 0.62);
}

// The last step whose top has crossed the trigger line is the active one.
function activeStep(steps: HTMLElement[], stacked: boolean): number {
  const trigger = triggerLine(stacked);
  let index = 0;
  steps.forEach((element, i) => {
    if (element.getBoundingClientRect().top < trigger) index = i;
  });
  return index;
}

export function Story({
  story,
  products,
  changes,
  categories,
}: {
  story: StoryData | null;
  products: FieldProduct[] | null;
  changes: ChangeOut[] | null;
  categories: CategoryCount[] | null;
}) {
  const openProduct = useOpenProduct();
  const stepsRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pickVerb = useMemo(() => (coarsePointer() ? "Tap a dot" : "Select a dot"), []);
  const steps = story?.steps ?? null;

  useEffect(() => {
    const container = stepsRef.current;
    if (!container || !steps) return undefined;
    const stacked = window.matchMedia(STACKED_QUERY);
    const elements = () => Array.from(container.querySelectorAll<HTMLElement>(".step"));
    let frame = 0;
    const update = () => {
      frame = 0;
      indexRef.current = activeStep(elements(), stacked.matches);
      setIndex(indexRef.current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Switching between the side-by-side and the stacked layout (turning a tablet) changes the
    // height of everything above and between the steps, so the same scroll offset would land on
    // another step. The step that was active goes back to just past its trigger line instead.
    const onLayoutChange = () => {
      const element = elements()[indexRef.current];
      if (element) {
        const past = element.getBoundingClientRect().top - triggerLine(stacked.matches) + 24;
        window.scrollTo({ top: window.scrollY + past, behavior: "instant" });
      }
      onScroll();
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    stacked.addEventListener("change", onLayoutChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      stacked.removeEventListener("change", onLayoutChange);
      cancelAnimationFrame(frame);
    };
  }, [steps]);

  const current = steps?.[Math.min(index, (steps?.length ?? 1) - 1)] ?? null;
  const ready = story && products && changes && categories;

  return (
    <section className="scrolly" id="story" aria-label="What the checks found">
      <div className="steps" ref={stepsRef}>
        {steps
          ? steps.map((step, i) => (
              <div key={step.kind} className={`step${i === index ? " is-on" : ""}`} data-step={step.kind}>
                <div className="step-in">
                  <StepText step={step} pickVerb={pickVerb} />
                </div>
              </div>
            ))
          : [0, 1, 2].map((i) => (
              <div key={i} className={`step${i === 0 ? " is-on" : ""}`} aria-hidden="true">
                <div className="step-in">
                  <p className="sk-p">
                    <span className="sk-line" style={{ width: "96%" }} />
                    <span className="sk-line" style={{ width: "88%" }} />
                    <span className="sk-line" style={{ width: "54%" }} />
                  </p>
                </div>
              </div>
            ))}
      </div>
      <div className="gcol">
        {ready ? (
          <Graphic
            story={story}
            products={products}
            changes={changes}
            categories={categories}
            step={current?.kind ?? "grid"}
            onOpen={openProduct}
          />
        ) : (
          <figure className="sticky" aria-label="Chart loading">
            <figcaption className="g-head">
              <div className="swap">
                <p className="g-title">
                  <span className="sk-line" style={{ width: 220, height: 14 }} />
                </p>
                <div className="g-legend">
                  <span className="sk-line" style={{ width: 90, height: 12 }} />
                </div>
              </div>
            </figcaption>
            <div className="g-stage g-sk" aria-hidden="true" />
            <p className="g-source">
              <span className="sk-line" style={{ width: 280, height: 12 }} />
            </p>
          </figure>
        )}
      </div>
    </section>
  );
}
