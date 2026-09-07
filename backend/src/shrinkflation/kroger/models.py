"""Typed views of the Kroger Products and Locations API payloads. Unknown fields are ignored."""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class KrogerModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class KrogerPrice(KrogerModel):
    regular: Decimal | None = None
    promo: Decimal | None = None
    regular_per_unit_estimate: Decimal | None = None
    promo_per_unit_estimate: Decimal | None = None

    @property
    def promo_or_none(self) -> Decimal | None:
        """The API sends promo 0 when there is no sale."""
        return self.promo if self.promo and self.promo > 0 else None


class KrogerInventory(KrogerModel):
    stock_level: str | None = None


class KrogerItem(KrogerModel):
    item_id: str
    size: str | None = None
    sold_by: str | None = None
    price: KrogerPrice | None = None
    national_price: KrogerPrice | None = None
    inventory: KrogerInventory | None = None
    fulfillment: dict[str, bool] = Field(default_factory=dict)


class KrogerImageSize(KrogerModel):
    size: str
    url: str


class KrogerImage(KrogerModel):
    perspective: str | None = None
    default: bool = False
    sizes: list[KrogerImageSize] = Field(default_factory=list)


class KrogerProduct(KrogerModel):
    product_id: str
    upc: str | None = None
    brand: str | None = None
    description: str
    categories: list[str] = Field(default_factory=list)
    images: list[KrogerImage] = Field(default_factory=list)
    items: list[KrogerItem] = Field(default_factory=list)
    temperature: dict[str, Any] | None = None

    @property
    def item(self) -> KrogerItem | None:
        return self.items[0] if self.items else None

    def image_url(self, preferred_size: str = "medium") -> str | None:
        ordered = sorted(
            self.images, key=lambda image: (image.perspective != "front", not image.default)
        )
        for image in ordered:
            for size in image.sizes:
                if size.size == preferred_size:
                    return size.url
            if image.sizes:
                return image.sizes[0].url
        return None


class KrogerAddress(KrogerModel):
    address_line1: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None


class KrogerLocation(KrogerModel):
    location_id: str
    chain: str | None = None
    name: str | None = None
    address: KrogerAddress | None = None
