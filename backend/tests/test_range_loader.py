import json
from pathlib import Path

import pytest

from learner.errors import LearnerError
from learner.main import create_app
from learner.ranges.loader import RangeLoadError, load_ranges
from learner.ranges.models import canonical_hands


def test_absent_and_empty_directories_produce_empty_indexes(tmp_path: Path) -> None:
    assert len(load_ranges(tmp_path / "absent")) == 0
    empty = tmp_path / "empty"
    empty.mkdir()
    assert len(load_ranges(empty)) == 0


def test_loader_indexes_and_filters_valid_ranges(range_payload, range_writer) -> None:
    root, _ = range_writer(range_payload())

    index = load_ranges(root)

    assert len(index) == 1
    assert index.get("rfi_6max_CO").position == "CO"
    assert index.list(spot="rfi", table_format="6max") == [index.get("rfi_6max_CO")]
    assert index.list(table_format="8max") == []


def test_loader_accepts_fullring_source_and_8max_positions(
    range_payload, range_writer
) -> None:
    payload = range_payload(
        range_id="rfi_8max_UTG1",
        table_format="8max",
        position="UTG1",
        source_id="jl-fullring-preflop-charts",
    )
    root, _ = range_writer(payload, relative="rfi/8max/UTG1.json")

    loaded = load_ranges(root).get("rfi_8max_UTG1")

    assert loaded.table_format == "8max"
    assert loaded.position == "UTG1"


def test_8max_rejects_removed_utg2_position(range_payload, range_writer) -> None:
    payload = range_payload(
        range_id="rfi_8max_UTG2",
        table_format="8max",
        position="UTG2",
        source_id="jl-fullring-preflop-charts",
    )
    root, _ = range_writer(payload, relative="rfi/8max/UTG2.json")

    with pytest.raises(RangeLoadError, match="UTG2.*invalid for 8max"):
        load_ranges(root)


def test_missing_range_maps_to_domain_error(tmp_path: Path) -> None:
    with pytest.raises(LearnerError) as raised:
        load_ranges(tmp_path).get("rfi_6max_BB")

    assert raised.value.code == "range_not_found"
    assert raised.value.status_code == 404


def test_two_action_fixture_round_trips_and_sums_played_stats(
    range_payload, range_writer
) -> None:
    payload = range_payload(actions=["raise", "limp"])
    payload["grid"]["K9s"] = {"limp": 1.0}
    root, _ = range_writer(payload)

    loaded = load_ranges(root).get("rfi_6max_CO")

    assert loaded.actions == ["raise", "limp"]
    assert loaded.grid["AA"] == {"raise": 1.0}
    assert loaded.grid["K9s"] == {"limp": 1.0}
    assert loaded.stats.combos == 10.0
    assert loaded.stats.vpip == 0.0075
    assert loaded.stats.hands_played == 2


def test_grid_must_have_exactly_169_keys(range_payload, range_writer) -> None:
    payload = range_payload()
    del payload["grid"]["72o"]
    root, path = range_writer(payload)

    with pytest.raises(RangeLoadError, match="exactly 169") as raised:
        load_ranges(root)

    assert str(path) in str(raised.value)


def test_every_grid_key_must_be_canonical(range_payload, range_writer) -> None:
    payload = range_payload()
    payload["grid"]["AAs"] = payload["grid"].pop("72o")
    root, _ = range_writer(payload)

    with pytest.raises(RangeLoadError, match="keys must be canonical"):
        load_ranges(root)


def test_cell_actions_must_be_declared(range_payload, range_writer) -> None:
    payload = range_payload()
    payload["grid"]["KK"] = {"call": 1.0}
    root, _ = range_writer(payload)

    with pytest.raises(RangeLoadError, match="undeclared actions.*call"):
        load_ranges(root)


@pytest.mark.parametrize("frequency", [0.0, -0.1, 1.01])
def test_frequencies_must_be_in_open_closed_unit_interval(
    frequency: float, range_payload, range_writer
) -> None:
    payload = range_payload()
    payload["grid"]["AA"] = {"raise": frequency}
    root, _ = range_writer(payload)

    with pytest.raises(RangeLoadError, match=r"frequency must be in \(0, 1\]"):
        load_ranges(root)


