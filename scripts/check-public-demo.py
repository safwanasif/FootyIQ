"""On-demand public health/inference check. No credentials or saved-shot writes."""
import json
import math
import time
import urllib.request

ORIGIN = "https://footy-iq-web.vercel.app"


def request(path, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        ORIGIN + path, data=body,
        headers={"Content-Type": "application/json", "User-Agent": "FootyIQ-release-check"},
    )
    with urllib.request.urlopen(req, timeout=80) as response:
        return json.load(response)


def main():
    started = time.monotonic()
    for attempt in range(2):
        try:
            health = request("/health")
            if health.get("database") != "ok":
                raise ValueError("Database readiness check failed")
            prediction = request("/api/v1/predict-proxy", {
                "distance_meters": 12 / 1.09361,
                "angle_degrees": math.degrees(2 * math.atan(4 / 12)),
            })
            probability = prediction.get("xg_probability")
            if not isinstance(probability, (int, float)) or not 0 <= probability <= 1:
                raise ValueError("Prediction is not a bounded probability")
            if prediction.get("model_id") != "context-boosted-30k-v1":
                raise ValueError("Unexpected serving model")
            print(json.dumps({"status": "passed", "database": "ok", "model": prediction["model_id"],
                              "probability": probability, "attempts": attempt + 1,
                              "elapsed_seconds": round(time.monotonic() - started, 2)}))
            return
        except Exception as error:
            if attempt == 1:
                raise SystemExit(f"FAIL: public demo check: {type(error).__name__}: {error}") from error
            print("Initial check did not complete; allowing one retry for the free backend to wake.")
            time.sleep(15)


if __name__ == "__main__":
    main()
