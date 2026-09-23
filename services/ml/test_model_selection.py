import unittest
import numpy as np
import pandas as pd
from final_model_test import excluded_matches, qualifies, geometry
from model_selection import folds, fit


class ModelSelectionTests(unittest.TestCase):
    def test_final_exclusions_include_both_prior_datasets(self):
        self.assertEqual(excluded_matches({"matches": [{"match_id": 1}, {"match_id": 2}]},
                                         {"folds": [{"test_match_ids": ["2", "3"]}]}), {1, 2, 3})

    def test_promotion_needs_both_log_loss_and_uncertainty_evidence(self):
        self.assertTrue(qualifies({"log_loss": .2}, {"log_loss": .3}, {"upper_95": -.001}))
        self.assertFalse(qualifies({"log_loss": .2}, {"log_loss": .3}, {"upper_95": 0}))
        self.assertFalse(qualifies({"log_loss": .4}, {"log_loss": .3}, {"upper_95": -.001}))

    def test_grouped_folds_and_pipeline_handle_unseen_extreme_geometry(self):
        df = pd.DataFrame([{"match_id": mid, "distance_to_goal": 2 + shot * 3,
                            "shot_angle": 80 - shot * 5, "is_goal": int(shot % 4 == 0)}
                           for mid in range(9) for shot in range(12)])
        coverage = []
        for train, test in folds(df, 3):
            self.assertFalse(set(df.iloc[train].match_id) & set(df.iloc[test].match_id))
            coverage.extend(test)
        self.assertEqual(sorted(coverage), list(range(len(df))))
        trained = fit("spline", df)
        predictions = trained.predict_proba(np.array([geometry(119.9, 40), geometry(60, 0)]))[:, 1]
        self.assertTrue(np.isfinite(predictions).all())
        self.assertTrue(((predictions >= 0) & (predictions <= 1)).all())


if __name__ == "__main__":
    unittest.main()
