import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from learner.drills.base import Question
from learner.drills.rfi import actions_for_range
from learner.drills.rfi.models import RfiHand, RfiPrompt
from learner.main import create_app

pytestmark = pytest.mark.anyio

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "examples"
CONFORMED_FIXTURES = {
    "answer_correct",
    "answer_incorrect",
    "answer_mixed",
    "answer_vs_rfi",
    "drills",
    "errors",
    "next_done",
    "next_question",
    "next_question_vs_rfi",
    "range_rfi_6max_CO",
    "range_vs_rfi_6max_BB_vs_BTN",
    "ranges_list",
    "ranges_list_v2",
    "session_create",
    "sources",
    "summary",
}
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def api_app() -> FastAPI:
    return create_app()


@pytest.fixture
async def client(api_app: FastAPI):
    transport = ASGITransport(app=api_app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


def fixture(name: str) -> dict[str, Any]:
    return json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))


def migrated_rfi_range_fixture() -> dict[str, Any]:
    """Express the frozen v1 example through the v2 metadata migration."""
    expected = fixture("range_rfi_6max_CO")
    open_size = expected.pop("open_size_bb")
    expected["vs_position"] = None
    expected["facing_size_bb"] = None
    expected["action_sizes_bb"] = {"raise": open_size}
    expected["stats"]["by_action"] = {"raise": expected["stats"]["combos"]}
    return expected


def json_shape(value: Any, path: tuple[str, ...] = ()) -> Any:
    """Return a hashable JSON shape, normalizing all JSON numbers together."""
    if path and path[-1] == "grid":
        assert isinstance(value, dict)
        for hand, cell in value.items():
            assert isinstance(hand, str)
            assert isinstance(cell, dict)
            assert all(
                isinstance(action, str)
                and isinstance(frequency, (int, float))
                and not isinstance(frequency, bool)
                for action, frequency in cell.items()
            )
        return ("grid", tuple(sorted(value)))
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return (
            "array",
            frozenset(json_shape(item, (*path, "[]")) for item in value),
        )
    if isinstance(value, dict):
        return (
            "object",
            tuple(
                sorted(
                    (key, json_shape(item, (*path, key))) for key, item in value.items()
                )
            ),
        )
    raise AssertionError(f"Value at {path} is not JSON-compatible: {value!r}")


def assert_fixture_shape(actual: Any, expected: Any) -> None:
    assert json_shape(actual) == json_shape(expected)


def session_request(
    *, positions: list[str] | None = None, question_count: int = 25, seed: int = 7
) -> dict[str, Any]:
    return {
        "drill_id": "rfi",
        "config": {
            "table_format": "6max",
            "positions": positions or ["CO"],
            "question_count": question_count,
            "weighting": "borderline",
        },
        "seed": seed,
    }


def vs_rfi_session_request(
    *, matchup: str = "BB_vs_BTN", question_count: int = 5, seed: int = 7
) -> dict[str, Any]:
    return {
        "drill_id": "vs_rfi",
        "config": {
            "table_format": "6max",
            "matchups": [matchup],
            "question_count": question_count,
            "weighting": "borderline",
        },
        "seed": seed,
    }


async def create_session(client: AsyncClient, **kwargs: Any) -> dict[str, Any]:
    response = await client.post("/api/v1/sessions", json=session_request(**kwargs))
    assert response.status_code == 201
    return response.json()


async def current_question(client: AsyncClient, session_id: str) -> dict[str, Any]:
    response = await client.get(f"/api/v1/sessions/{session_id}/next")
    assert response.status_code == 200
    body = response.json()
    assert body["done"] is False
    return body["question"]


async def charted_action(client: AsyncClient, question: dict[str, Any]) -> str:
    prompt = question["prompt"]
    if prompt["kind"] == "rfi":
        range_id = f"rfi_{prompt['table_format']}_{prompt['hero_position']}"
    else:
        range_id = (
            f"vs_rfi_{prompt['table_format']}_{prompt['hero_position']}"
            f"_vs_{prompt['raiser_position']}"
        )
    response = await client.get(f"/api/v1/ranges/{range_id}")
    assert response.status_code == 200
    return next(iter(response.json()["grid"][prompt["hand"]["notation"]]), "fold")


async def answer_current(
    client: AsyncClient, session_id: str, *, correctly: bool
) -> dict[str, Any]:
    question = await current_question(client, session_id)
    correct_action = await charted_action(client, question)
    offered = [action["id"] for action in question["actions"]]
    action = (
        correct_action
        if correctly
        else next(candidate for candidate in offered if candidate != correct_action)
    )
    response = await client.post(
        f"/api/v1/sessions/{session_id}/answer",
        json={"question_id": question["question_id"], "action_id": action},
    )
    assert response.status_code == 200
    return response.json()


