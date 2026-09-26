import { forwardRef, type CSSProperties } from "react";
import { formatPercent, quoted, unitWord } from "../lib/format";
import type { SizeCase, StepKind } from "../lib/story";
import { displayName } from "../lib/text";
import { noBreak } from "./NoBreak";
import { ProductLink } from "./ProductLink";

// The before and after label cards for the size steps. The canvas dot for each product lands
// on the `.sc-dot` placeholder, measured by the graphic after layout.
//
// On a wide stage every card sits in one grid whose rows are shared through subgrid, so the
// package boxes and figures line up across both groups whatever the length of the names. On a
// compact stage the cards are rows and only the group for the current step is shown.
function Card({ item, active }: { item: SizeCase; active: boolean }) {
  const kind = item.kind === "grow" ? "grow" : "shrink";
  const qb = item.quantityBefore ?? 1;
  const qa = item.quantityAfter ?? 1;
  const max = Math.max(qb, qa, 0.0001);
  const hb = `${((qb / max) * 100).toFixed(1)}%`;
  const ha = `${((qa / max) * 100).toFixed(1)}%`;
  const price = item.samePrice
    ? `Shelf price ${item.priceAfter}, unchanged`
    : item.priceBefore && item.priceAfter
      ? `Shelf price ${item.priceBefore} to ${item.priceAfter}`
      : item.priceAfter
        ? `Shelf price ${item.priceAfter}`
        : "No shelf price listed";
  const pct = formatPercent(item.unitPct);
  const unit = unitWord(item.unit);
  // A dimmed card is context for the active group, not something to use: it leaves the tab
  // order and the accessibility tree until its step comes up.
  return (
    <div className={`sc ${kind}${active ? " on" : ""}`} data-id={item.id} inert={!active} aria-hidden={!active}>
      <span className="sc-top">
        <span className="sc-dot" data-dot={item.id} data-kind={kind} aria-hidden="true" />
        <ProductLink id={item.id} className="sc-name">
          {noBreak(displayName(item.name))}
        </ProductLink>
      </span>
      <span className="sc-when">{item.when}</span>
      <span className="pk" aria-hidden="true" style={{ "--hb": hb, "--ha": ha } as CSSProperties}>
        <span className="pk-col">
          <span className="pk-box pk-before" />
        </span>
        <span className="pk-col">
          <span className="pk-ghost" />
          <span className="pk-box pk-fill" />
        </span>
      </span>
      <span className="sc-labels">
        <span>
          <i className="sw" aria-hidden="true" />
          {quoted(item.before)}
        </span>
        <span>
          <i className="sw f" aria-hidden="true" />
          {quoted(item.after)}
        </span>
      </span>
      <span className="sc-price">{price}</span>
      {/* Always rendered so each card fills the same subgrid rows. */}
      <span className="sc-big">{pct ?? ""}</span>
      <span className="sc-bigl">
        {item.unitBefore && item.unitAfter ? (
          <>
            Price per {unit}
            <br />
            {item.unitBefore} to {item.unitAfter}
          </>
        ) : null}
      </span>
      <span className="sc-note">{item.note}</span>
      <span className="sc-compact">
        <span className="nw">{quoted(item.before)}</span> to <span className="nw">{quoted(item.after)}</span>
        {item.priceAfter ? ` at ${item.priceAfter}` : ""}
        <br />
        {pct ? <b>{pct}</b> : null}
        {pct ? ` per ${unit}, ` : ""}
        {item.when}
      </span>
    </div>
  );
}

export const SizeCards = forwardRef<
  HTMLDivElement,
  { shrinks: SizeCase[]; grows: SizeCase[]; step: StepKind; compact: boolean }
>(function SizeCards({ shrinks, grows, step, compact }, ref) {
  const shown = step === "shrinks" || step === "grows";
  const ns = shrinks.length;
  const ng = grows.length;
  // Shrink columns may narrow to nothing; grow columns keep room for their one-line heading.
  // A group with no cards gets no track, since repeat(0, ...) would drop the whole template.
  const tracks = [ns ? `repeat(${ns}, minmax(0, 1fr))` : "", ng ? `repeat(${ng}, 1fr)` : ""].filter(Boolean).join(" ");
  const columns: CSSProperties | undefined = compact || !tracks ? undefined : { gridTemplateColumns: tracks };
  return (
    <div className={`g-cards${compact ? " compact" : ""}`} ref={ref} data-step={step} aria-hidden={!shown} inert={!shown}>
      <div className="sc-grid" style={columns}>
        {ns ? (
          <div className={`sc-group shrank${step === "shrinks" ? " on" : ""}`}>
            <p className="sc-h" style={compact ? undefined : { gridColumn: `1 / span ${ns}` }}>
              Listed size went down
            </p>
            <div className="sc-row">
              {shrinks.map((item) => (
                <Card key={item.id} item={item} active={step === "shrinks"} />
              ))}
            </div>
          </div>
        ) : null}
        {ng ? (
          <div className={`sc-group grew${step === "grows" ? " on" : ""}${ns ? "" : " only"}`}>
            <p className="sc-h" style={compact ? undefined : { gridColumn: `${ns + 1} / span ${ng}` }}>
              Listed size went up
            </p>
            <div className="sc-row">
              {grows.map((item) => (
                <Card key={item.id} item={item} active={step === "grows"} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
