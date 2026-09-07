import base64
import json

import httpx
import pytest
import respx

from shrinkflation.config import Settings
from shrinkflation.kroger import KrogerClient, KrogerRateLimited

BASE = "https://api.kroger.com/v1"


def settings() -> Settings:
    return Settings(
        kroger_client_id="client-id",
        kroger_client_secret="client-secret",
        kroger_base_url=BASE,
        _env_file=None,  # type: ignore[call-arg]
    )


def product_payload(product_id: str, size: str = "16 oz", regular: float = 3.49) -> dict:
    return {
        "productId": product_id,
        "upc": product_id,
        "brand": "Kroger",
        "description": f"Kroger Test Product {product_id}",
        "categories": ["Snacks"],
        "images": [
            {
                "perspective": "front",
                "default": True,
                "sizes": [
                    {"size": "large", "url": "https://img/large.jpg"},
                    {"size": "medium", "url": "https://img/medium.jpg"},
                ],
            }
        ],
        "items": [
            {
                "itemId": product_id,
                "size": size,
                "soldBy": "unit",
                "price": {"regular": regular, "promo": 0, "regularPerUnitEstimate": 0.22},
                "inventory": {"stockLevel": "HIGH"},
                "fulfillment": {"instore": True, "curbside": True},
            }
        ],
    }


@pytest.fixture
def api():
    with respx.mock(base_url=BASE, assert_all_called=False) as mock:
        mock.post("/connect/oauth2/token").mock(
            return_value=httpx.Response(200, json={"access_token": "tok-1", "expires_in": 1800})
        )
        yield mock


def test_token_uses_basic_auth_and_is_cached(api: respx.MockRouter) -> None:
    api.get("/products").mock(
        return_value=httpx.Response(200, json={"data": [product_payload("0001")]})
    )
    client = KrogerClient(settings())
    client.search_products("chips", "01400376")
    client.search_products("chips", "01400376")

    token_call = api.calls[0].request
    expected = base64.b64encode(b"client-id:client-secret").decode()
    assert token_call.headers["Authorization"] == f"Basic {expected}"
    assert b"scope=product.compact" in token_call.content
    assert api.calls.call_count == 3  # one token call, two product calls
    assert api.calls[1].request.headers["Authorization"] == "Bearer tok-1"
    assert client.calls_made == 2


def test_search_sends_expected_filters(api: respx.MockRouter) -> None:
    route = api.get("/products").mock(return_value=httpx.Response(200, json={"data": []}))
    KrogerClient(settings()).search_products("greek yogurt", "01400376", start=51)
    params = route.calls.last.request.url.params
    assert params["filter.term"] == "greek yogurt"
    assert params["filter.locationId"] == "01400376"
    assert params["filter.limit"] == "50"
    assert params["filter.start"] == "51"
    assert params["filter.fulfillment"] == "ais"


def test_iter_search_stops_on_short_page(api: respx.MockRouter) -> None:
    pages = [
        {"data": [product_payload(f"{i:04d}") for i in range(50)]},
        {"data": [product_payload(f"{i:04d}") for i in range(50, 62)]},
    ]
    route = api.get("/products").mock(side_effect=[httpx.Response(200, json=p) for p in pages])
    products = list(KrogerClient(settings()).iter_search("cereal", "01400376"))
    assert len(products) == 62
    assert route.call_count == 2
    assert route.calls[1].request.url.params["filter.start"] == "51"


def test_products_by_ids_chunks_fifty_per_call(api: respx.MockRouter) -> None:
    route = api.get("/products").mock(return_value=httpx.Response(200, json={"data": []}))
    ids = [f"{i:013d}" for i in range(120)]
    KrogerClient(settings()).products_by_ids(ids, "01400376")
    assert route.call_count == 3
    first = route.calls[0].request.url.params["filter.productId"]
    assert first.count(",") == 49


def test_rate_limit_raises(api: respx.MockRouter) -> None:
    api.get("/products").mock(return_value=httpx.Response(429, text="daily limit"))
    with pytest.raises(KrogerRateLimited):
        KrogerClient(settings()).search_products("milk", "01400376")


def test_expired_token_is_refreshed_on_401(api: respx.MockRouter) -> None:
    api.get("/products").mock(
        side_effect=[
            httpx.Response(401, json={"error": "expired"}),
            httpx.Response(200, json={"data": [product_payload("0002")]}),
        ]
    )
    products = KrogerClient(settings()).search_products("milk", "01400376")
    assert [p.product_id for p in products] == ["0002"]
    assert api.calls.call_count == 4  # token, 401, token again, 200


def test_product_model_helpers() -> None:
    from shrinkflation.kroger import KrogerProduct

    product = KrogerProduct.model_validate(product_payload("0003"))
    assert product.item is not None
    assert product.item.size == "16 oz"
    assert product.item.price is not None
    assert product.item.price.promo_or_none is None
    assert product.image_url() == "https://img/medium.jpg"
    assert json.dumps(product.model_dump(mode="json"))
