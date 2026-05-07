"""
TalknShop ASL Service — WLASL-based American Sign Language recognition.

Exposes POST /predict (video file) and POST /predict/s3 (S3 reference).
Returns { transcript, confidence } for integration with media-service.
Stub implementation by default; set ASL_USE_STUB=0 and provide model path for WLASL inference.
"""

import logging
import os
import time
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models import ASLAlternative, ASLRecognizeRequest, ASLRecognizeResponse, HealthResponse
from wlasl_inference import (
    ASLRecognitionResult,
    STANDARD_RETRY_TRANSCRIPT,
    WLASLInitError,
    WLASLRecognizer,
)
from mediapipe_inference import MediaPipeRecognitionResult, MediaPipeTemplateRecognizer

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
ASL_MEDIAPIPE_ENABLED = os.getenv("ASL_MEDIAPIPE_ENABLED", "1").lower() in ("1", "true", "yes")
PORT = int(os.getenv("PORT", "8004"))

# Allowed video extensions for upload
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov"}


_wlasl_recognizer: Optional[WLASLRecognizer] = None
_mediapipe_recognizer: Optional[MediaPipeTemplateRecognizer] = None


def _load_wlasl_if_configured() -> Optional[WLASLRecognizer]:
    """
    Lazily initialize the WLASL recognizer when not in stub mode.

    If initialization fails, log and fall back to stub behavior.
    """
    global _wlasl_recognizer
    if _wlasl_recognizer is not None:
        return _wlasl_recognizer

    if not ASL_MODEL_PATH:
        logger.warning("ASL_MODEL_PATH is not set; staying in stub mode")
        return None

    try:
        _wlasl_recognizer = WLASLRecognizer.from_env()
        logger.info("WLASLRecognizer loaded successfully")
    except WLASLInitError as e:
        logger.error("Failed to initialize WLASLRecognizer: %s", e)
        _wlasl_recognizer = None
    except Exception as e:  # pragma: no cover - defensive
        logger.exception("Unexpected error initializing WLASLRecognizer: %s", e)
        _wlasl_recognizer = None

    return _wlasl_recognizer


def _load_mediapipe_if_enabled() -> Optional[MediaPipeTemplateRecognizer]:
    """Lazily initialize the MediaPipe template recognizer when enabled."""
    global _mediapipe_recognizer
    if _mediapipe_recognizer is not None:
        return _mediapipe_recognizer
    if not ASL_MEDIAPIPE_ENABLED:
        return None
    try:
        _mediapipe_recognizer = MediaPipeTemplateRecognizer.from_env()
        logger.info("MediaPipeTemplateRecognizer loaded successfully")
    except Exception as e:
        logger.exception("Failed to initialize MediaPipeTemplateRecognizer: %s", e)
        _mediapipe_recognizer = None
    return _mediapipe_recognizer


def _stub_recognize(video_bytes: bytes, content_type: str) -> ASLRecognizeResponse:
    """Return a mock transcript for prototype/testing. Replace with WLASL inference later."""
    return ASLRecognizeResponse(
        # Keep the stub simple so the UI shows a natural query.
        transcript="find me a laptop under 1000 dollars",
        confidence=0.92,
        provider="stub",
        processing_time_seconds=0.01,
        alternatives=None,
        decision="stub",
    )


def _wlasl_result_to_response(result: ASLRecognitionResult, elapsed: float) -> ASLRecognizeResponse:
    """Map WLASLRecognitionResult to API contract."""
    alts = [
        ASLAlternative(gloss=g, query=q, confidence=c)
        for g, q, c in result.alternatives
    ]
    return ASLRecognizeResponse(
        transcript=result.transcript,
        confidence=result.confidence,
        provider=result.provider,
        processing_time_seconds=elapsed,
        alternatives=alts or None,
        decision=result.decision,
    )


def _mediapipe_result_to_response(result: MediaPipeRecognitionResult, elapsed: float) -> ASLRecognizeResponse:
    alts = [ASLAlternative(gloss=g, query=q, confidence=c) for g, q, c in result.alternatives]
    return ASLRecognizeResponse(
        transcript=result.transcript,
        confidence=result.confidence,
        provider=result.provider,
        processing_time_seconds=elapsed,
        alternatives=alts or None,
        decision=result.decision,
    )


