"""Thin client over the DeepSeek chat completions API.

Every request, successful or not, produces one span and one llm_calls row with token counts,
attributed cost, latency and the trace id. A daily cost cap stops all model calls once spent.
"""

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, TypeVar

from openai import APIConnectionError, APIStatusError, OpenAI, RateLimitError
from openai.types.chat import ChatCompletion, ChatCompletionMessageParam, ChatCompletionToolParam
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from shrinkflation.config import Settings, get_settings
from shrinkflation.db.models import LlmCall
from shrinkflation.db.session import session_scope
from shrinkflation.llm.pricing import estimate_cost
from shrinkflation.observability import current_trace_ids, get_tracer

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

THINKING_OFF: dict[str, Any] = {"thinking": {"type": "disabled"}}
REPAIR_INSTRUCTION = (
    "That JSON did not match the required schema. Fix it and return only the corrected "
    "JSON object.\n\nErrors:\n"
)


class LlmBudgetExceeded(Exception):
    pass


class LlmOutputInvalid(Exception):
    pass


@dataclass
class LlmCallRecord:
    purpose: str
    model: str
    status: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    cost_usd: Decimal = Decimal(0)
    latency_ms: int = 0
    trace_id: str | None = None
    span_id: str | None = None
    pipeline_run_id: int | None = None
    error: str | None = None


@dataclass
class ChatResult:
    completion: ChatCompletion
    records: list[LlmCallRecord] = field(default_factory=list)

    @property
    def message(self):
        return self.completion.choices[0].message

    @property
    def text(self) -> str:
        return self.message.content or ""


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, RateLimitError | APIConnectionError):
        return True
    return isinstance(exc, APIStatusError) and exc.status_code in (500, 502, 503, 504)


def _cached_tokens(usage: Any) -> int:
    if usage is None:
        return 0
    details = getattr(usage, "prompt_tokens_details", None)
    if details is not None and getattr(details, "cached_tokens", None):
        return int(details.cached_tokens)
    extra = getattr(usage, "model_extra", None) or {}
    return int(extra.get("prompt_cache_hit_tokens") or 0)


def record_to_db(record: LlmCallRecord) -> None:
    with session_scope() as session:
        session.add(
            LlmCall(
                purpose=record.purpose,
                model=record.model,
                status=record.status,
                prompt_tokens=record.prompt_tokens,
                completion_tokens=record.completion_tokens,
                cached_tokens=record.cached_tokens,
                cost_usd=record.cost_usd,
                latency_ms=record.latency_ms,
                trace_id=record.trace_id,
                span_id=record.span_id,
                pipeline_run_id=record.pipeline_run_id,
                error=record.error,
            )
        )


def spent_today_usd() -> Decimal:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    with session_scope() as session:
        total = session.execute(
            select(func.coalesce(func.sum(LlmCall.cost_usd), 0)).where(LlmCall.created_at >= start)
        ).scalar_one()
    return Decimal(total)


