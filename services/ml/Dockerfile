# ============================================================================
# FootyIQ ML Service – Production Container (Dockerfile)
# ============================================================================
# PURPOSE:
#   Builds a lightweight, reproducible container that serves the xG
#   inference API (app.py). This image ships the pre-trained model
#   artifact — it does NOT run ETL or training inside the container.
#
# BUILD:
#   docker build -t footyiq-ml:latest .
#
# RUN:
#   docker run -p 5000:5000 footyiq-ml:latest
# ============================================================================

# --- Base Image ---
# python:3.11-slim: Official lightweight Debian-based Python image.
# Chosen over full python:3.11 to minimize image size while still providing
# a complete Python runtime compatible with scikit-learn/numpy wheels.
FROM python:3.11-slim

# --- Working Directory ---
# All subsequent COPY/RUN instructions operate relative to /app inside
# the container's filesystem.
WORKDIR /app

# --- Install Dependencies (layer-cached) ---
# Copying requirements.txt BEFORE the rest of the source code means Docker
# only re-runs pip install when dependencies actually change, not on every
# source code edit — this dramatically speeds up rebuild times during
# iterative development.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Copy Application Source Code ---
# Only the files required to run the inference API are copied. predict.py
# and train_baseline.py are included for CLI/debugging use inside the
# container (e.g., `docker exec` sanity checks), but are not invoked by CMD.
COPY app.py .
COPY predict.py .
COPY train_baseline.py .
COPY artifacts/ ./artifacts/

# --- Expose Port ---
# Documents that the container listens on port 5000. Does not itself
# publish the port to the host — that happens via `docker run -p`.
EXPOSE 5000

# --- Default Startup Command ---
# Binds Uvicorn to 0.0.0.0 (not 127.0.0.1) so the server is reachable
# from outside the container, on port 5000, running the FastAPI app
# object defined in app.py.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]