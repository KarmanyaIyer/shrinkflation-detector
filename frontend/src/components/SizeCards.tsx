import { forwardRef } from "react";
import { Link } from "react-router";
import { formatPercent, quoted, unitWord } from "../lib/format";
import { productPath, rememberOpener } from "../lib/drawerRoute";
import type { SizeCase, StepKind } from "../lib/story";

// The before and after label cards for the size steps. The canvas dot for each product lands
// on the `.sc-dot` placeholder, measured by the graphic after layout.
function Card({ item, active }: { item: SizeCase; active: boolean }) {
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
  return (
    <div className={`sc ${item.kind === "grow" ? "grow" : "shrink"}${active ? " on" : ""}`} data-id={item.id}>
      <span className="sc-top">
        <span className="sc-dot" data-dot={item.id} aria-hidden="true" />
        <Link
          className="sc-name"
          to={productPath(item.id)}
          state={{ fromArticle: true }}
          onClick={(event) => rememberOpener(event.currentTarget)}
        >
          {item.short}
        </Link>
      </span>
      <span className="sc-when">{item.when}</span>
      <span className="pk" aria-hidden="true" style={{ ["--hb" as string]: hb, ["--ha" as string]: ha }}>
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
      {pct ? <span className="sc-big">{pct}</span> : null}
      {item.unitBefore && item.unitAfter ? (
        <span className="sc-bigl">
          Price per {unit}
          <br />
          {item.unitBefore} to {item.unitAfter}
        </span>
      ) : null}
      {item.note ? <span className="sc-note">{item.note}</span> : null}
      <span className="sc-compact">
        {quoted(item.before)} to {quoted(item.after)}
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
  { shrinks: SizeCase[]; grows: SizeCase[]; step: StepKind }
>(function SizeCards({ shrinks, grows, step }, ref) {
  const shown = step === "shrinks" || step === "grows";
  return (
    <div className="g-cards" ref={ref} data-step={step} aria-hidden={!shown} inert={!shown}>
      {shrinks.length ? (
        <div className="sc-group shrank">
          <p className="sc-h">Size text went down</p>
          <div className="sc-row">
            {shrinks.map((item) => (
              <Card key={item.id} item={item} active={step === "shrinks"} />
            ))}
          </div>
        </div>
      ) : null}
      {grows.length ? (
        <div className="sc-group grew">
          <p className="sc-h">Size text went up</p>
          <div className="sc-row">
            {grows.map((item) => (
              <Card key={item.id} item={item} active={step === "grows"} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
