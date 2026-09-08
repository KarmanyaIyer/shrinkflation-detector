"""Choose the products to track by searching the catalog with everyday grocery terms.

The basket favors packaged goods sold by unit with a price at the chosen store. Items sold by
weight (produce, deli) are skipped because their size field is nominal.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import select

from shrinkflation.config import get_settings
from shrinkflation.db.models import PipelineRun, Product
from shrinkflation.db.session import session_scope
from shrinkflation.kroger.client import KrogerClient, KrogerError
from shrinkflation.kroger.models import KrogerProduct
from shrinkflation.llm.client import LlmClient
from shrinkflation.observability import setup_tracing, shutdown_tracing
from shrinkflation.pipeline.observe import observe_product
from shrinkflation.pipeline.runs import finish_run, start_run

log = logging.getLogger(__name__)

CATEGORY_TERMS: dict[str, list[str]] = {
    "Cereal and breakfast": ["cereal", "granola", "oatmeal", "pancake mix", "toaster pastries"],
    "Snacks": [
        "potato chips",
        "tortilla chips",
        "pretzels",
        "popcorn",
        "crackers",
        "cookies",
        "granola bars",
        "fruit snacks",
        "mixed nuts",
        "beef jerky",
    ],
    "Candy": ["chocolate bar", "candy bag", "chewing gum"],
    "Beverages": [
        "soda",
        "sparkling water",
        "orange juice",
        "apple juice",
        "sports drink",
        "energy drink",
        "bottled water",
        "iced tea",
        "lemonade",
    ],
    "Coffee and tea": ["ground coffee", "coffee pods", "tea bags", "hot cocoa mix"],
    "Dairy and eggs": [
        "milk",
        "yogurt",
        "greek yogurt",
        "butter",
        "cream cheese",
        "shredded cheese",
        "sliced cheese",
        "sour cream",
        "eggs",
        "coffee creamer",
    ],
    "Frozen": [
        "ice cream",
        "frozen pizza",
        "frozen vegetables",
        "frozen waffles",
        "frozen meals",
        "chicken nuggets",
        "frozen fruit",
        "ice cream bars",
    ],
    "Bakery": ["sliced bread", "bagels", "tortillas", "english muffins", "hamburger buns"],
    "Pantry": [
        "peanut butter",
        "jelly",
        "pasta",
        "pasta sauce",
        "rice",
        "canned soup",
        "canned beans",
        "canned tuna",
        "canned tomatoes",
        "chicken broth",
        "ketchup",
        "mayonnaise",
        "mustard",
        "salad dressing",
        "olive oil",
        "flour",
        "sugar",
        "maple syrup",
        "honey",
        "macaroni and cheese",
        "instant noodles",
        "salsa",
        "hot sauce",
    ],
    "Meat and deli": ["bacon", "hot dogs", "lunch meat", "breakfast sausage"],
    "Household": [
        "paper towels",
        "toilet paper",
        "facial tissue",
        "trash bags",
        "dish soap",
        "laundry detergent",
        "dishwasher pods",
        "all purpose cleaner",
        "aluminum foil",
        "sandwich bags",
    ],
    "Personal care": [
        "shampoo",
        "conditioner",
        "body wash",
        "toothpaste",
        "deodorant",
        "hand soap",
        "razors",
        "body lotion",
    ],
    "Baby and pet": ["diapers", "baby wipes", "dry dog food", "dry cat food", "cat litter"],
}


def eligible(reading: KrogerProduct) -> bool:
    item = reading.item
    if item is None or item.price is None or item.price.regular is None:
        return False
    if item.sold_by and item.sold_by.lower() == "weight":
        return False
    return bool(reading.description)


def run_build_basket(
    *, target: int = 1200, kroger: KrogerClient | None = None, llm: LlmClient | None = None
) -> int:
    """Search every category term, keep eligible products, and record a first snapshot."""
    setup_tracing()
    settings = get_settings()
    location_id = settings.kroger_location_id
    if not location_id:
        raise RuntimeError("KROGER_LOCATION_ID is not set")
    owns_kroger, owns_llm = kroger is None, llm is None
    kroger = kroger or KrogerClient(settings)
    llm = llm or LlmClient(settings)
    try:
        return _build_basket(kroger, llm, location_id, target)
    finally:
        if owns_kroger:
            kroger.close()
        if owns_llm:
            llm.close()


def _build_basket(kroger: KrogerClient, llm: LlmClient, location_id: str, target: int) -> int:
    terms = [(category, term) for category, items in CATEGORY_TERMS.items() for term in items]
    per_term = max(8, -(-target // len(terms)))
    now = datetime.now(UTC)

    with session_scope() as session:
        run = start_run(session, "build_basket", target=target, per_term=per_term)
        run_id = run.id
        existing = set(session.execute(select(Product.id)).scalars())

    added = errors = 0
    error_sample: str | None = None
    for category, term in terms:
        try:
            page = kroger.search_products(term, location_id)
        except KrogerError as exc:
            errors += 1
            error_sample = error_sample or f"{term}: {exc}"
            log.warning("search %r failed: %s", term, exc)
            continue
        kept = 0
        for reading in page:
            if kept >= per_term:
                break
            if not eligible(reading):
                continue
            with session_scope() as session:
                product = session.get(Product, reading.product_id)
                if product is None:
                    product = Product(
                        id=reading.product_id,
                        upc=reading.upc,
                        brand=reading.brand,
                        description=reading.description.strip(),
                        category=category,
                        retailer_categories=list(reading.categories),
                        search_terms=[term],
                        image_url=reading.image_url(),
                        first_seen_at=now,
                        last_seen_at=now,
                    )
                    session.add(product)
                    session.flush()
                    if reading.product_id not in existing:
                        added += 1
                        existing.add(reading.product_id)
                elif term not in product.search_terms:
                    product.search_terms = [*product.search_terms, term]
                try:
                    observe_product(
                        session,
                        product,
                        reading,
                        location_id=location_id,
                        now=now,
                        llm=llm,
                        pipeline_run_id=run_id,
                    )
                except Exception as exc:
                    errors += 1
                    error_sample = error_sample or f"{reading.product_id}: {exc}"
                    log.exception("observe failed for %s", reading.product_id)
            kept += 1
        log.info("%s / %s: kept %d of %d", category, term, kept, len(page))

    with session_scope() as session:
        run = session.get(PipelineRun, run_id)
        assert run is not None
        run.products_checked = len(existing)
        run.snapshots_added = added
        run.api_calls = kroger.calls_made
        run.errors = errors
        finish_run(run, status="ok" if errors == 0 else "partial", error_sample=error_sample)
    log.info(
        "basket build done: %d products tracked, %d added, %d api calls",
        len(existing),
        added,
        kroger.calls_made,
    )
    shutdown_tracing()
    return run_id
