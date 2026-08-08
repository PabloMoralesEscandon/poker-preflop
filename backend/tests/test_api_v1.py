import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from learner.main import create_app

pytestmark = pytest.mark.anyio

DOCS = Path(__file__).resolve().parents[2] / "docs"
EXAMPLES = DOCS / "examples"


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


def example(name: str) -> dict[str, Any]:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def session_request(
    *, seed: int | None = 12345, positions: list[str] | None = None
) -> dict[str, Any]:
    request: dict[str, Any] = {
        "drill_id": "rfi",
        "config": {
            "table_format": "6max",
            "positions": positions or ["CO"],
            "question_count": 5,
            "weighting": "uniform",
        },
    }
    if seed is not None:
        request["seed"] = seed
    return request


async def create_session(client: AsyncClient, **kwargs) -> dict[str, Any]:
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
    range_id = f"rfi_{prompt['table_format']}_{prompt['hero_position']}"
    response = await client.get(f"/api/v1/ranges/{range_id}")
    cell = response.json()["grid"][prompt["hand"]["notation"]]
    return next(iter(cell), "fold")


async def uncharted_action(client: AsyncClient, question: dict[str, Any]) -> str:
    correct = await charted_action(client, question)
    return "raise" if correct == "fold" else "fold"


def assert_same_shape(actual: Any, expected: Any) -> None:
    if isinstance(expected, dict):
        assert isinstance(actual, dict)
        assert set(actual) == set(expected)
        for key, value in expected.items():
            assert_same_shape(actual[key], value)
    elif isinstance(expected, list):
        assert isinstance(actual, list)
        assert len(actual) == len(expected)
        for actual_item, expected_item in zip(actual, expected, strict=True):
            assert_same_shape(actual_item, expected_item)
    elif isinstance(expected, bool):
        assert isinstance(actual, bool)
    elif isinstance(expected, (int, float)):
        assert isinstance(actual, (int, float)) and not isinstance(actual, bool)
    else:
        assert isinstance(actual, type(expected))


