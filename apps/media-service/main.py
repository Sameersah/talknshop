import os
import base64
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional, Union
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import asyncio
import io

from models import (
    AudioTranscriptionRequest, AudioTranscriptionResponse,
    TranscribeRequest,
    ImageAnalysisRequest, ImageAnalysisResponse,
    MediaUploadRequest, MediaUploadResponse, MediaMetadata,
    BatchProcessingRequest, BatchProcessingResponse,
    ExtractImageAttributesRequest, ExtractImageAttributesResponse,
    ErrorResponse, HealthResponse, ProcessingStatus
)
# Use real AWS services
from aws_services import S3Service, TranscribeService, RekognitionService, AWSHealthChecker, AWSServiceError
from characteristic_extractor import CharacteristicExtractor, AudioCharacteristicExtractor, ExtractedCharacteristics

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
logger = logging.getLogger(__name__)

# Media TTL: auto-delete uploads from S3 after this many minutes (default 15)
MEDIA_TTL_MINUTES = int(os.getenv("MEDIA_TTL_MINUTES", "15"))
# How often to run the S3 cleanup job (seconds, default 5 min)
CLEANUP_INTERVAL_SECONDS = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "300"))
# Prefixes under which all objects are treated as temporary and deleted after TTL
S3_TTL_PREFIXES = ("uploads/", "audio/")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background S3 TTL cleanup; cancel on shutdown."""
    cleanup_task: Optional[asyncio.Task] = None

    async def run_cleanup_loop():
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            try:
                for prefix in S3_TTL_PREFIXES:
                    await s3_service.delete_objects_older_than_minutes(
                        prefix, MEDIA_TTL_MINUTES
                    )
            except Exception as e:
                logger.exception("S3 TTL cleanup error: %s", e)

    try:
        cleanup_task = asyncio.create_task(run_cleanup_loop())
        logger.info(
            "S3 TTL cleanup started: prefixes=%s ttl_min=%s interval_sec=%s",
            S3_TTL_PREFIXES, MEDIA_TTL_MINUTES, CLEANUP_INTERVAL_SECONDS,
        )
        yield
    finally:
        if cleanup_task:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("S3 TTL cleanup task stopped")


# Initialize FastAPI app
app = FastAPI(
    title="TalknShop Media Service",
    description="A specialized service for processing multimedia content using AWS AI/ML services",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AWS services
S3_BUCKET = os.getenv('S3_BUCKET_NAME', 'talknshop-media-storage')
AWS_REGION = os.getenv('AWS_REGION', 'us-west-1')
MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', '52428800'))  # 50MB
ALLOWED_AUDIO_FORMATS = os.getenv('ALLOWED_AUDIO_FORMATS', 'mp3,wav,m4a,flac,webm').split(',')
ALLOWED_IMAGE_FORMATS = os.getenv('ALLOWED_IMAGE_FORMATS', 'jpg,jpeg,png,webp').split(',')
ALLOWED_VIDEO_FORMATS = os.getenv('ALLOWED_VIDEO_FORMATS', 'mp4,webm,mov').split(',')

s3_service = S3Service(S3_BUCKET, AWS_REGION)
transcribe_service = TranscribeService(AWS_REGION)
rekognition_service = RekognitionService(AWS_REGION)
health_checker = AWSHealthChecker(AWS_REGION)

# Initialize characteristic extractors with Ollama
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'llava:7b')
OLLAMA_HOST = os.getenv('OLLAMA_HOST', 'http://localhost:11434')

characteristic_extractor = CharacteristicExtractor(
    ollama_model=OLLAMA_MODEL,
    ollama_host=OLLAMA_HOST
)

audio_characteristic_extractor = AudioCharacteristicExtractor(
    ollama_model=OLLAMA_MODEL,
    ollama_host=OLLAMA_HOST
)

# In-memory storage for job status (in production, use Redis or database)
job_storage = {}


def validate_file_format(filename: str, allowed_formats: List[str]) -> bool:
    """Validate file format"""
    extension = filename.lower().split('.')[-1]
    return extension in allowed_formats


def validate_file_size(file_size: int) -> bool:
    """Validate file size"""
    return file_size <= MAX_FILE_SIZE


async def process_audio_transcription(
    audio_bytes: bytes, 
    request: AudioTranscriptionRequest
) -> AudioTranscriptionResponse:
    """Process audio transcription"""
    start_time = time.time()
    
    try:
        # Generate unique key for S3
        file_key = f"audio/{uuid.uuid4()}.mp3"
        
        # Upload to S3
        s3_url = await s3_service.upload_file(audio_bytes, file_key, "audio/mpeg")
        
        # Start transcription job (uploaded as mp3)
        job_name = f"transcription-{uuid.uuid4()}"
        await transcribe_service.start_transcription_job(
            job_name=job_name,
            media_uri=s3_url,
            language_code=request.language_code,
            media_format="mp3",
            speaker_count=request.speaker_count,
            vocabulary_name=request.vocabulary_name
        )
        
        # Wait for completion
        job_result = await transcribe_service.wait_for_completion(job_name)
        
        # Get transcription results
        transcript_uri = job_result['Transcript']['TranscriptFileUri']
        transcript_data = await transcribe_service.get_transcription_results(transcript_uri)
        
        # Parse results (AWS: transcripts[].transcript, items[].alternatives[].confidence)
        transcripts = transcript_data.get("results", {}).get("transcripts", [])
        transcript_text = (transcripts[0].get("transcript") or "") if transcripts else ""
        confidence = _confidence_from_transcript_data(transcript_data)
        
        # Parse speaker segments if available
        speakers = []
        if 'speaker_labels' in transcript_data['results']:
            for segment in transcript_data['results']['speaker_labels']['segments']:
                speakers.append({
                    "speaker": segment['speaker_label'],
                    "start_time": segment['start_time'],
                    "end_time": segment['end_time'],
                    "text": segment['items'][0]['content'] if segment['items'] else ""
                })
        
        processing_time = time.time() - start_time
        
        return AudioTranscriptionResponse(
            status=ProcessingStatus.COMPLETED,
            transcript=transcript_text,
            confidence=confidence,
            speakers=speakers,
            processing_time=processing_time
        )
        
    except AWSServiceError as e:
        logger.error(f"AWS service error during transcription: {e}")
        return AudioTranscriptionResponse(
            status=ProcessingStatus.FAILED,
            transcript="",
            confidence=0.0,
            error_message=str(e),
            processing_time=time.time() - start_time
        )
    except Exception as e:
        logger.error(f"Unexpected error during transcription: {e}")
        return AudioTranscriptionResponse(
            status=ProcessingStatus.FAILED,
            transcript="",
            confidence=0.0,
            error_message=f"Transcription failed: {str(e)}",
            processing_time=time.time() - start_time
        )


def _media_format_from_s3_key(s3_key: str) -> str:
    """Infer AWS Transcribe MediaFormat from file extension."""
    ext = (s3_key or "").lower().split(".")[-1]
    return ext if ext in ("mp3", "mp4", "wav", "flac", "ogg", "amr", "webm", "m4a") else "mp3"


def _confidence_from_transcript_data(transcript_data: dict) -> float:
    """Parse confidence from AWS Transcribe JSON. Items have alternatives[].confidence (string)."""
    try:
        items = transcript_data.get("results", {}).get("items", [])
        for item in items:
            alts = item.get("alternatives", [])
            if alts and "confidence" in alts[0]:
                raw = alts[0]["confidence"]
                return float(raw) if raw not in (None, "") else 0.0
        return 0.0
    except (TypeError, ValueError, KeyError):
        return 0.0


async def process_audio_transcription_by_s3_key(
    s3_key: str, language_code: str = "en-US"
) -> AudioTranscriptionResponse:
    """Transcribe audio already stored in S3 (e.g. client upload)."""
    start_time = time.time()
    logger.info(
        "process_audio_transcription_by_s3_key: start s3_key=%s language_code=%s S3_BUCKET=%s",
        s3_key, language_code, S3_BUCKET,
    )
    try:
        media_uri = f"s3://{S3_BUCKET}/{s3_key}"
        media_format = _media_format_from_s3_key(s3_key)
        job_name = f"transcription-{uuid.uuid4()}"
        logger.info("process_audio_transcription_by_s3_key: media_uri=%s media_format=%s job_name=%s", media_uri, media_format, job_name)

        await transcribe_service.start_transcription_job(
            job_name=job_name,
            media_uri=media_uri,
            language_code=language_code,
            media_format=media_format,
        )
        job_result = await transcribe_service.wait_for_completion(job_name)
        transcript_uri = job_result.get("Transcript", {}).get("TranscriptFileUri")
        if not transcript_uri:
            logger.error("process_audio_transcription_by_s3_key: job completed but no TranscriptFileUri job_result_keys=%s", list(job_result.keys()))
            return AudioTranscriptionResponse(
                status=ProcessingStatus.FAILED,
                transcript="",
                confidence=0.0,
                error_message="Transcription job completed but no transcript URI",
                processing_time=time.time() - start_time,
            )

        transcript_data = await transcribe_service.get_transcription_results(transcript_uri)
        results = transcript_data.get("results") if isinstance(transcript_data, dict) else {}
        transcripts = results.get("transcripts", []) if isinstance(results, dict) else []
        transcript_text = ""
        if transcripts and isinstance(transcripts[0], dict):
            transcript_text = transcripts[0].get("transcript") or ""
        elif transcripts and isinstance(transcripts[0], str):
            transcript_text = transcripts[0]
        transcript_text = transcript_text if isinstance(transcript_text, str) else ""

        confidence = _confidence_from_transcript_data(transcript_data)
        confidence = 0.0 if confidence is None else max(0.0, min(1.0, float(confidence)))

        processing_time = time.time() - start_time
        logger.info(
            "process_audio_transcription_by_s3_key: success transcript_len=%s confidence=%s processing_time=%.2f",
            len(transcript_text), confidence, processing_time,
        )
        return AudioTranscriptionResponse(
            status=ProcessingStatus.COMPLETED,
            transcript=transcript_text,
            confidence=confidence,
            processing_time=processing_time,
        )
    except AWSServiceError as e:
        logger.error("process_audio_transcription_by_s3_key: AWSServiceError s3_key=%s error=%s", s3_key, e, exc_info=True)
        return AudioTranscriptionResponse(
            status=ProcessingStatus.FAILED,
            transcript="",
            confidence=0.0,
            error_message=str(e),
            processing_time=time.time() - start_time,
        )
    except Exception as e:
        logger.error("process_audio_transcription_by_s3_key: Exception s3_key=%s error=%s", s3_key, e, exc_info=True)
        return AudioTranscriptionResponse(
            status=ProcessingStatus.FAILED,
            transcript="",
            confidence=0.0,
            error_message=str(e),
            processing_time=time.time() - start_time,
        )


async def process_image_analysis(
    image_bytes: bytes, 
    request: ImageAnalysisRequest
) -> ImageAnalysisResponse:
    """Process image analysis"""
    start_time = time.time()
    
    try:
        # Analyze image using Rekognition
        results = await rekognition_service.analyze_image(
            image_bytes=image_bytes,
            analysis_types=request.analysis_types,
            max_labels=request.max_labels,
            min_confidence=request.min_confidence
        )
        
        processing_time = time.time() - start_time
        
        return ImageAnalysisResponse(
            status=ProcessingStatus.COMPLETED,
            labels=results.get('labels'),
            text_detections=results.get('text_detections'),
            objects=results.get('objects'),
            processing_time=processing_time
        )
        
    except AWSServiceError as e:
        logger.error(f"AWS service error during image analysis: {e}")
        return ImageAnalysisResponse(
            status=ProcessingStatus.FAILED,
            error_message=str(e),
            processing_time=time.time() - start_time
        )
    except Exception as e:
        logger.error(f"Unexpected error during image analysis: {e}")
        return ImageAnalysisResponse(
            status=ProcessingStatus.FAILED,
            error_message=f"Image analysis failed: {str(e)}",
            processing_time=time.time() - start_time
        )


# Health Check Endpoint
@app.get("/health", response_model=HealthResponse)
async def health():
    """Service health check"""
    try:
        aws_services = await health_checker.check_services()
        return HealthResponse(aws_services=aws_services)
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(status="unhealthy")


# Ollama status (for verifying vision flow when media-service runs in Docker)
@app.get("/api/v1/ollama/status")
async def ollama_status():
    """
    Check if Ollama is reachable and the configured vision model is available.
    Use this when media-service runs in Docker to confirm OLLAMA_HOST is correct.
    """
    import asyncio
    configured = OLLAMA_MODEL
    host = OLLAMA_HOST
    result = {"available": False, "configured_model": configured, "ollama_host": host, "models": [], "error": None}
    try:
        try:
            import ollama
        except ImportError:
            result["error"] = "ollama package not installed"
            return result
        # Use explicit host so Docker container connects to host.docker.internal, not localhost
        client = ollama.Client(host=host)
        loop = asyncio.get_event_loop()
        models_response = await loop.run_in_executor(None, lambda: client.list())
        models = getattr(models_response, "models", None) or []
        # Ollama client may return objects with .model / .name or dicts with "model" / "name"
        def _model_name(m):
            if hasattr(m, "model") and m.model:
                return str(m.model).strip()
            if hasattr(m, "name") and m.name:
                return str(m.name).strip()
            if isinstance(m, dict):
                return str(m.get("model") or m.get("name") or "").strip()
            return ""
        model_names = [n for n in (_model_name(m) for m in models) if n]
        result["models"] = model_names
        configured_base = (configured or "").split(":")[0]
        result["available"] = any(
            (name and (name == configured or name.startswith(configured_base) or configured in name))
            for name in model_names
        ) if model_names else False
        if not result["available"] and model_names:
            result["error"] = f"Configured model {configured!r} not in list. Available: {model_names[:15]}"
        elif not model_names:
            result["error"] = "Ollama reachable but no models listed (pull one with: ollama pull llava:7b)"
    except Exception as e:
        result["error"] = str(e)
        result["models"] = []
    return result


# Audio Processing Endpoints
@app.post("/api/v1/transcribe", response_model=AudioTranscriptionResponse)
async def transcribe_audio(request: TranscribeRequest):
    """Transcribe audio: provide s3_key (orchestrator) or audio_file (base64)."""
    try:
        logger.info(
            "transcribe_audio: request has s3_key=%s audio_file_len=%s language=%s",
            bool(request.s3_key), len(request.audio_file) if request.audio_file else 0, getattr(request, "language", None),
        )
        if request.s3_key:
            language_code = request.language_code or (f"{request.language}-US" if request.language else "en-US")
            if language_code and len(language_code) == 2:
                language_code = f"{language_code}-US"
            logger.info("transcribe_audio: using s3_key path s3_key=%s language_code=%s", request.s3_key, language_code)
            return await process_audio_transcription_by_s3_key(request.s3_key, language_code)
        if request.audio_file:
            audio_bytes = base64.b64decode(request.audio_file)
            if not validate_file_size(len(audio_bytes)):
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE} bytes"
                )
            legacy = AudioTranscriptionRequest(
                audio_file=request.audio_file,
                language_code=request.language_code or "en-US",
                speaker_count=request.speaker_count,
                vocabulary_name=request.vocabulary_name,
            )
            return await process_audio_transcription(audio_bytes, legacy)
        raise HTTPException(status_code=400, detail="Provide either s3_key or audio_file")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/transcribe/{job_id}", response_model=AudioTranscriptionResponse)
async def get_transcription_status(job_id: str):
    """Get transcription job status"""
    if job_id not in job_storage:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job_storage[job_id]


@app.post("/api/v1/transcribe/batch", response_model=BatchProcessingResponse)
async def batch_transcribe_audio(background_tasks: BackgroundTasks, request: BatchProcessingRequest):
    """Batch audio transcription"""
    batch_id = str(uuid.uuid4())
    
    # Initialize batch response
    batch_response = BatchProcessingResponse(
        batch_id=batch_id,
        status=ProcessingStatus.IN_PROGRESS,
        total_files=len(request.files)
    )
    
    # Store batch info
    job_storage[batch_id] = batch_response
    
    # Process files in background
    async def process_batch():
        results = []
        processed = 0
        failed = 0
        
        for file_request in request.files:
            try:
                if isinstance(file_request, AudioTranscriptionRequest):
                    audio_bytes = base64.b64decode(file_request.audio_file)
                    result = await process_audio_transcription(audio_bytes, file_request)
                    results.append(result)
                    
                    if result.status == ProcessingStatus.COMPLETED:
                        processed += 1
                    else:
                        failed += 1
                else:
                    failed += 1
                    results.append(AudioTranscriptionResponse(
                        status=ProcessingStatus.FAILED,
                        error_message="Invalid request type for audio transcription"
                    ))
            except Exception as e:
                failed += 1
                results.append(AudioTranscriptionResponse(
                    status=ProcessingStatus.FAILED,
                    error_message=str(e)
                ))
        
        # Update batch status
        batch_response.status = ProcessingStatus.COMPLETED
        batch_response.processed_files = processed
        batch_response.failed_files = failed
        batch_response.results = results
        batch_response.processing_time = time.time()
    
    background_tasks.add_task(process_batch)
    return batch_response


# Image Processing Endpoints
@app.post("/api/v1/analyze-image", response_model=ImageAnalysisResponse)
async def analyze_image(request: ImageAnalysisRequest):
    """Analyze image content"""
    try:
        # Decode base64 image
        image_bytes = base64.b64decode(request.image_file)
        
        # Validate file size
        if not validate_file_size(len(image_bytes)):
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE} bytes"
            )
        
        # Process image analysis
        result = await process_image_analysis(image_bytes, request)
        return result
        
    except Exception as e:
        logger.error(f"Image analysis request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/extract-attributes", response_model=ImageAnalysisResponse)
async def extract_attributes(request: ImageAnalysisRequest):
    """Extract product attributes from images"""
    # This is essentially the same as analyze_image but with specific focus on product attributes
    return await analyze_image(request)


@app.post("/api/v1/extract-image-attributes", response_model=ExtractImageAttributesResponse)
async def extract_image_attributes(request: ExtractImageAttributesRequest):
    """
    Extract image attributes from a file already stored in S3 (by key).
    Used by the orchestrator when the client has uploaded an image and sent its s3_key.
    """
    try:
        image_bytes = await s3_service.download_file(request.s3_key)
    except AWSServiceError as e:
        logger.warning(f"Failed to download image from S3: {request.s3_key}: {e}")
        raise HTTPException(status_code=404, detail=f"Image not found in S3: {request.s3_key}")
    if not validate_file_size(len(image_bytes)):
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE} bytes"
        )
    analysis_types = ["labels"]
    if request.extract_text:
        analysis_types.append("text")
    if request.extract_objects:
        analysis_types.append("objects")
    start_time = time.time()
    try:
        results = await rekognition_service.analyze_image(
            image_bytes=image_bytes,
            analysis_types=analysis_types,
            max_labels=15,
            min_confidence=0.6,
            product_context=True,  # Filter to labels for things users can buy (exclude Person, Face, etc.)
        )
    except AWSServiceError as e:
        logger.error(f"Rekognition error during extract-image-attributes: {e}")
        raise HTTPException(status_code=502, detail=f"Image analysis failed: {str(e)}")
    processing_time = time.time() - start_time
    labels_raw = results.get("labels") or []
    text_raw = results.get("text_detections") or []
    objects_raw = results.get("objects") or []
    labels = [getattr(l, "name", l) if hasattr(l, "name") else str(l) for l in labels_raw]
    text = [getattr(t, "text", t) if hasattr(t, "text") else str(t) for t in text_raw]
    objects = []
    for o in objects_raw:
        if hasattr(o, "name") and hasattr(o, "confidence"):
            objects.append({"name": o.name, "confidence": o.confidence})
        elif isinstance(o, dict):
            objects.append(o)
        else:
            objects.append({"name": str(o), "confidence": 0.0})

    # Ollama vision: get specific product/clothing description (e.g. bomber jacket) for main flow
    metadata = {"s3_key": request.s3_key, "processing_time": processing_time}
    try:
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        vision_desc = await characteristic_extractor.get_product_description_vision(image_b64)
        if vision_desc:
            labels.insert(0, vision_desc)  # Prepend so it's in top 10 and BuildRequirement sees it
            metadata["vision_description"] = vision_desc
            logger.info("extract_image_attributes: added Ollama vision description to labels: %s", vision_desc[:60])
    except Exception as e:
        logger.warning("extract_image_attributes: Ollama vision failed (continuing with Rekognition only): %s", e)

    return ExtractImageAttributesResponse(
        labels=labels,
        objects=objects,
        text=text,
        dominant_colors=[],
        metadata=metadata,
    )


@app.post("/api/v1/extract-characteristics")
async def extract_characteristics(request: ImageAnalysisRequest):
    """Extract detailed characteristics from images using LLM"""
    try:
        # Decode base64 image
        image_bytes = base64.b64decode(request.image_file)
        
        # Validate file size
        if not validate_file_size(len(image_bytes)):
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE} bytes"
            )
        
        # Get AWS analysis first
        aws_results = await rekognition_service.analyze_image(
            image_bytes=image_bytes,
            analysis_types=request.analysis_types,
            max_labels=request.max_labels,
            min_confidence=request.min_confidence
        )
        
        # Extract enhanced characteristics
        characteristics = await characteristic_extractor.extract_characteristics(
            image_base64=request.image_file,
            aws_results=aws_results
        )
        
        return {
            "analysis_id": str(uuid.uuid4()),
            "status": "completed",
            "item_type": characteristics.item_type.value,
            "primary_item": characteristics.primary_item,
            "characteristics": [
                {
                    "name": char.name,
                    "value": char.value,
                    "confidence": char.confidence,
                    "category": char.category
                } for char in characteristics.characteristics
            ],
            "extraction_method": characteristics.extraction_method,
            "confidence_score": characteristics.confidence_score,
            "aws_results": aws_results,
            "processing_time": time.time()
        }
        
    except Exception as e:
        logger.error(f"Characteristic extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/extract-audio-characteristics")
async def extract_audio_characteristics(request: AudioTranscriptionRequest):
    """Extract characteristics from audio content"""
    try:
        # Decode base64 audio
        audio_bytes = base64.b64decode(request.audio_file)
        
        # Validate file size
        if not validate_file_size(len(audio_bytes)):
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE} bytes"
            )
        
        # Process transcription first
        transcription_result = await process_audio_transcription(audio_bytes, request)
        
        if transcription_result.status != ProcessingStatus.COMPLETED:
            raise HTTPException(
                status_code=400,
                detail="Transcription failed, cannot extract characteristics"
            )
        
        # Extract audio characteristics
        audio_metadata = {
            "speaker_count": request.speaker_count,
            "language_code": request.language_code,
            "confidence": transcription_result.confidence
        }
        
        characteristics = await audio_characteristic_extractor.extract_audio_characteristics(
            transcript=transcription_result.transcript,
            audio_metadata=audio_metadata
        )
        
        return {
            "analysis_id": str(uuid.uuid4()),
            "status": "completed",
            "transcript": transcription_result.transcript,
            "characteristics": [
                {
                    "name": char.name,
                    "value": char.value,
                    "confidence": char.confidence,
                    "category": char.category
                } for char in characteristics
            ],
            "speaker_segments": transcription_result.speakers,
            "processing_time": time.time()
        }
        
    except Exception as e:
        logger.error(f"Audio characteristic extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/analyze-image/batch", response_model=BatchProcessingResponse)
async def batch_analyze_image(background_tasks: BackgroundTasks, request: BatchProcessingRequest):
    """Batch image analysis"""
    batch_id = str(uuid.uuid4())
    
    # Initialize batch response
    batch_response = BatchProcessingResponse(
        batch_id=batch_id,
        status=ProcessingStatus.IN_PROGRESS,
        total_files=len(request.files)
    )
    
    # Store batch info
    job_storage[batch_id] = batch_response
    
    # Process files in background
    async def process_batch():
        results = []
        processed = 0
        failed = 0
        
        for file_request in request.files:
            try:
                if isinstance(file_request, ImageAnalysisRequest):
                    image_bytes = base64.b64decode(file_request.image_file)
                    result = await process_image_analysis(image_bytes, file_request)
                    results.append(result)
                    
                    if result.status == ProcessingStatus.COMPLETED:
                        processed += 1
                    else:
                        failed += 1
                else:
                    failed += 1
                    results.append(ImageAnalysisResponse(
                        status=ProcessingStatus.FAILED,
                        error_message="Invalid request type for image analysis"
                    ))
            except Exception as e:
                failed += 1
                results.append(ImageAnalysisResponse(
                    status=ProcessingStatus.FAILED,
                    error_message=str(e)
                ))
        
        # Update batch status
        batch_response.status = ProcessingStatus.COMPLETED
        batch_response.processed_files = processed
        batch_response.failed_files = failed
        batch_response.results = results
        batch_response.processing_time = time.time()
    
    background_tasks.add_task(process_batch)
    return batch_response


# Media Management Endpoints
@app.post("/api/v1/upload", response_model=MediaUploadResponse)
async def upload_media(request: MediaUploadRequest):
    """Generate presigned URL for client upload to S3 (image, audio, or video)."""
    try:
        # Validate file type (image, audio, or video for ASL)
        file_extension = request.file_name.lower().split('.')[-1]
        all_allowed = ALLOWED_AUDIO_FORMATS + ALLOWED_IMAGE_FORMATS + ALLOWED_VIDEO_FORMATS
        if file_extension not in all_allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format. Allowed: {all_allowed}"
            )
        
        # Validate file size
        if not validate_file_size(request.file_size):
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE} bytes"
            )
        
        # Generate unique key
        media_id = str(uuid.uuid4())
        file_key = f"uploads/{media_id}/{request.file_name}"
        
        # Generate presigned URL for upload (include ContentType so client's Content-Type header matches signature)
        upload_url = await s3_service.generate_presigned_url(
            file_key, content_type=request.file_type
        )
        
        # Create metadata
        metadata = MediaMetadata(
            media_id=media_id,
            file_name=request.file_name,
            file_type=request.file_type,
            file_size=request.file_size,
            s3_key=file_key,
            s3_bucket=S3_BUCKET
        )
        
        return MediaUploadResponse(
            media_id=media_id,
            upload_url=upload_url,
            metadata=metadata
        )
        
    except Exception as e:
        logger.error(f"Media upload request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/media/{media_id}")
async def get_media_metadata(media_id: str):
    """Get media metadata"""
    # In production, this would query a database
    # For now, return a placeholder response
    return {"media_id": media_id, "status": "metadata_not_implemented"}


@app.delete("/api/v1/media/{media_id}")
async def delete_media(media_id: str):
    """Delete media files"""
    try:
        # In production, you'd look up the S3 key from database
        # For now, we'll assume the key follows the pattern
        file_key = f"uploads/{media_id}/"
        
        # Delete from S3 (this is a simplified version)
        success = await s3_service.delete_file(file_key)
        
        if success:
            return {"message": "Media deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Media not found")
            
    except Exception as e:
        logger.error(f"Media deletion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/media/{media_id}/download")
async def download_media(media_id: str):
    """Download media files"""
    try:
        # In production, you'd look up the S3 key from database
        file_key = f"uploads/{media_id}/"
        
        # Download from S3
        file_content = await s3_service.download_file(file_key)
        
        return StreamingResponse(
            io.BytesIO(file_content),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={media_id}"}
        )
        
    except Exception as e:
        logger.error(f"Media download failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Error handling
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error={
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An internal server error occurred",
                "details": {"exception": str(exc)}
            }
        ).dict()
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