def test_conformance_manifest_names_every_canonical_fixture() -> None:
    actual = {path.stem for path in EXAMPLES.glob("*.json")}
    assert actual == CONFORMED_FIXTURES


async def test_success_responses_match_canonical_fixture_shapes(
    client: AsyncClient,
) -> None:
    drills = await client.get("/api/v1/drills")
    created = await create_session(
        client,
        positions=["UTG", "HJ", "CO", "BTN", "SB"],
        question_count=25,
    )

    correct_session = await create_session(client)
    question = await current_question(client, correct_session["session_id"])
    correct_answer = await answer_current(
        client, correct_session["session_id"], correctly=True
    )

    incorrect_session = await create_session(client)
    incorrect_answer = await answer_current(
        client, incorrect_session["session_id"], correctly=False
    )

    ranges = await client.get(
        "/api/v1/ranges", params={"spot": "rfi", "table_format": "6max"}
    )
    ranges_v2 = await client.get("/api/v1/ranges")
    range_detail = await client.get("/api/v1/ranges/rfi_6max_CO")
    sources = await client.get("/api/v1/sources")

    assert (
        drills.status_code
        == ranges.status_code
        == ranges_v2.status_code
        == range_detail.status_code
        == sources.status_code
        == 200
    )
    assert_fixture_shape(
        {"drills": drills.json()["drills"]},
        fixture("drills"),
    )
    assert_fixture_shape(created, fixture("session_create"))
    assert_fixture_shape(
        {"done": False, "question": question}, fixture("next_question")
    )
    assert_fixture_shape(correct_answer, fixture("answer_correct"))
    assert_fixture_shape(incorrect_answer, fixture("answer_incorrect"))
    assert_fixture_shape(
        {
            "ranges": [
                {
                    key: value
                    for key, value in item.items()
                    if key
                    in {"range_id", "spot", "table_format", "position", "stack_bb"}
                }
                for item in ranges.json()["ranges"]
            ]
        },
        fixture("ranges_list"),
    )
    fixture_range_ids = {
        "rfi_6max_CO",
        "vs_rfi_6max_BB_vs_BTN",
    }
    assert_fixture_shape(
        {
            "ranges": [
                item
                for item in ranges_v2.json()["ranges"]
                if item["range_id"] in fixture_range_ids
            ]
        },
        fixture("ranges_list_v2"),
    )
    assert_fixture_shape(range_detail.json(), migrated_rfi_range_fixture())
    assert_fixture_shape(sources.json(), fixture("sources"))


async def test_mixed_answer_shape_uses_a_constructed_range(
    range_payload, range_writer
) -> None:
    payload = range_payload()
    payload["grid"]["K5s"] = {"raise": 0.5}
    root, _ = range_writer(payload)
    app = create_app(root)
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await create_session(client, question_count=5)
        session = app.state.session_service.store.get(created["session_id"])
        range_data = app.state.range_index.get("rfi_6max_CO")
        session.current_question = Question(
            question_id="q_1",
            index=1,
            total=5,
            drill_id="rfi",
            prompt=RfiPrompt(
                table_format="6max",
                hero_position="CO",
                stack_bb=100,
                hand=RfiHand(cards=["Kh", "5h"], notation="K5s"),
                folded_before=["UTG", "HJ"],
                pot_bb=1.5,
            ),
            actions=actions_for_range(range_data),
        )
        response = await client.post(
            f"/api/v1/sessions/{created['session_id']}/answer",
            json={"question_id": "q_1", "action_id": "raise"},
        )

    assert response.status_code == 200
    assert response.json()["mixed"] is True
    assert_fixture_shape(response.json(), fixture("answer_mixed"))


async def test_vs_rfi_question_answer_and_range_match_v2_fixture_shapes(
    client: AsyncClient,
) -> None:
    created = await client.post(
        "/api/v1/sessions",
        json=vs_rfi_session_request(question_count=25),
    )
    assert created.status_code == 201
    session_id = created.json()["session_id"]
    next_response = await client.get(f"/api/v1/sessions/{session_id}/next")
    question = next_response.json()["question"]
    action = await charted_action(client, question)
    answer = await client.post(
        f"/api/v1/sessions/{session_id}/answer",
        json={"question_id": question["question_id"], "action_id": action},
    )
    range_detail = await client.get("/api/v1/ranges/vs_rfi_6max_BB_vs_BTN")

    assert next_response.status_code == answer.status_code == 200
    assert range_detail.status_code == 200
    assert_fixture_shape(next_response.json(), fixture("next_question_vs_rfi"))
    assert_fixture_shape(answer.json(), fixture("answer_vs_rfi"))
    assert_fixture_shape(
        range_detail.json(),
        fixture("range_vs_rfi_6max_BB_vs_BTN"),
    )