def test_cell_action_frequencies_cannot_sum_above_one(
    range_payload, range_writer
) -> None:
    payload = range_payload(actions=["raise", "limp"])
    payload["grid"]["AA"] = {"raise": 0.6, "limp": 0.400002}
    root, _ = range_writer(payload)

    with pytest.raises(RangeLoadError, match="sum above 1.0"):
        load_ranges(root)


def test_path_derived_range_id_must_match(range_payload, range_writer) -> None:
    payload = range_payload(range_id="rfi_6max_BTN")
    root, _ = range_writer(payload)

    with pytest.raises(RangeLoadError, match="does not match path-derived id"):
        load_ranges(root)


def test_unknown_source_id_is_rejected(range_payload, range_writer) -> None:
    root, _ = range_writer(range_payload(source_id="not-registered"))

    with pytest.raises(RangeLoadError, match="unknown source_id.*not-registered"):
        load_ranges(root)


def test_illustrative_fixture_source_is_never_shipped(
    range_payload, range_writer
) -> None:
    root, _ = range_writer(range_payload(source_id="fixture-illustrative"))

    with pytest.raises(RangeLoadError, match="fixture-illustrative.*forbidden"):
        load_ranges(root)


def test_fold_cells_must_be_empty_objects(range_payload, range_writer) -> None:
    payload = range_payload()
    payload["grid"]["72o"] = None
    root, _ = range_writer(payload)

    with pytest.raises(RangeLoadError, match=r"folds are \{\}"):
        load_ranges(root)


def test_every_declared_action_must_appear(range_payload, range_writer) -> None:
    root, _ = range_writer(range_payload(actions=["raise", "limp"]))

    with pytest.raises(RangeLoadError, match="limp.*do not appear"):
        load_ranges(root)


def test_metadata_must_match_supported_v1_values(range_payload, range_writer) -> None:
    root, _ = range_writer(range_payload(stack_bb=50))

    with pytest.raises(RangeLoadError, match="stack_bb must be 100"):
        load_ranges(root)


def test_file_must_follow_three_segment_layout(range_payload, range_writer) -> None:
    root, _ = range_writer(range_payload(), relative="CO.json")

    with pytest.raises(RangeLoadError, match="expected path"):
        load_ranges(root)


def test_malformed_json_is_a_named_startup_failure(tmp_path: Path) -> None:
    root = tmp_path / "ranges"
    path = root / "rfi/6max/CO.json"
    path.parent.mkdir(parents=True)
    path.write_text("{bad json", encoding="utf-8")

    with pytest.raises(RangeLoadError, match="invalid JSON") as raised:
        load_ranges(root)

    assert str(path) in str(raised.value)


def test_extra_file_fields_are_rejected(range_payload, range_writer) -> None:
    root, _ = range_writer(range_payload(unexpected=True))

    with pytest.raises(RangeLoadError, match="Extra inputs are not permitted"):
        load_ranges(root)


def test_app_creation_fails_fast_on_an_invalid_fixture(
    range_payload, range_writer
) -> None:
    payload = range_payload()
    payload["grid"].pop("72o")
    root, _ = range_writer(payload)

    with pytest.raises(RangeLoadError, match="exactly 169"):
        create_app(root)


def test_fixture_payload_is_json_serializable(range_payload) -> None:
    # Guards the fixture contract used by every filesystem rejection test.
    assert json.loads(json.dumps(range_payload()))["range_id"] == "rfi_6max_CO"


def test_fully_open_fixture_has_1326_combos(range_payload, range_writer) -> None:
    payload = range_payload()
    payload["grid"] = {hand: {"raise": 1.0} for hand in canonical_hands()}
    root, _ = range_writer(payload)

    stats = load_ranges(root).get("rfi_6max_CO").stats

    assert stats.combos == 1326.0
    assert stats.vpip == 1.0
    assert stats.hands_played == 169