@app.get("/health", response_model=HealthResponse)
async def health():
    """Liveness/readiness for docker-compose and media-service."""
    return HealthResponse(
        status="healthy",
        service="asl-service",
        model_loaded=bool(_load_wlasl_if_configured()) if not ASL_USE_STUB else bool(_load_mediapipe_if_enabled()),
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
        # 1) Try MediaPipe template recognizer first (domain-adaptable by enrollment).
        mp_recognizer = _load_mediapipe_if_enabled()
        if mp_recognizer:
            try:
                mp_out = mp_recognizer.recognize(body, video.content_type or "")
            except Exception as e:
                logger.exception("MediaPipe recognition failed: %s", e)
            else:
                elapsed = round(time.perf_counter() - start, 2)
                if mp_out.decision == "accepted":
                    return _mediapipe_result_to_response(mp_out, elapsed)
                logger.info("MediaPipe decision=%s; falling back to WLASL", mp_out.decision)

        # 2) Fallback to WLASL.
        recognizer = _load_wlasl_if_configured()
        if not recognizer:
            logger.warning("No ASL recognizer available; falling back to stub recognition")
            result = _stub_recognize(body, video.content_type or "")
        else:
            try:
                wlasl_out = recognizer.recognize(body, video.content_type or "")
            except Exception as e:
                logger.exception("WLASL recognition failed; returning retry response: %s", e)
                result = ASLRecognizeResponse(
                    transcript=STANDARD_RETRY_TRANSCRIPT,
                    confidence=0.0,
                    provider="wlasl-i3d",
                    processing_time_seconds=0.0,
                    alternatives=None,
                    decision="error_retry",
                )
            else:
                elapsed = round(time.perf_counter() - start, 2)
                return _wlasl_result_to_response(wlasl_out, elapsed)

    elapsed = round(time.perf_counter() - start, 2)
    return result.model_copy(update={"processing_time_seconds": elapsed})


@app.get("/mediapipe/status")
async def mediapipe_status():
    """
    Debug: show where templates are stored and which labels are enrolled.
    Use this if enrollments seem to disappear after rebuild.
    """
    if not ASL_MEDIAPIPE_ENABLED:
        return {"mediapipe_enabled": False, "detail": "Set ASL_MEDIAPIPE_ENABLED=1"}
    recognizer = _load_mediapipe_if_enabled()
    if not recognizer:
        return {"mediapipe_enabled": True, "initialized": False}
    td = recognizer.config.templates_dir
    files_info = []
    if td.exists():
        for p in sorted(td.glob("*.json")):
            try:
                stat = p.stat()
                files_info.append({"name": p.name, "bytes": stat.st_size})
            except OSError:
                files_info.append({"name": p.name, "bytes": None})
    templates = recognizer._load_templates()
    return {
        "mediapipe_enabled": True,
        "templates_dir": str(td),
        "template_files": files_info,
        "labels": sorted(templates.keys()),
        "samples_per_label": {k: len(v) for k, v in templates.items()},
    }


@app.post("/mediapipe/enroll")
async def mediapipe_enroll(label: str, video: UploadFile = File(...)):
    """
    Enroll one example video for a label into the MediaPipe template store.
    Use this to quickly adapt to your shopping-sign vocabulary today.
    """
    recognizer = _load_mediapipe_if_enabled()
    if not recognizer:
        raise HTTPException(status_code=400, detail="MediaPipe recognizer is disabled")
    if not label or not label.strip():
        raise HTTPException(status_code=400, detail="label is required")
    ext = (video.filename or "").lower().split(".")[-1]
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported video format: {ext}")
    body = await video.read()
    try:
        out = recognizer.enroll(body, label=label.strip(), content_type=video.content_type or "")
    except Exception as e:
        logger.exception("MediaPipe enroll failed")
        raise HTTPException(status_code=400, detail=f"enroll failed: {e}") from e
    return {"status": "ok", **out}


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
        alternatives=None,
        decision="stub",
    )


@app.get("/")
async def root():
    return {"service": "asl-service", "version": "1.0.0", "stub": ASL_USE_STUB}
