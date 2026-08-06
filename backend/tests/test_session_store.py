import pytest
from test_drill_core import make_answer

from learner.errors import LearnerError
from learner.sessions.memory import MemorySessionStore
from learner.sessions.store import SessionStore


def test_memory_store_implements_session_store_protocol() -> None:
    assert isinstance(MemorySessionStore(), SessionStore)


def test_store_creates_gets_and_appends_answers() -> None:
    store = MemorySessionStore()
    session = store.create(
        session_id="s_test", drill_id="example", config={"mode": "a"}, seed=7
    )
    answer = make_answer()

    assert store.get("s_test") is session
    assert store.append_answer("s_test", answer).answers == [answer]


def test_store_copies_raw_config() -> None:
    store = MemorySessionStore()
    config = {"mode": "a"}

    session = store.create(drill_id="example", config=config, seed=7)
    config["mode"] = "changed"

    assert session.config == {"mode": "a"}


def test_seeded_sessions_have_reproducible_random_state() -> None:
    first = MemorySessionStore().create(drill_id="example", config={}, seed=12345)
    second = MemorySessionStore().create(drill_id="example", config={}, seed=12345)

    assert [first.rng.random() for _ in range(5)] == [
        second.rng.random() for _ in range(5)
    ]


def test_missing_session_maps_to_domain_error() -> None:
    with pytest.raises(LearnerError) as raised:
        MemorySessionStore().get("missing")

    assert raised.value.code == "session_not_found"
    assert raised.value.status_code == 404


def test_store_rejects_duplicate_session_ids() -> None:
    store = MemorySessionStore()
    store.create(session_id="s_same", drill_id="example", config={}, seed=1)

    with pytest.raises(ValueError, match="already exists"):
        store.create(session_id="s_same", drill_id="example", config={}, seed=2)
