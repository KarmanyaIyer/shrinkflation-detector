from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from shrinkflation.api.limits import limiter
from tests.conftest import seed_catalog


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    from shrinkflation.api.app import app

    seed_catalog(db)
    with TestClient(app) as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["cache-control"] == "no-store"


def test_changes_feed_lists_the_shrink_with_evidence(client: TestClient) -> None:
    response = client.get("/api/changes")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["kind"] == "shrink"
    assert item["product"]["id"] == "0001600012479"
    assert item["product"]["brand"] == "Cheerios"
    assert item["before"]["size_text"] == "12 oz"
    assert item["after"]["size_text"] == "10.8 oz"
    assert float(item["size_change_pct"]) == pytest.approx(-10.0)
    assert item["before"]["unit_price"]["unit"] == "oz"
    assert float(item["after"]["unit_price"]["value"]) == pytest.approx(0.3972, abs=0.0001)
    assert item["before_seen_at"].startswith("2026-09-01")
    assert item["after_seen_at"].startswith("2026-09-03")
    assert "max-age=300" in response.headers["cache-control"]


@pytest.mark.parametrize(
    ("query", "total"),
    [
        ("kind=grow", 0),
        ("kind=all", 1),
        ("kind=shrink&category=Dairy and eggs", 0),
        ("kind=shrink&category=Cereal and breakfast", 1),
    ],
)
def test_changes_filters(client: TestClient, query: str, total: int) -> None:
    response = client.get(f"/api/changes?{query}")
    assert response.status_code == 200
    assert response.json()["total"] == total


def test_changes_rejects_unknown_kind(client: TestClient) -> None:
    assert client.get("/api/changes?kind=bogus").status_code == 422
    assert client.get("/api/changes?limit=500").status_code == 422


def test_product_search(client: TestClient) -> None:
    response = client.get("/api/products?q=honey nut")
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["id"] for item in items] == ["0001600012479"]
    assert client.get("/api/products?q=c").status_code == 422
    assert client.get("/api/products?q=nothing matches this").json()["items"] == []


def test_product_detail(client: TestClient) -> None:
    response = client.get("/api/products/0001600012479")
    assert response.status_code == 200
    body = response.json()
    assert body["product"]["description"] == "General Mills Honey Nut Cheerios Cereal"
    assert body["current"]["size_text"] == "10.8 oz"
    assert [s["size_text"] for s in body["snapshots"]] == ["12 oz", "10.8 oz"]
    assert body["snapshots"][0]["observations"] == 1
    assert body["snapshots"][0]["parse_method"] == "rule"
    assert len(body["changes"]) == 1
    assert body["changes"][0]["kind"] == "shrink"


def test_product_detail_errors(client: TestClient) -> None:
    assert client.get("/api/products/9999999999999").status_code == 404
    assert client.get("/api/products/not-a-number").status_code == 422


def test_stats_and_categories(client: TestClient) -> None:
    stats = client.get("/api/stats").json()
    assert stats["products_tracked"] == 2
    assert stats["categories"] == 2
    assert stats["snapshots"] == 3
    assert stats["changes_published"] == 1
    assert stats["shrink_count"] == 1
    assert stats["location_label"] == "a test store"
    assert stats["tracking_since"].startswith("2026-09-01")

    categories = client.get("/api/categories").json()
    assert categories == [
        {"category": "Cereal and breakfast", "products": 1, "changes": 1},
        {"category": "Dairy and eggs", "products": 1, "changes": 0},
    ]


def test_security_headers(client: TestClient) -> None:
    response = client.get("/api/stats")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-ratelimit-limit"] == "120"
    assert response.headers["x-ratelimit-remaining"].isdigit()


def test_rate_limit_blocks_after_the_window_limit(client: TestClient) -> None:
    limiter.reset()
    for _ in range(120):
        assert client.get("/api/health").status_code == 200
    blocked = client.get("/api/health")
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"].isdigit()
    assert blocked.json()["detail"].startswith("Too many requests")
    limiter.reset()


def test_ask_has_a_stricter_limit(client: TestClient) -> None:
    limiter.reset()
    for _ in range(10):
        assert client.post("/api/ask", json={"question": "hi"}).status_code == 422
    assert client.post("/api/ask", json={"question": "hi"}).status_code == 429
    assert client.get("/api/ask/budget").status_code == 200
    limiter.reset()


def test_ask_validation_and_budget(client: TestClient) -> None:
    assert client.post("/api/ask", json={"question": "hi"}).status_code == 422
    assert client.post("/api/ask", json={"question": "x" * 401}).status_code == 422
    budget = client.get("/api/ask/budget").json()
    assert budget == {"questions_per_day": 10, "questions_remaining": 10}


def test_catalog_lists_products_with_current_state(client: TestClient) -> None:
    everything = client.get("/api/catalog").json()
    assert everything["total"] == 2
    assert [item["product"]["id"] for item in everything["items"]] == [
        "0001600012479",
        "0001111041700",
    ]

    dairy = client.get("/api/catalog?category=Dairy and eggs").json()
    assert dairy["total"] == 1
    item = dairy["items"][0]
    assert item["current"]["size_text"] == "1 gal"
    assert item["current"]["observations"] == 2
    assert item["changes"] == 0
    assert item["first_seen_at"].startswith("2026-09-01")

    cereal = client.get("/api/catalog?q=honey cheerios").json()
    assert cereal["total"] == 1
    assert cereal["items"][0]["current"]["size_text"] == "10.8 oz"
    assert cereal["items"][0]["changes"] == 1

    assert client.get("/api/catalog?q=x").status_code == 422
    assert client.get("/api/catalog?category=Nothing").json()["total"] == 0
