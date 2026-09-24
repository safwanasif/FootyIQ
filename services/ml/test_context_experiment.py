import unittest

import numpy as np
import pandas as pd

from context_experiment import CATS, FEATURES, candidate, context, predict
from model_selection import folds


class ContextTests(unittest.TestCase):
    def test_outcome_fields_cannot_enter_context(self):
        event = {"shot": {"outcome": {"name": "Goal"}, "statsbomb_xg": .99,
                          "body_part": {"name": "Head"}}}
        values = context(event)
        self.assertEqual(set(values), set(CATS))
        self.assertEqual(values["body_part"], "Head")
        self.assertEqual(values["technique"], "UNKNOWN")

    def test_unknown_categories_and_fold_isolation(self):
        df = pd.DataFrame({"distance_to_goal": np.tile([10., 20.], 120),
                           "shot_angle": np.tile([30., 10.], 120),
                           "is_goal": np.tile([0, 1, 0, 0], 60),
                           "match_id": np.repeat(np.arange(24), 10)})
        for key in CATS:
            df[key] = "COMMON"
        df.loc[:9, "technique"] = "RARE"
        for train, test in folds(df, 3):
            self.assertFalse(set(df.iloc[train].match_id) & set(df.iloc[test].match_id))
        unseen = df.iloc[:2].copy()
        unseen[CATS] = "NEVER_SEEN"
        for name in ["geometry", "context_linear", "context_boosted"]:
            model = candidate(name).fit(df[FEATURES + CATS], df.is_goal)
            probabilities = predict(model, unseen)
            self.assertTrue(np.isfinite(probabilities).all())
            self.assertTrue(((probabilities >= 0) & (probabilities <= 1)).all())


if __name__ == "__main__":
    unittest.main()
