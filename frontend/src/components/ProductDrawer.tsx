import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { getProduct } from "../api/client";
import { ApiError } from "../api/http";
import type { ChangeOut, ProductDetail, SnapshotOut } from "../api/types";
import { compareNewest, unitChangePct } from "../lib/changes";
import {
  betweenDays,
  capitalize,
  countNoun,
  formatDate,
  formatDateRange,
  formatDateShort,
  formatInt,
  formatMoney,
  formatPercent,
  formatUnitPrice,
  quoted,
  unitProse,
} from "../lib/format";
import { direction, kindLabel, SIZE_KINDS } from "../lib/kinds";
import { sizeCase } from "../lib/story";
import { takeOpener, type DrawerState } from "../lib/drawerRoute";
import { useApi, usePageTitle } from "../lib/useApi";
import { brandName, displayName } from "../lib/text";
import { NoBreak, noBreak } from "./NoBreak";
import { SkLine, describeLoadError } from "./Status";
import { StepChart } from "./StepChart";
import "../styles/drawer.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

// How a record's listed size was read: "rules", "a language model, confidence 0.93", or null.
function readBy(snapshot: SnapshotOut | null | undefined): string | null {
  const method = snapshot?.parse_method;
  if (!method) return null;
  const confidence = snapshot?.parse_confidence;
  const conf = confidence !== null && confidence !== undefined ? `, confidence ${confidence.toFixed(2)}` : "";
  if (method === "rule") return "rules";
  if (method.includes("llm") || method.includes("model")) return `a language model${conf}`;
  return `${method}${conf}`;
}

// A product's changes, newest first, in the API's own order: detection time, then id.
function newestFirst(changes: ChangeOut[]): ChangeOut[] {
  return [...changes].sort(compareNewest);
}

// The backend starts a new record when the size text (ignoring case), the regular price or the
// product name changes. The name is not in the record, so a record whose size and price match
// the one before it marks a name change.
function nameChanges(snapshots: SnapshotOut[]): Set<number> {
  const ordered = [...snapshots].sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at) || a.id - b.id);
  const ids = new Set<number>();
  ordered.forEach((s, i) => {
    const prev = ordered[i - 1];
    if (prev && prev.size_text.trim().toLowerCase() === s.size_text.trim().toLowerCase() && prev.price_regular === s.price_regular) {
      ids.add(s.id);
    }
  });
  return ids;
}

// One or two sentences about the product, written from its records.
export function summaryOf(detail: ProductDetail): string {
  const since = formatDate(detail.first_seen_at) ?? "";
  const checks = detail.snapshots.reduce((sum, s) => sum + s.observations, 0);
  const changes = newestFirst(detail.changes);
  const latest = changes[0];
  if (!latest) {
    return `Tracked since ${since}, with no size or price change across ${countNoun(checks, "check")}.`;
  }
  const pct = unitChangePct(latest);
  const unit = latest.after?.unit_price?.unit ?? latest.before?.unit_price?.unit;
  const before = latest.before;
  const after = latest.after;
  const sizePart =
    before && after && before.size_text !== after.size_text ? `the listed size went from ${quoted(before.size_text)} to ${quoted(after.size_text)}` : "";
  const priceBefore = formatMoney(before?.price_regular);
  const priceAfter = formatMoney(after?.price_regular);
  const pricePart =
    priceBefore && priceAfter && priceBefore !== priceAfter
      ? `the shelf price went from ${priceBefore} to ${priceAfter}`
      : priceAfter
        ? `the shelf price stayed at ${priceAfter}`
        : "";
  const parts = [sizePart, pricePart].filter(Boolean).join(" and ");
  const when = betweenDays(latest.before_seen_at, latest.after_seen_at) ?? `on ${formatDateShort(latest.detected_at) ?? ""}`;
  const moved = pct !== null && pct !== 0 ? `, so the price per ${unitProse(unit)} ${pct > 0 ? "rose" : "fell"} ${formatPercent(Math.abs(pct))!.replace(/^\+/, "")}` : "";
  const lead = changes.length === 1 ? "One change" : capitalize(countNoun(changes.length, "change"));
  const opening = changes.length === 1 ? capitalize(when) : `Most recently, ${when}`;
  return `${lead} since ${since}. ${opening}, ${parts}${moved}.`;
}

