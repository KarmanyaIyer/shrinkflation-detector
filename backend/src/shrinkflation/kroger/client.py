"""Client for the Kroger Public Products and Locations APIs.

Authentication is OAuth2 client credentials with a 30 minute token that is cached and refreshed
a minute early. The Products API allows 10,000 calls per day; the client counts its own calls
so a run can stop before the quota does.
"""

import base64
import logging
import time
from collections.abc import Iterator, Sequence
from typing import Any

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from shrinkflation.config import Settings, get_settings
from shrinkflation.kroger.models import KrogerLocation, KrogerProduct

log = logging.getLogger(__name__)

PRODUCT_SCOPE = "product.compact"
PAGE_LIMIT = 50
MAX_START = 250
MAX_IDS_PER_CALL = 50
TOKEN_REFRESH_MARGIN_SECONDS = 60


class KrogerError(Exception):
    pass


class KrogerRateLimited(KrogerError):
    pass


class KrogerCallBudgetExhausted(KrogerError):
    pass


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (
        500,
        502,
        503,
        504,
    )


class KrogerClient:
    def __init__(
        self,
        settings: Settings | None = None,
        http: httpx.Client | None = None,
        call_budget: int | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        if not self.settings.kroger_client_id or not self.settings.kroger_client_secret:
            raise KrogerError("KROGER_CLIENT_ID and KROGER_CLIENT_SECRET are required")
        self.base_url = self.settings.kroger_base_url.rstrip("/")
        self._http = http or httpx.Client(timeout=httpx.Timeout(20.0, connect=10.0))
        self._token: str | None = None
        self._token_expires_at = 0.0
        self.call_budget = (
            call_budget if call_budget is not None else self.settings.kroger_daily_call_budget
        )
        self.calls_made = 0

    def close(self) -> None:
        self._http.close()

    # Authentication

    def _access_token(self) -> str:
        if self._token and time.monotonic() < self._token_expires_at:
            return self._token
        credentials = f"{self.settings.kroger_client_id}:{self.settings.kroger_client_secret}"
        basic = base64.b64encode(credentials.encode()).decode()
        response = self._http.post(
            f"{self.base_url}/connect/oauth2/token",
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials", "scope": PRODUCT_SCOPE},
        )
        if response.status_code != 200:
            raise KrogerError(f"token request failed: {response.status_code} {response.text[:200]}")
        payload = response.json()
        self._token = payload["access_token"]
        self._token_expires_at = (
            time.monotonic() + int(payload.get("expires_in", 1800)) - TOKEN_REFRESH_MARGIN_SECONDS
        )
        return self._token or ""

    # Requests

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        if self.calls_made >= self.call_budget:
            raise KrogerCallBudgetExhausted(f"reached the run budget of {self.call_budget} calls")
        self.calls_made += 1
        response = self._send(path, params)
        if response.status_code == 401:
            self._token = None
            response = self._send(path, params)
        if response.status_code == 429:
            raise KrogerRateLimited(response.text[:200])
        if response.status_code >= 400:
            raise KrogerError(f"{path} failed: {response.status_code} {response.text[:300]}")
        return response.json()

    @retry(
        retry=retry_if_exception(_is_transient),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def _send(self, path: str, params: dict[str, Any]) -> httpx.Response:
        response = self._http.get(
            f"{self.base_url}{path}",
            params=params,
            headers={
                "Authorization": f"Bearer {self._access_token()}",
                "Accept": "application/json",
            },
        )
        if response.status_code in (500, 502, 503, 504):
            response.raise_for_status()
        return response

    # Products

    def search_products(
        self,
        term: str,
        location_id: str,
        *,
        start: int = 1,
        limit: int = PAGE_LIMIT,
        fulfillment: str | None = "ais",
    ) -> list[KrogerProduct]:
        params: dict[str, Any] = {
            "filter.term": term,
            "filter.locationId": location_id,
            "filter.limit": min(limit, PAGE_LIMIT),
            "filter.start": start,
        }
        if fulfillment:
            params["filter.fulfillment"] = fulfillment
        payload = self._get("/products", params)
        return [KrogerProduct.model_validate(row) for row in payload.get("data", [])]

    def iter_search(
        self, term: str, location_id: str, *, max_results: int = MAX_START + PAGE_LIMIT
    ) -> Iterator[KrogerProduct]:
        """Walk the result pages for one search term up to the API ceiling of 300 results."""
        start = 1
        seen = 0
        while start <= MAX_START and seen < max_results:
            page = self.search_products(term, location_id, start=start)
            if not page:
                return
            for product in page:
                yield product
                seen += 1
                if seen >= max_results:
                    return
            if len(page) < PAGE_LIMIT:
                return
            start += PAGE_LIMIT

    def products_by_ids(self, product_ids: Sequence[str], location_id: str) -> list[KrogerProduct]:
        """Fetch current data for up to 50 product ids per call."""
        results: list[KrogerProduct] = []
        for offset in range(0, len(product_ids), MAX_IDS_PER_CALL):
            chunk = product_ids[offset : offset + MAX_IDS_PER_CALL]
            payload = self._get(
                "/products",
                {"filter.productId": ",".join(chunk), "filter.locationId": location_id},
            )
            results.extend(KrogerProduct.model_validate(row) for row in payload.get("data", []))
        return results

    def product(self, product_id: str, location_id: str) -> KrogerProduct | None:
        try:
            payload = self._get(f"/products/{product_id}", {"filter.locationId": location_id})
        except KrogerError as exc:
            if "404" in str(exc):
                return None
            raise
        data = payload.get("data")
        return KrogerProduct.model_validate(data) if data else None

    # Locations

    def locations_near(
        self,
        zip_code: str,
        *,
        radius_miles: int = 10,
        limit: int = 10,
        chain: str | None = "KROGER",
    ) -> list[KrogerLocation]:
        params: dict[str, Any] = {
            "filter.zipCode.near": zip_code,
            "filter.radiusInMiles": radius_miles,
            "filter.limit": limit,
        }
        if chain:
            params["filter.chain"] = chain
        payload = self._get("/locations", params)
        return [KrogerLocation.model_validate(row) for row in payload.get("data", [])]
