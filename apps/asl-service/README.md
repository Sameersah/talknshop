# TalknShop ASL Service

American Sign Language (ASL) video recognition service for the TalknShop platform. Used by **media-service** when the user sends ASL video; returns a text transcript for the orchestrator.

## Contract

- **POST /predict** — `multipart/form-data` with `video` file (mp4, webm, mov). Returns `{ transcript, confidence?, provider?, processing_time_seconds? }`.
- **POST /predict/s3** — JSON `{ s3_bucket, s3_key }` (optional; for prototype, media-service should use POST /predict with file).
- **GET /health** — Liveness/readiness.

## Stub vs WLASL

- **Stub (default):** `ASL_USE_STUB=1` — returns a fixed mock transcript. Use for wiring and testing without the model.
- **WLASL (open-source fallback):**
  - Set `ASL_USE_STUB=0`.
  - Set `ASL_MODEL_PATH` to a pretrained WLASL I3D checkpoint (e.g. `FINAL_nslt_2000_....pt`).
  - Optionally set `ASL_CLASS_LIST_PATH` if your `wlasl_class_list.txt` is not at the default `WLASL/code/I3D/preprocess/wlasl_class_list.txt`.
  - The service will load the model via `wlasl_inference.py` and run inference on uploaded videos, returning a one-word shopping query (e.g. `laptop`, `book`, `phone`) based on the top predicted gloss.

## Run locally

```bash
cd apps/asl-service
pip install -r requirements.txt

# Stub mode (no model required)
uvicorn main:app --reload --host 0.0.0.0 --port 8004

# WLASL mode (after setting ASL_USE_STUB=0 and ASL_MODEL_PATH in .env)
# uvicorn main:app --reload --host 0.0.0.0 --port 8004
```

## Run with Docker

From repo root:

```bash
docker-compose up asl-service
```

Service listens on port **8004**. Media-service will call `http://asl-service:8004/predict` when ASL recognition is needed.

## Integration

- **Media-service** implements `POST /api/v1/asl/recognize`; it downloads video from S3 and forwards to this service at `ASL_INFERENCE_URL` (e.g. `http://asl-service:8004`), then returns the normalized response to the orchestrator.

## Debugging recognition

See **[documentation/DEBUG_ASL.md](documentation/DEBUG_ASL.md)** for how to read `decision`, `alternatives`, and tune `ASL_CONFIDENCE_THRESHOLD`, `ASL_MIN_TOP_MARGIN`, and `ASL_LOGIT_AGG`.
