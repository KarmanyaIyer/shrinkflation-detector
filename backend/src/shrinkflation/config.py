from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables and an optional .env file."""

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "postgresql+psycopg://shrink:shrink@localhost:5432/shrink"

    kroger_client_id: str = ""
    kroger_client_secret: str = ""
    kroger_base_url: str = "https://api.kroger.com/v1"
    kroger_location_id: str = ""
    kroger_location_label: str = "one Kroger store"
    kroger_daily_call_budget: int = 8000

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    llm_model_fast: str = "deepseek-v4-flash"
    llm_model_strong: str = "deepseek-v4-pro"
    llm_daily_cost_cap_usd: float = 1.00

    ask_questions_per_visitor_per_day: int = 10
    ask_max_tool_rounds: int = 4

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "https://karmanyaiyer.com"]
    )
    visitor_hash_salt: str = "change-me"
    # Number of proxies in front of the app that append to X-Forwarded-For (1 on Azure
    # Container Apps). At 0 the header is ignored and the socket peer address is used.
    trust_proxy_hops: int = 0

    otel_exporter_otlp_endpoint: str = ""
    otel_service_name: str = "shrinkflation-detector"

    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
