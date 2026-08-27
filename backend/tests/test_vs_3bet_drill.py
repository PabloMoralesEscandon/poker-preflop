from random import Random

import pytest

from learner.drills.base import AnsweredQuestion, Question
from learner.drills.range_grading import grade_range_action
from learner.drills.vs_3bet import Vs3BetDrill, actions_for_range
from learner.drills.vs_3bet.models import Vs3BetConfig, Vs3BetHand, Vs3BetPrompt
from learner.errors import LearnerError
from learner.ranges.loader import load_ranges
from learner.ranges.models import RangeData


@pytest.fixture(scope="module")
def drill() -> Vs3BetDrill:
    return Vs3BetDrill(load_ranges())


def config_for(drill: Vs3BetDrill, *matchups: str, **overrides) -> Vs3BetConfig:
    raw = {
        "table_format": "8max",
        "matchups": list(matchups),
        "question_count": 5,
        "weighting": "borderline",
    }
    raw.update(overrides)
    return drill.validate_config(raw)


def question_for(
    drill: Vs3BetDrill,
    config: Vs3BetConfig,
    matchup: str,
    notation: str,
    index: int = 1,
) -> Question:
    """Build one question directly, so grading can be aimed at a chosen hand."""
    range_data: RangeData = drill.ranges.get(f"vs_3bet_8max_{matchup}")
    hero, villain = matchup.split("_vs_", maxsplit=1)
    open_size = range_data.hero_committed_bb
    facing = range_data.facing_size_bb
    assert open_size is not None and facing is not None
    dead = sum(
        amount
        for seat, amount in (("SB", 0.5), ("BB", 1.0))
        if seat not in (hero, villain)
    )
    return Question(
        question_id=f"q_{index}",
        index=index,
        total=config.question_count,
        drill_id=drill.id,
        prompt=Vs3BetPrompt(
            table_format="8max",
            hero_position=hero,
            three_bettor_position=villain,
            stack_bb=range_data.stack_bb,
            hand=Vs3BetHand(cards=["Ah", "Kh"], notation=notation),
            folded=[],
            open_size_bb=open_size,
            facing_size_bb=facing,
            pot_bb=open_size + facing + dead,
            to_call_bb=facing - open_size,
        ),
        actions=actions_for_range(range_data),
    )


class TestConfigSchema:
    def test_matchups_come_from_the_loaded_data(self, drill: Vs3BetDrill) -> None:
        schema = drill.config_schema()
        matchups = next(f for f in schema.fields if f.key == "matchups")
        assert matchups.options_by is not None
        values = [option.value for option in matchups.options_by["8max"]]
        assert len(values) == 28
        assert "UTG_vs_BTN" in values
        assert "SB_vs_BB" in values
        # Nothing where the 3-bettor acts before the opener.
        assert "BTN_vs_UTG" not in values

    def test_labels_name_the_seats_in_words(self, drill: Vs3BetDrill) -> None:
        schema = drill.config_schema()
        matchups = next(f for f in schema.fields if f.key == "matchups")
        assert matchups.options_by is not None
        labels = {option.value: option.label for option in matchups.options_by["8max"]}
        assert labels["UTG_vs_BTN"] == "UTG vs Button 3-bet"
        assert labels["UTG1_vs_LJ"] == "UTG+1 vs Lojack 3-bet"

    def test_rejects_a_matchup_it_does_not_serve(self, drill: Vs3BetDrill) -> None:
        with pytest.raises(LearnerError) as excinfo:
            config_for(drill, "BTN_vs_UTG")
        assert excinfo.value.code == "invalid_config"


