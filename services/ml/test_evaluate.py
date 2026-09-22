import unittest
import numpy as np
import pandas as pd
from evaluate import calibration, evaluate, metrics


class EvaluationTests(unittest.TestCase):
    def dataset(self):
        return pd.DataFrame({
            "match_id": np.repeat(np.arange(6), 4),
            "distance_to_goal": np.tile([5., 10., 20., 30.], 6),
            "shot_angle": np.tile([70., 40., 20., 10.], 6),
            "is_goal": np.tile([1, 0, 0, 0], 6),
        })

    def test_every_match_held_out_once_and_results_reproducible(self):
        report = evaluate(self.dataset(), 3)
        self.assertEqual(report, evaluate(self.dataset(), 3))
        test_ids = [match for fold in report["folds"] for match in fold["test_match_ids"]]
        self.assertEqual(len(test_ids), len(set(test_ids)))
        self.assertEqual(len(test_ids), 6)
        self.assertEqual(sum(fold["test_shots"] for fold in report["folds"]), 24)
        self.assertLess(report["model"]["brier_score"], report["goal_rate_baseline"]["brier_score"])

    def test_invalid_labels_and_features_rejected(self):
        for column, value in [("is_goal", 0.5), ("shot_angle", 181), ("distance_to_goal", 0), ("distance_to_goal", np.inf), ("match_id", np.nan)]:
            data = self.dataset()
            data[column] = data[column].astype(float)
            data.loc[0, column] = value
            with self.subTest(column=column, value=value), self.assertRaises(ValueError):
                evaluate(data)

    def test_single_class_training_rejected(self):
        data = self.dataset()
        data["is_goal"] = 0
        with self.assertRaisesRegex(ValueError, "both goals and non-goals"):
            evaluate(data)

    def test_baseline_uses_training_labels_only(self):
        data = self.dataset()
        data.loc[data.match_id == 0, "is_goal"] = 1
        report = evaluate(data, 3)
        for fold in report["folds"]:
            train = data[~data.match_id.astype(str).isin(fold["test_match_ids"])]
            self.assertEqual(fold["training_goal_rate"], train.is_goal.mean())
        self.assertGreater(len(set(fold["training_goal_rate"] for fold in report["folds"])), 1)

    def test_single_class_test_auc_is_explicitly_undefined(self):
        result = metrics(np.array([0, 0]), np.array([0.1, 0.2]))
        self.assertIsNone(result["roc_auc"])
        self.assertTrue(np.isfinite(result["log_loss"]))

    def test_calibration_includes_zero_one_and_empty_bins(self):
        bins = calibration(np.array([0, 1]), np.array([0., 1.]))
        self.assertEqual(sum(item["count"] for item in bins), 2)
        self.assertEqual(bins[0]["count"], 1)
        self.assertEqual(bins[9]["mean_prediction"], 1.)
        self.assertIsNone(bins[5]["goal_rate"])


if __name__ == "__main__":
    unittest.main()
