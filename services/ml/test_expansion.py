import unittest
import pandas as pd
from expand_data import clean_shot, order_matches
from scale_experiment import split_matches, training_subset


class ExpansionTests(unittest.TestCase):
    def test_shot_filters_and_geometry(self):
        event = {"id": "unique", "type": {"name": "Shot"}, "period": 1,
                 "location": [108, 40], "shot": {"type": {"name": "Open Play"}, "outcome": {"name": "Goal"}}}
        match = {"match_id": 42}
        row = clean_shot(event, match)
        self.assertEqual(row["distance_to_goal"], 12)
        self.assertAlmostEqual(row["shot_angle"], 36.86989764584402)
        self.assertEqual(row["is_goal"], 1)
        self.assertIsNone(clean_shot({**event, "period": 5}, match))
        self.assertIsNone(clean_shot({**event, "shot": {"type": {"name": "Penalty"}}}, match))
        for location in [None, [], [float("nan"), 40], [121, 40], [108, -1]]:
            self.assertIsNone(clean_shot({**event, "location": location}, match))
        with self.assertRaises(ValueError):
            clean_shot({**event, "id": None}, match)

    def test_order_is_input_independent_and_balances_competitions(self):
        rows = [{"match_id": i, "competition_id": i % 3} for i in range(30)]
        ordered = order_matches(rows)
        self.assertEqual(ordered, order_matches(reversed(rows)))
        self.assertEqual([r["competition_id"] for r in ordered[:6]], [0, 1, 2, 0, 1, 2])

    def test_splits_keep_matches_whole_and_subsets_nested(self):
        df = pd.DataFrame([{"match_id": mid, "competition_id": mid % 2, "is_goal": shot % 2}
                           for mid in range(20) for shot in range(5)])
        train, test = split_matches(df)
        self.assertFalse(set(train.match_id) & set(test.match_id))
        self.assertEqual(len(train) + len(test), len(df))
        self.assertEqual(set(test.competition_id), {0, 1})
        small, large = training_subset(train, 12), training_subset(train, 24)
        self.assertTrue(set(small.match_id) <= set(large.match_id))
        self.assertTrue(small.groupby("match_id").size().eq(5).all())


if __name__ == "__main__":
    unittest.main()