class TestGenerate:
    def test_deals_only_hands_hero_opened(self, drill: Vs3BetDrill) -> None:
        """The property `reach` exists for.

        After a 3-bet, `72o` is not a hard question -- hero folded it before
        the 3-bet existed, so asking about it is asking about a hand that was
        never held.
        """
        config = config_for(drill, "UTG_vs_BTN", question_count=200)
        range_data = drill.ranges.get("vs_3bet_8max_UTG_vs_BTN")
        assert range_data.reach is not None
        reach = set(range_data.reach)
        assert "72o" not in reach

        rng = Random(4)
        for index in range(1, 201):
            question = drill.generate(config, index, rng)
            prompt = Vs3BetPrompt.model_validate(question.prompt.model_dump())
            assert prompt.hand.notation in reach

    def test_is_reproducible_from_the_seed(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN", "SB_vs_BB")
        first = [drill.generate(config, i, Random(9)) for i in range(1, 6)]
        second = [drill.generate(config, i, Random(9)) for i in range(1, 6)]
        assert [q.model_dump() for q in first] == [q.model_dump() for q in second]

    def test_prices_the_call_net_of_hero_own_open(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        prompt = Vs3BetPrompt.model_validate(
            drill.generate(config, 1, Random(1)).prompt.model_dump()
        )
        # 3bb open, 10bb 3-bet, both blinds dead and neither player posted one.
        assert prompt.open_size_bb == 3.0
        assert prompt.facing_size_bb == 10.0
        assert prompt.pot_bb == 14.5
        # Not 10bb: hero already has the open in.
        assert prompt.to_call_bb == 7.0

    def test_counts_a_blind_only_once_when_a_blind_is_in_the_hand(
        self, drill: Vs3BetDrill
    ) -> None:
        config = config_for(drill, "SB_vs_BB")
        prompt = Vs3BetPrompt.model_validate(
            drill.generate(config, 1, Random(2)).prompt.model_dump()
        )
        # The SB's 4bb open contains their 0.5bb blind, and the BB's 12bb 3-bet
        # contains their 1bb. Nothing dead is left to add.
        assert prompt.pot_bb == 16.0
        assert prompt.to_call_bb == 8.0

    def test_folds_every_seat_but_the_two_players(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        prompt = Vs3BetPrompt.model_validate(
            drill.generate(config, 1, Random(3)).prompt.model_dump()
        )
        assert prompt.folded == ["UTG1", "LJ", "HJ", "CO", "SB", "BB"]

    def test_offers_fold_first_then_the_charted_actions(
        self, drill: Vs3BetDrill
    ) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        question = drill.generate(config, 1, Random(5))
        assert [action.id for action in question.actions] == [
            "fold",
            "call",
            "4bet",
        ]
        labels = {action.id: action.label for action in question.actions}
        assert labels["call"] == "Call 10bb"
        assert labels["4bet"] == "4-Bet to 24bb"

    def test_offers_the_shove_where_the_chart_has_one(self, drill: Vs3BetDrill) -> None:
        range_data = drill.ranges.get("vs_3bet_8max_LJ_vs_HJ")
        assert "allin" in range_data.actions
        ids = [action.id for action in actions_for_range(range_data)]
        assert ids == ["fold", "call", "4bet", "allin"]
        labels = {a.id: a.label for a in actions_for_range(range_data)}
        assert labels["allin"] == "All-in 100bb"


class TestGrade:
    def test_accepts_any_action_the_chart_takes(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        range_data = drill.ranges.get("vs_3bet_8max_UTG_vs_BTN")
        notation = next(hand for hand, cell in range_data.grid.items() if len(cell) > 1)
        question = question_for(drill, config, "UTG_vs_BTN", notation)
        for action_id in range_data.grid[notation]:
            grade = drill.grade(config, question, action_id)
            assert grade.correct is True
            assert grade.mixed is True

    def test_rejects_an_action_the_chart_never_takes(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        range_data = drill.ranges.get("vs_3bet_8max_UTG_vs_BTN")
        assert range_data.reach is not None
        # A hand hero opened and now folds outright.
        notation = next(hand for hand in range_data.reach if not range_data.grid[hand])
        question = question_for(drill, config, "UTG_vs_BTN", notation)
        grade = drill.grade(config, question, "4bet")
        assert grade.correct is False
        assert grade.expected.action_id == "fold"

    def test_matches_the_shared_range_rule(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        range_data = drill.ranges.get("vs_3bet_8max_UTG_vs_BTN")
        assert range_data.reach is not None
        for notation in range_data.reach:
            question = question_for(drill, config, "UTG_vs_BTN", notation)
            for action_id in ("fold", "call", "4bet"):
                expected = grade_range_action(range_data, notation, action_id)
                grade = drill.grade(config, question, action_id)
                assert grade.correct is expected.correct
                assert grade.expected.action_id == expected.expected_id

    def test_rejects_an_action_that_was_never_offered(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        question = question_for(drill, config, "UTG_vs_BTN", "AA")
        with pytest.raises(LearnerError) as excinfo:
            drill.grade(config, question, "limp")
        assert excinfo.value.code == "invalid_request"

    def test_explanation_states_the_price_and_cites_the_chart(
        self, drill: Vs3BetDrill
    ) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        question = question_for(drill, config, "UTG_vs_BTN", "AA")
        grade = drill.grade(config, question, "4bet")
        assert grade.explanation.detail.startswith("Hero opened to 3bb")
        assert "7bb into a 14.5bb pot" in grade.explanation.detail
        # 7 / (14.5 + 7) = 32.6%, so the copy has to say 33%.
        assert "33% equity" in grade.explanation.detail
        assert grade.explanation.model_dump()["range_id"] == "vs_3bet_8max_UTG_vs_BTN"


class TestSummarize:
    def test_groups_by_matchup_and_keeps_empty_rows(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN", "SB_vs_BB")
        question = question_for(drill, config, "UTG_vs_BTN", "AA")
        grade = drill.grade(config, question, "fold")
        summary = drill.summarize(
            config,
            [AnsweredQuestion(question=question, action_id="fold", grade=grade)],
        )

        assert [row.key for row in summary.breakdown] == [
            "UTG_vs_BTN",
            "SB_vs_BB",
        ]
        assert summary.breakdown[0].answered == 1
        assert summary.breakdown[1].answered == 0
        assert summary.complete is False

    def test_records_the_missed_hand_and_its_chart(self, drill: Vs3BetDrill) -> None:
        config = config_for(drill, "UTG_vs_BTN")
        question = question_for(drill, config, "UTG_vs_BTN", "AA")
        grade = drill.grade(config, question, "fold")
        summary = drill.summarize(
            config,
            [AnsweredQuestion(question=question, action_id="fold", grade=grade)],
        )

        assert len(summary.mistakes) == 1
        mistake = summary.mistakes[0].model_dump()
        assert mistake["matchup"] == "UTG_vs_BTN"
        assert mistake["hand"] == "AA"
        assert mistake["chosen"] == "fold"
        assert mistake["range_id"] == "vs_3bet_8max_UTG_vs_BTN"