class LlmClient:
    def __init__(
        self,
        settings: Settings | None = None,
        recorder: Callable[[LlmCallRecord], None] = record_to_db,
        spent_today: Callable[[], Decimal] = spent_today_usd,
    ) -> None:
        self.settings = settings or get_settings()
        self._client = OpenAI(
            api_key=self.settings.deepseek_api_key,
            base_url=self.settings.deepseek_base_url,
            timeout=90,
            max_retries=0,
        )
        self._recorder = recorder
        self._spent_today = spent_today
        self._budget_checked_at: datetime | None = None
        self._budget_ok = True

    @property
    def fast_model(self) -> str:
        return self.settings.llm_model_fast

    @property
    def strong_model(self) -> str:
        return self.settings.llm_model_strong

    def close(self) -> None:
        self._client.close()

    def _check_budget(self, *, fresh: bool = False) -> None:
        now = datetime.now(UTC)
        stale = self._budget_checked_at is None or now - self._budget_checked_at > timedelta(
            seconds=60
        )
        if fresh or stale:
            spent = self._spent_today()
            self._budget_ok = spent < Decimal(str(self.settings.llm_daily_cost_cap_usd))
            self._budget_checked_at = now
            if not self._budget_ok:
                log.warning("daily LLM cost cap reached: spent %s USD", spent)
        if not self._budget_ok:
            raise LlmBudgetExceeded("daily model spend cap reached")

    def chat(
        self,
        *,
        purpose: str,
        messages: list[ChatCompletionMessageParam],
        model: str | None = None,
        tools: list[ChatCompletionToolParam] | None = None,
        tool_choice: Any | None = None,
        response_format: dict[str, str] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.0,
        pipeline_run_id: int | None = None,
    ) -> ChatResult:
        """One traced, recorded, retried chat completion. Thinking mode stays off."""
        # Public agent traffic checks the spend on every call; the pipeline, whose call rate
        # is bounded, accepts the 60 second cache.
        self._check_budget(fresh=purpose == "agent")
        model = model or self.fast_model
        record = LlmCallRecord(
            purpose=purpose, model=model, status="error", pipeline_run_id=pipeline_run_id
        )
        tracer = get_tracer()
        with tracer.start_as_current_span(f"llm.{purpose}") as span:
            span.set_attribute("gen_ai.system", "deepseek")
            span.set_attribute("gen_ai.operation.name", "chat")
            span.set_attribute("gen_ai.request.model", model)
            span.set_attribute("gen_ai.request.max_tokens", max_tokens)
            span.set_attribute("shrinkflation.purpose", purpose)
            record.trace_id, record.span_id = current_trace_ids()
            started = time.perf_counter()
            try:
                completion = self._create(
                    model=model,
                    messages=messages,
                    tools=tools,
                    tool_choice=tool_choice,
                    response_format=response_format,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            except Exception as exc:
                record.latency_ms = int((time.perf_counter() - started) * 1000)
                record.error = f"{type(exc).__name__}: {exc}"[:500]
                span.record_exception(exc)
                self._recorder(record)
                raise
            record.latency_ms = int((time.perf_counter() - started) * 1000)
            usage = completion.usage
            if usage is not None:
                record.prompt_tokens = usage.prompt_tokens
                record.completion_tokens = usage.completion_tokens
                record.cached_tokens = _cached_tokens(usage)
            record.cost_usd = estimate_cost(
                model,
                prompt_tokens=record.prompt_tokens,
                completion_tokens=record.completion_tokens,
                cached_tokens=record.cached_tokens,
            )
            record.status = "ok"
            span.set_attribute("gen_ai.response.model", completion.model or model)
            span.set_attribute("gen_ai.usage.input_tokens", record.prompt_tokens)
            span.set_attribute("gen_ai.usage.output_tokens", record.completion_tokens)
            span.set_attribute("gen_ai.usage.cached_input_tokens", record.cached_tokens)
            span.set_attribute("shrinkflation.cost_usd", float(record.cost_usd))
            finish = completion.choices[0].finish_reason if completion.choices else None
            if finish:
                span.set_attribute("gen_ai.response.finish_reasons", [finish])
            self._recorder(record)
        return ChatResult(completion=completion, records=[record])

    @retry(
        retry=retry_if_exception(_is_transient),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def _create(
        self,
        *,
        model: str,
        messages: list[ChatCompletionMessageParam],
        tools: list[ChatCompletionToolParam] | None,
        tool_choice: Any | None,
        response_format: dict[str, str] | None,
        max_tokens: int,
        temperature: float,
    ) -> ChatCompletion:
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "extra_body": THINKING_OFF,
        }
        if tools:
            kwargs["tools"] = tools
            if tool_choice is not None:
                kwargs["tool_choice"] = tool_choice
        if response_format:
            kwargs["response_format"] = response_format
        return self._client.chat.completions.create(**kwargs)

    def complete_json(
        self,
        *,
        purpose: str,
        system: str,
        user: str,
        schema: type[T],
        model: str | None = None,
        max_tokens: int = 800,
        temperature: float = 0.0,
        attempts: int = 2,
        pipeline_run_id: int | None = None,
    ) -> tuple[T, list[LlmCallRecord]]:
        """Ask for JSON and validate it against a Pydantic model.

        On a validation failure the error is sent back once so the model can correct itself.
        The prompt must mention JSON, which the DeepSeek JSON mode requires.
        """
        messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        records: list[LlmCallRecord] = []
        last_error = "empty response"
        for _ in range(attempts):
            result = self.chat(
                purpose=purpose,
                messages=messages,
                model=model,
                response_format={"type": "json_object"},
                max_tokens=max_tokens,
                temperature=temperature,
                pipeline_run_id=pipeline_run_id,
            )
            records.extend(result.records)
            text = result.text.strip()
            try:
                if not text:
                    raise ValueError("empty response")
                parsed = schema.model_validate(json.loads(text))
                return parsed, records
            except (ValidationError, ValueError) as exc:
                last_error = str(exc)[:1500]
                messages.append({"role": "assistant", "content": text or "{}"})
                messages.append({"role": "user", "content": REPAIR_INSTRUCTION + last_error})
        raise LlmOutputInvalid(last_error)