// The caveat for a product whose listed size changed: what its label texts show, when they show
// something the summary does not, and that the detector cannot tell an edited listing from a new
// package. Null for a product with no size change.
export function sizeNoteOf(detail: ProductDetail): string | null {
  const latest = newestFirst(detail.changes).find((change) => SIZE_KINDS.has(change.kind));
  if (!latest) return null;
  const found = sizeCase(latest);
  const clue = found.noteKind === "pack" || found.noteKind === "each" || found.noteKind === "name" ? found.note : "";
  const other = latest.kind === "grow" ? "a larger package" : "a smaller package";
  return [clue, `The detector reads the listed size, so a corrected listing and ${other} look the same.`].filter(Boolean).join(" ");
}

function StatesTable({ snapshots }: { snapshots: SnapshotOut[] }) {
  const rows = [...snapshots].sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at));
  const renamed = nameChanges(snapshots);
  return (
    <table className="dr-table">
      <caption>Stored records, newest first</caption>
      <thead>
        <tr>
          <th scope="col">Listed size</th>
          <th scope="col">Price</th>
          <th scope="col" className="n">
            Per unit
          </th>
          <th scope="col">Seen</th>
          <th scope="col" className="n">
            Checks
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id}>
            <td>
              <b>{s.size_text || "no size listed"}</b>
              <span className="pm">{readBy(s) ? `read by ${readBy(s)}` : "size not read"}</span>
              {renamed.has(s.id) ? <span className="pm">name changed</span> : null}
            </td>
            <td data-l="Price">
              {formatMoney(s.price_regular) ?? "no price"}
              {s.price_promo ? <span className="pm">promo {formatMoney(s.price_promo)}</span> : null}
            </td>
            <td className="n" data-l="Per unit">
              {formatUnitPrice(s.unit_price?.value, s.unit_price?.unit) ?? "not parsed"}
            </td>
            <td data-l="Seen">{formatDateRange(s.first_seen_at, s.last_seen_at)}</td>
            <td className="n" data-l="Checks">
              {formatInt(s.observations)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Body({ detail }: { detail: ProductDetail }) {
  const latest: ChangeOut | undefined = newestFirst(detail.changes)[0];
  const dir = latest ? direction(latest) : "flat";
  const current = detail.current ?? detail.snapshots[detail.snapshots.length - 1];
  const unit = current?.unit_price?.unit;
  const [imageOk, setImageOk] = useState(true);
  const sizeNote = sizeNoteOf(detail);
  return (
    <>
      <div className="dr-body">
        <div className="dr-top">
          {detail.product.image_url && imageOk ? (
            <img
              className="dr-img"
              src={detail.product.image_url}
              alt=""
              width={96}
              height={96}
              loading="lazy"
              onError={() => setImageOk(false)}
            />
          ) : null}
          <div>
            <h2 className="dr-title" id="dr-title">
              {noBreak(displayName(detail.product.description))}
            </h2>
            <p className="dr-meta">
              {detail.product.category}
              {detail.product.brand ? (
                <>
                  <span className="sep">·</span>
                  {brandName(detail.product.brand, detail.product.description)}
                </>
              ) : null}
              {latest ? (
                <>
                  <span className="sep">·</span>
                  <span className={`kind ${dir === "more" ? "m" : dir === "less" ? "l" : ""}`}>{kindLabel(latest.kind, true)}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <p className="dr-sum">
          <NoBreak text={summaryOf(detail)} />
        </p>
        {sizeNote ? (
          <p className="dr-note">
            <NoBreak text={sizeNote} />
          </p>
        ) : null}
        <figure className="dr-fig">
          <figcaption>
            Price per {unitProse(unit)}, {formatDateRange(detail.first_seen_at, detail.last_seen_at)}
          </figcaption>
          <StepChart snapshots={detail.snapshots} changes={detail.changes} />
        </figure>
        <StatesTable snapshots={detail.snapshots} />
        <dl className="dr-dl">
          <dt>Kroger product id</dt>
          <dd>{detail.upc ?? detail.product.id}</dd>
          <dt>Category</dt>
          <dd>{detail.product.category}</dd>
          {detail.retailer_categories?.length ? (
            <>
              <dt>Kroger category</dt>
              <dd>{[...new Set(detail.retailer_categories)].join(", ")}</dd>
            </>
          ) : null}
          <dt>First seen</dt>
          <dd>{formatDate(detail.first_seen_at)}</dd>
          <dt>Last seen</dt>
          <dd>{formatDate(detail.last_seen_at)}</dd>
          <dt>Size read by</dt>
          <dd>{readBy(current) ?? "not read"}</dd>
          <dt>Still listed</dt>
          <dd>{detail.active ? "Yes" : "No, dropped from the listing"}</dd>
        </dl>
      </div>
    </>
  );
}

export function ProductDrawer() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = useApi((signal) => getProduct(id, signal), [id]);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  const title = state.status === "ok" ? displayName(state.data.product.description) : state.status === "error" ? "Product" : null;
  usePageTitle(title);

  const close = useCallback(() => {
    const from = (location.state as DrawerState | null)?.fromArticle;
    if (from) void navigate(-1);
    else void navigate({ pathname: "/", search: location.search }, { replace: true });
  }, [location.state, location.search, navigate]);

  // Take the opener once, lock the page behind, focus the panel, and give focus back on close.
  useLayoutEffect(() => {
    // The opener is one-shot; the ref keeps it through a StrictMode remount.
    opener.current = takeOpener() ?? opener.current;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.classList.add("locked");
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.body.classList.remove("locked");
      document.body.style.paddingRight = "";
      const target = opener.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const kicker =
    state.status === "ok" ? "Product record" : state.status === "error" ? "Product" : "Loading";

  return (
    <>
      <div className="scrim on" onClick={close} aria-hidden="true" />
      <div
        className="drawer on"
        role="dialog"
        aria-modal="true"
        aria-labelledby={state.status === "ok" ? "dr-title" : "dr-kicker"}
        tabIndex={-1}
        ref={panel}
        onKeyDown={trapTab}
      >
        <div className="dr-bar">
          <span className="dr-kicker" id="dr-kicker">
            {kicker}
          </span>
          <button className="dr-close" type="button" onClick={close}>
            Close
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
        {state.status === "loading" ? (
          <div className="dr-body" aria-busy="true">
            <p className="sr-only">Loading the product record</p>
            <SkLine width="82%" height={26} />
            <SkLine width="50%" height={26} />
            <SkLine width={200} height={12} style={{ marginTop: 10 }} />
            <SkLine width="100%" height={16} style={{ marginTop: 22 }} />
            <SkLine width="94%" height={16} />
            <SkLine width="40%" height={16} />
            <SkLine width="100%" height={190} style={{ marginTop: 26 }} />
            <SkLine width="100%" height={16} style={{ marginTop: 26 }} />
            <SkLine width="100%" height={16} />
            <SkLine width="100%" height={16} />
          </div>
        ) : null}
        {state.status === "error" ? (
          <div className="dr-body">
            <p className="dr-sum" role="alert">
              {state.error instanceof ApiError && state.error.status === 404
                ? `No tracked product has the id ${id}.`
                : describeLoadError(state.error)}
            </p>
            {!(state.error instanceof ApiError && state.error.status === 404) ? (
              <button type="button" className="more" onClick={state.reload}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {state.status === "ok" ? <Body detail={state.data} /> : null}
      </div>
    </>
  );
}
