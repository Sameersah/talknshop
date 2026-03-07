# TalknShop ASL Service

American Sign Language (ASL) video recognition service for the TalknShop platform. Used by **media-service** when the user sends ASL video; returns a text transcript for the orchestrator.

## Contract

- **POST /predict** — `multipart/form-data` with `video` file (mp4, webm, mov). Returns `{ transcript, confidence?, provider?, processing_time_seconds? }`.
- **POST /predict/s3** — JSON `{ s3_bucket, s3_key }` (optional; for prototype, media-service should use POST /predict with file).
- **GET /health** — Liveness/readiness.

## Stub vs WLASL

- **Stub (default):** `ASL_USE_STUB=1` — returns a fixed mock transcript. Use for wiring and testing without the model.
- **WLASL:** Set `ASL_USE_STUB=0` and provide `ASL_MODEL_PATH` to the pretrained I3D/Pose-TGCN checkpoint; add inference code in `main.py` to load video and run the model.

## Run locally

```bash
cd apps/asl-service
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8004
```

## Run with Docker

From repo root:

```bash
docker-compose up asl-service
```

Service listens on port **8004**. Media-service will call `http://asl-service:8004/predict` when ASL recognition is needed.

## Integration

- **Media-service** implements `POST /api/v1/asl/recognize`; it downloads video from S3 and forwards to this service at `ASL_INFERENCE_URL` (e.g. `http://asl-service:8004`), then returns the normalized response to the orchestrator.