async def test_health_success(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.1.0"}


async def test_drills_matches_canonical_fixture(client: AsyncClient) -> None:
    response = await client.get("/api/v1/drills")

    assert response.status_code == 200
    assert response.json() == example("drills.json")


async def test_create_session_success_and_generated_seed(client: AsyncClient) -> None:
    positions = ["UTG", "HJ", "CO", "BTN", "SB"]
    supplied = await create_session(client, positions=positions)
    generated = await create_session(client, seed=None)

    assert_same_shape(supplied, example("session_create.json"))
    assert supplied["seed"] == 12345
    assert supplied["config"] == session_request(positions=positions)["config"]
    assert generated["seed"] >= 0
    assert generated["session_id"] != supplied["session_id"]
    assert generated["created_at"].endswith("Z")


async def test_seeded_next_question_is_reproducible_and_idempotent(
    client: AsyncClient,
) -> None:
    first_session = await create_session(client, seed=77)
    second_session = await create_session(client, seed=77)

    first = await current_question(client, first_session["session_id"])
    repeated = await current_question(client, first_session["session_id"])
    second = await current_question(client, second_session["session_id"])

    assert first == repeated == second
    assert_same_shape({"done": False, "question": first}, example("next_question.json"))


async def test_answer_and_summary_success(client: AsyncClient) -> None:
    session = await create_session(client)
    question = await current_question(client, session["session_id"])
    action = await uncharted_action(client, question)

    answer = await client.post(
        f"/api/v1/sessions/{session['session_id']}/answer",
        json={"question_id": question["question_id"], "action_id": action},
    )
    summary = await client.get(f"/api/v1/sessions/{session['session_id']}/summary")

    assert answer.status_code == 200
    assert_same_shape(answer.json(), example("answer_incorrect.json"))
    assert answer.json()["progress"] == {"answered": 1, "correct": 0, "total": 5}
    assert summary.status_code == 200
    summary_body = summary.json()
    assert set(summary_body) == set(example("summary.json"))
    assert summary_body["answered"] == 1
    assert summary_body["correct"] == 0
    assert summary_body["complete"] is False
    assert summary_body["breakdown"] == [
        {
            "key": "CO",
            "label": "Cutoff",
            "answered": 1,
            "correct": 0,
            "accuracy": 0.0,
        }
    ]
    assert set(summary_body["mistakes"][0]) == set(
        example("summary.json")["mistakes"][0]
    )


async def test_session_advances_until_done(client: AsyncClient) -> None:
    session = await create_session(client)
    session_id = session["session_id"]

    for expected_index in range(1, 6):
        question = await current_question(client, session_id)
        assert question["index"] == expected_index
        action = await charted_action(client, question)
        response = await client.post(
            f"/api/v1/sessions/{session_id}/answer",
            json={"question_id": question["question_id"], "action_id": action},
        )
        assert response.status_code == 200

    done = await client.get(f"/api/v1/sessions/{session_id}/next")
    summary = await client.get(f"/api/v1/sessions/{session_id}/summary")

    assert done.json() == example("next_done.json")
    assert summary.json()["complete"] is True
    assert summary.json()["answered"] == 5


async def test_ranges_list_filters_and_matches_fixture(client: AsyncClient) -> None:
    all_ranges = await client.get("/api/v1/ranges")
    six_max = await client.get(
        "/api/v1/ranges", params={"spot": "rfi", "table_format": "6max"}
    )
    eight_max = await client.get(
        "/api/v1/ranges", params={"spot": "rfi", "table_format": "8max"}
    )
    vs_rfi = await client.get(
        "/api/v1/ranges", params={"spot": "vs_rfi", "table_format": "6max"}
    )
    missing = await client.get("/api/v1/ranges", params={"spot": "missing"})

    assert all_ranges.status_code == 200
    assert six_max.json() == example("ranges_list.json")
    assert all_ranges.json()["ranges"] == (
        six_max.json()["ranges"]
        + eight_max.json()["ranges"]
        + vs_rfi.json()["ranges"]
    )
    assert [item["range_id"] for item in eight_max.json()["ranges"]] == [
        "rfi_8max_UTG",
        "rfi_8max_UTG1",
        "rfi_8max_LJ",
        "rfi_8max_HJ",
        "rfi_8max_CO",
        "rfi_8max_BTN",
        "rfi_8max_SB",
    ]
    assert missing.json() == {"ranges": []}


async def test_range_detail_has_stats_and_cache_header(client: AsyncClient) -> None:
    response = await client.get("/api/v1/ranges/rfi_6max_CO")
    body = response.json()
    fixture = example("range_rfi_6max_CO.json")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=3600"
    expected_fields = (set(fixture) - {"open_size_bb"}) | {
        "vs_position",
        "facing_size_bb",
        "action_sizes_bb",
    }
    assert set(body) == expected_fields
    assert body["vs_position"] is None
    assert body["facing_size_bb"] is None
    assert body["action_sizes_bb"] == {"raise": 2.5}
    assert set(body["grid"]) == set(fixture["grid"])
    assert all(
        isinstance(cell, dict)
        and all(
            action in {"raise", "call", "limp"} and isinstance(frequency, (int, float))
            for action, frequency in cell.items()
        )
        for cell in body["grid"].values()
    )
    assert body["stats"] == {
        "combos": 368.0,
        "vpip": 0.2775,
        "hands_played": 62,
        "by_action": {"raise": 368.0},
    }


async def test_static_documented_error_envelopes(client: AsyncClient) -> None:
    errors = example("errors.json")
    cases = [
        (
            await client.post(
                "/api/v1/sessions",
                content="{not json",
                headers={"content-type": "application/json"},
            ),
            "invalid_request",
        ),
        (
            await client.post(
                "/api/v1/sessions",
                json={
                    **session_request(),
                    "config": {**session_request()["config"], "positions": []},
                },
            ),
            "invalid_config",
        ),
        (
            await client.post(
                "/api/v1/sessions",
                json={**session_request(), "drill_id": "omaha"},
            ),
            "drill_not_found",
        ),
        (await client.get("/api/v1/sessions/missing/next"), "session_not_found"),
        (
            await client.post(
                "/api/v1/sessions/missing/answer",
                json={"question_id": "q_1", "action_id": "fold"},
            ),
            "session_not_found",
        ),
        (await client.get("/api/v1/sessions/missing/summary"), "session_not_found"),
        (await client.get("/api/v1/ranges/rfi_6max_BB"), "range_not_found"),
    ]

    for response, code in cases:
        assert response.status_code == errors[code]["status"]
        assert response.json() == errors[code]["body"]


async def test_question_out_of_order_error_matches_fixture(client: AsyncClient) -> None:
    error = example("errors.json")["question_out_of_order"]
    session = await create_session(client)
    await current_question(client, session["session_id"])

    response = await client.post(
        f"/api/v1/sessions/{session['session_id']}/answer",
        json={"question_id": "q_2", "action_id": "fold"},
    )

    assert response.status_code == error["status"]
    assert response.json() == error["body"]


async def test_question_already_answered_error_matches_fixture(
    client: AsyncClient,
) -> None:
    error = example("errors.json")["question_already_answered"]
    session = await create_session(client)
    session_id = session["session_id"]
    third_question: dict[str, Any] | None = None

    for _ in range(3):
        question = await current_question(client, session_id)
        action = await charted_action(client, question)
        response = await client.post(
            f"/api/v1/sessions/{session_id}/answer",
            json={"question_id": question["question_id"], "action_id": action},
        )
        assert response.status_code == 200
        third_question = question

    assert third_question is not None
    duplicate = await client.post(
        f"/api/v1/sessions/{session_id}/answer",
        json={
            "question_id": third_question["question_id"],
            "action_id": "fold",
        },
    )

    assert duplicate.status_code == error["status"]
    assert duplicate.json() == error["body"]


async def test_unknown_action_is_invalid_request(client: AsyncClient) -> None:
    session = await create_session(client)
    question = await current_question(client, session["session_id"])

    response = await client.post(
        f"/api/v1/sessions/{session['session_id']}/answer",
        json={"question_id": question["question_id"], "action_id": "dance"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


async def test_internal_error_envelope_matches_fixture(
    client: AsyncClient, api_app: FastAPI, monkeypatch
) -> None:
    error = example("errors.json")["internal_error"]

    def fail(_session_id: str) -> None:
        raise RuntimeError("not exposed")

    monkeypatch.setattr(api_app.state.session_service, "next_question", fail)
    response = await client.get("/api/v1/sessions/anything/next")

    assert response.status_code == error["status"]
    assert response.json() == error["body"]
