import json
from types import SimpleNamespace
from typing import Any, cast

from sqlalchemy.orm import Session

from shrinkflation.agent.service import answer_question
from shrinkflation.agent.tools import run_tool, tool_definitions
from shrinkflation.config import get_settings
from shrinkflation.llm.client import LlmCallRecord, LlmClient
from tests.conftest import seed_catalog


def test_tool_definitions_follow_the_openai_schema() -> None:
    definitions = tool_definitions()
    names = {d["function"]["name"] for d in definitions}
    assert names == {
        "search_products",
        "get_product_history",
        "list_recent_changes",
        "get_tracking_stats",
    }
    for definition in definitions:
        assert definition["type"] == "function"
        assert definition["function"]["description"]
        assert definition["function"]["parameters"]["type"] == "object"
        assert definition["function"]["parameters"]["additionalProperties"] is False


def test_search_and_history_tools(db: Session) -> None:
    seed_catalog(db)
    found = run_tool(db, "search_products", {"query": "cheerios"})
    assert found["matches"][0]["product_id"] == "0001600012479"
    assert found["matches"][0]["current"]["size_text"] == "10.8 oz"
    assert found["matches"][0]["published_changes"] == 1

    history = run_tool(db, "get_product_history", {"product_id": "0001600012479"})
    assert [s["size_text"] for s in history["states"]] == ["12 oz", "10.8 oz"]
    assert history["changes"][0]["kind"] == "shrink"
    assert history["changes"][0]["size_change_pct"] == -10.0
    assert history["changes"][0]["first_seen_after"] == "2026-09-03"

    recent = run_tool(db, "list_recent_changes", {"kind": "shrink", "limit": 5})
    assert recent["total_published"] == 1
    assert recent["changes"][0]["product"]["name"] == "General Mills Honey Nut Cheerios Cereal"

    stats = run_tool(db, "get_tracking_stats", {})
    assert stats["products_tracked"] == 2
    assert stats["published_changes_by_kind"] == {"shrink": 1}


def test_tool_argument_validation(db: Session) -> None:
    assert run_tool(db, "not_a_tool", {})["error"].startswith("Unknown tool")
    invalid = run_tool(db, "search_products", {"query": "c"})
    assert invalid["error"] == "Invalid arguments."
    assert invalid["details"]
    unknown_field = run_tool(db, "recent_changes_wrong", {"kind": "shrink"})
    assert "error" in unknown_field
    missing = run_tool(db, "get_product_history", {"product_id": "0000000000000"})
    assert "error" in missing


class ScriptedLlm:
    """Returns pre-written assistant turns and records what it was asked for."""

    fast_model = "scripted"
    strong_model = "scripted"

    def __init__(self, turns: list[Any]) -> None:
        self.turns = turns
        self.calls: list[dict[str, Any]] = []

    def chat(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        message = self.turns[len(self.calls) - 1]
        record = LlmCallRecord(
            purpose="agent", model="scripted", status="ok", prompt_tokens=10, completion_tokens=5
        )
        return SimpleNamespace(records=[record], message=message)


def _tool_call(name: str, arguments: dict[str, Any]) -> Any:
    return SimpleNamespace(
        id="call_1",
        type="function",
        function=SimpleNamespace(name=name, arguments=json.dumps(arguments)),
    )


def test_agent_runs_tools_then_answers(db: Session) -> None:
    seed_catalog(db)
    llm = ScriptedLlm(
        [
            SimpleNamespace(
                content=None, tool_calls=[_tool_call("search_products", {"query": "cheerios"})]
            ),
            SimpleNamespace(
                content="Honey Nut Cheerios went from 12 oz to 10.8 oz on Sep 3, 2026.",
                tool_calls=None,
            ),
        ]
    )
    result = answer_question(
        db, cast(LlmClient, llm), "Did Honey Nut Cheerios shrink?", settings=get_settings()
    )

    assert result.answer.startswith("Honey Nut Cheerios went from 12 oz to 10.8 oz")
    assert [t.name for t in result.tool_calls] == ["search_products"]
    assert result.tool_calls[0].ok
    assert result.total_tokens == 30
    assert llm.calls[0]["tool_choice"] == "required"
    assert llm.calls[1]["tool_choice"] == "auto"
    tool_message = llm.calls[1]["messages"][-1]
    assert tool_message["role"] == "tool"
    assert "0001600012479" in tool_message["content"]
    system_prompt = llm.calls[0]["messages"][0]["content"]
    assert "a test store" in system_prompt and "2 products" in system_prompt


def test_agent_stops_after_the_tool_round_limit(db: Session) -> None:
    seed_catalog(db)
    settings = get_settings()
    loop_turn = SimpleNamespace(content=None, tool_calls=[_tool_call("get_tracking_stats", {})])
    final = SimpleNamespace(content="Done.", tool_calls=None)
    llm = ScriptedLlm([loop_turn] * settings.ask_max_tool_rounds + [final])
    result = answer_question(db, cast(LlmClient, llm), "Loop please", settings=settings)

    assert result.answer == "Done."
    assert len(result.tool_calls) == settings.ask_max_tool_rounds
    assert llm.calls[-1]["tools"] is None
