import os
import base64
import logging
import time
import uuid
from typing import List, Optional, Union
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import asyncio
import io

from models import (
    AudioTranscriptionRequest, AudioTranscriptionResponse,
    ImageAnalysisRequest, ImageAnalysisResponse,
    MediaUploadRequest, MediaUploadResponse, MediaMetadata,
    BatchProcessingRequest, BatchProcessingResponse,
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

# Initialize FastAPI app
app = FastAPI(
    title="TalknShop Media Service",
    description="A specialized service for processing multimedia content using AWS AI/ML services",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
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
ALLOWED_AUDIO_FORMATS = os.getenv('ALLOWED_AUDIO_FORMATS', 'mp3,wav,m4a,flac').split(',')
ALLOWED_IMAGE_FORMATS = os.getenv('ALLOWED_IMAGE_FORMATS', 'jpg,jpeg,png,webp').split(',')

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
        
        # Start transcription job
        job_name = f"transcription-{uuid.uuid4()}"
        await transcribe_service.start_transcription_job(
            job_name=job_name,
            media_uri=s3_url,
            language_code=request.language_code,
            speaker_count=request.speaker_count,
            vocabulary_name=request.vocabulary_name
        )
        
        # Wait for completion
        job_result = await transcribe_service.wait_for_completion(job_name)
        
        # Get transcription results
        transcript_uri = job_result['Transcript']['TranscriptFileUri']
        transcript_data = await transcribe_service.get_transcription_results(transcript_uri)
        
        # Parse results
        transcript_text = transcript_data['results']['transcripts'][0]['transcript']
        confidence = transcript_data['results']['items'][0].get('confidence', 0.0) if transcript_data['results']['items'] else 0.0
        
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
            error_message=str(e),
            processing_time=time.time() - start_time
        )
    except Exception as e:
        logger.error(f"Unexpected error during transcription: {e}")
        return AudioTranscriptionResponse(
            status=ProcessingStatus.FAILED,
            error_message=f"Transcription failed: {str(e)}",
            processing_time=time.time() - start_time
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


# Audio Processing Endpoints
@app.post("/api/v1/transcribe", response_model=AudioTranscriptionResponse)
async def transcribe_audio(request: AudioTranscriptionRequest):
    """Transcribe audio file"""
    try:
        # Decode base64 audio
        audio_bytes = base64.b64decode(request.audio_file)
        
        # Validate file size
        if not validate_file_size(len(audio_bytes)):
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE} bytes"
            )
        
        # Process transcription
        result = await process_audio_transcription(audio_bytes, request)
        return result
        
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
    """Upload media files to S3"""
    try:
        # Validate file type
        file_extension = request.file_name.lower().split('.')[-1]
        if file_extension not in ALLOWED_AUDIO_FORMATS + ALLOWED_IMAGE_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format. Allowed formats: {ALLOWED_AUDIO_FORMATS + ALLOWED_IMAGE_FORMATS}"
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
        
        # Generate presigned URL for upload
        upload_url = await s3_service.generate_presigned_url(file_key)
        
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
