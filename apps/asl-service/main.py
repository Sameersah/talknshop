"""
TalknShop ASL Service — WLASL-based American Sign Language recognition.

Exposes POST /predict (video file) and POST /predict/s3 (S3 reference).
Returns { transcript, confidence } for integration with media-service.
Stub implementation by default; set ASL_USE_STUB=0 and provide model path for WLASL inference.
"""

import io
import logging
import os
import time
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models import ASLRecognizeRequest, ASLRecognizeResponse, HealthResponse

load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TalknShop ASL Service",
    description="ASL video recognition (WLASL-based I3D/Pose-TGCN). Returns transcript for media-service.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Stub mode: return mock transcript until WLASL model is integrated
ASL_USE_STUB = os.getenv("ASL_USE_STUB", "1").lower() in ("1", "true", "yes")
ASL_MODEL_PATH = os.getenv("ASL_MODEL_PATH", "")
PORT = int(os.getenv("PORT", "8004"))

# Allowed video extensions for upload
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov"}


def _stub_recognize(video_bytes: bytes, content_type: str) -> ASLRecognizeResponse:
    """Return a mock transcript for prototype/testing. Replace with WLASL inference later."""
    return ASLRecognizeResponse(
        transcript="[ASL stub] find me a laptop under 1000 dollars",
        confidence=0.92,
        provider="stub",
        processing_time_seconds=0.01,
    )


@app.get("/health", response_model=HealthResponse)
async def health():
    """Liveness/readiness for docker-compose and media-service."""
    return HealthResponse(
        status="healthy",
        service="asl-service",
        model_loaded=not ASL_USE_STUB and bool(ASL_MODEL_PATH),
    )


@app.post("/predict", response_model=ASLRecognizeResponse)
async def predict(video: UploadFile = File(...)):
    """
    Recognize ASL from uploaded video file.
    Media-service will download video from S3 and POST here (multipart).
    """
    ext = (video.filename or "").lower().split(".")[-1]
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format. Allowed: {list(ALLOWED_VIDEO_EXTENSIONS)}",
        )
    start = time.perf_counter()
    try:
        body = await video.read()
    except Exception as e:
        logger.exception("Failed to read uploaded video")
        raise HTTPException(status_code=400, detail="Failed to read video") from e

    if ASL_USE_STUB:
        result = _stub_recognize(body, video.content_type or "")
    else:
        # TODO: load video, run WLASL I3D/Pose-TGCN, return transcript
        result = _stub_recognize(body, video.content_type or "")

    elapsed = round(time.perf_counter() - start, 2)
    return result.model_copy(update={"processing_time_seconds": elapsed})


@app.post("/predict/s3", response_model=ASLRecognizeResponse)
async def predict_s3(payload: ASLRecognizeRequest):
    """
    Recognize ASL from video stored in S3 (optional path).
    Requires AWS credentials in ASL service if used; for prototype media-service can use POST /predict with file.
    """
    # Stub: no S3 client in ASL service yet; media-service should use POST /predict with file.
    logger.info("predict_s3 called with bucket=%s key=%s (stub)", payload.s3_bucket, payload.s3_key)
    return ASLRecognizeResponse(
        transcript="[ASL stub] S3 path not implemented; use POST /predict with file",
        confidence=0.0,
        provider="stub",
        processing_time_seconds=0.0,
    )


@app.get("/")
async def root():
    return {"service": "asl-service", "version": "1.0.0", "stub": ASL_USE_STUB}