async def test_two_action_vs_rfi_session_completes_end_to_end(
    client: AsyncClient,
) -> None:
    created = await client.post(
        "/api/v1/sessions",
        json=vs_rfi_session_request(matchup="HJ_vs_UTG", seed=108),
    )
    assert created.status_code == 201
    session_id = created.json()["session_id"]

    for expected_index in range(1, 6):
        next_response = await client.get(f"/api/v1/sessions/{session_id}/next")
        question = next_response.json()["question"]
        assert question["index"] == expected_index
        assert [action["id"] for action in question["actions"]] == ["fold", "3bet"]
        action = await charted_action(client, question)
        answered = await client.post(
            f"/api/v1/sessions/{session_id}/answer",
            json={"question_id": question["question_id"], "action_id": action},
        )
        assert answered.status_code == 200
        assert answered.json()["correct"] is True

    done = await client.get(f"/api/v1/sessions/{session_id}/next")
    summary = await client.get(f"/api/v1/sessions/{session_id}/summary")

    assert done.json() == {"done": True, "question": None}
    assert summary.status_code == 200
    assert summary.json()["drill_id"] == "vs_rfi"
    assert summary.json()["complete"] is True
    assert summary.json()["answered"] == summary.json()["correct"] == 5
    assert summary.json()["breakdown"] == [
        {
            "key": "HJ_vs_UTG",
            "label": "HJ vs UTG",
            "answered": 5,
            "correct": 5,
            "accuracy": 1.0,
        }
    ]


async def test_complete_25_question_session_conforms_and_summarizes_arithmetic(
    client: AsyncClient,
) -> None:
    created = await create_session(
        client,
        positions=["UTG", "HJ", "CO", "BTN", "SB"],
        question_count=25,
        seed=8675309,
    )
    session_id = created["session_id"]
    expected_correct = 0

    for index in range(1, 26):
        correctly = index % 4 != 0
        answer = await answer_current(client, session_id, correctly=correctly)
        expected_correct += correctly
        assert answer["progress"] == {
            "answered": index,
            "correct": expected_correct,
            "total": 25,
        }

    done = await client.get(f"/api/v1/sessions/{session_id}/next")
    summary = await client.get(f"/api/v1/sessions/{session_id}/summary")
    body = summary.json()

    assert done.status_code == summary.status_code == 200
    assert_fixture_shape(done.json(), fixture("next_done"))
    assert_fixture_shape(body, fixture("summary"))
    assert body["answered"] == 25
    assert body["correct"] == 19
    assert body["accuracy"] == 0.76
    assert body["complete"] is True
    assert sum(item["answered"] for item in body["breakdown"]) == 25
    assert sum(item["correct"] for item in body["breakdown"]) == 19
    assert len(body["mistakes"]) == 6


async def test_all_error_responses_match_canonical_fixture_shapes(
    client: AsyncClient, api_app: FastAPI, monkeypatch
) -> None:
    errors = fixture("errors")
    responses = {
        "invalid_request": await client.post(
            "/api/v1/sessions",
            content="{not json",
            headers={"content-type": "application/json"},
        ),
        "invalid_config": await client.post(
            "/api/v1/sessions",
            json={
                **session_request(question_count=5),
                "config": {
                    **session_request(question_count=5)["config"],
                    "positions": [],
                },
            },
        ),
        "drill_not_found": await client.post(
            "/api/v1/sessions",
            json={**session_request(question_count=5), "drill_id": "omaha"},
        ),
        "session_not_found": await client.get("/api/v1/sessions/missing/next"),
        "range_not_found": await client.get("/api/v1/ranges/rfi_6max_BB"),
    }

    created = await create_session(client, question_count=5)
    session_id = created["session_id"]
    question = await current_question(client, session_id)
    responses["question_out_of_order"] = await client.post(
        f"/api/v1/sessions/{session_id}/answer",
        json={"question_id": "q_2", "action_id": "fold"},
    )
    action = await charted_action(client, question)
    answered = await client.post(
        f"/api/v1/sessions/{session_id}/answer",
        json={"question_id": question["question_id"], "action_id": action},
    )
    assert answered.status_code == 200
    responses["question_already_answered"] = await client.post(
        f"/api/v1/sessions/{session_id}/answer",
        json={"question_id": question["question_id"], "action_id": action},
    )

    def fail(_session_id: str) -> None:
        raise RuntimeError("not exposed")

    monkeypatch.setattr(api_app.state.session_service, "next_question", fail)
    responses["internal_error"] = await client.get("/api/v1/sessions/anything/next")

    assert set(responses) == set(errors)
    for code, response in responses.items():
        assert response.status_code == errors[code]["status"]
        assert_fixture_shape(response.json(), errors[code]["body"])
