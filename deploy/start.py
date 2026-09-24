"""Run both backend processes in one free instance; fail if either child exits."""
import json
import signal
import subprocess
import sys
import time
from urllib.request import urlopen

children = []
stopping = False


def stop(*_):
    global stopping
    stopping = True
    for child in children:
        if child.poll() is None:
            child.terminate()


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    children.append(subprocess.Popen([sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "5000"], cwd="services/ml"))
    try:
        ready = False
        for _ in range(90):
            if stopping or children[0].poll() is not None:
                break
            try:
                with urlopen("http://127.0.0.1:5000/health", timeout=1) as response:
                    ready = json.load(response).get("model_loaded") is True
                if ready:
                    break
            except OSError:
                pass
            time.sleep(1)
        if not ready:
            raise RuntimeError("ML service did not become ready")
        children.append(subprocess.Popen(["node", "services/api/dist/index.js"]))
        while not stopping:
            if any(child.poll() is not None for child in children):
                raise RuntimeError("A backend process exited")
            time.sleep(.5)
    finally:
        stop()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == "__main__":
    main()
