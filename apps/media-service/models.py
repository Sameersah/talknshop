from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Union
from enum import Enum
import uuid
from datetime import datetime


class ProcessingStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class AudioTranscriptionRequest(BaseModel):
    """Request with base64 audio (legacy)."""
    audio_file: str = Field(..., description="Base64 encoded audio file")
    language_code: str = Field(default="en-US", description="Language code for transcription")
    speaker_count: Optional[int] = Field(default=None, description="Number of speakers")
    vocabulary_name: Optional[str] = Field(default=None, description="Custom vocabulary name")
    output_format: str = Field(default="json", description="Output format")


class TranscribeRequest(BaseModel):
    """Transcribe by base64 audio (audio_file) or by S3 key (s3_key). One of them required."""
    audio_file: Optional[str] = Field(default=None, description="Base64 encoded audio (legacy)")
    s3_key: Optional[str] = Field(default=None, description="S3 key of uploaded audio (orchestrator)")
    language: Optional[str] = Field(default=None, description="Language code e.g. 'en' (orchestrator)")
    language_code: Optional[str] = Field(default="en-US", description="Language code e.g. 'en-US'")
    speaker_count: Optional[int] = None
    vocabulary_name: Optional[str] = None


class SpeakerSegment(BaseModel):
    speaker: str = Field(..., description="Speaker identifier")
    start_time: float = Field(..., description="Start time in seconds")
    end_time: float = Field(..., description="End time in seconds")
    text: str = Field(..., description="Transcribed text")


class AudioTranscriptionResponse(BaseModel):
    transcription_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: ProcessingStatus
    transcript: Optional[str] = Field(default="", description="Full transcript text (never null in JSON)")
    confidence: Optional[float] = Field(default=0.0, description="Overall confidence score (never null in JSON)")
    speakers: Optional[List[SpeakerSegment]] = Field(default=None, description="Speaker segments")
    processing_time: Optional[float] = Field(default=None, description="Processing time in seconds")
    error_message: Optional[str] = Field(default=None, description="Error message if failed")

    @validator("transcript", pre=True)
    def _transcript_never_none(cls, v: Any) -> str:
        if v is None:
            return ""
        return v if isinstance(v, str) else str(v)

    @validator("confidence", pre=True)
    def _confidence_never_none(cls, v: Any) -> float:
        if v is None:
            return 0.0
        try:
            return max(0.0, min(1.0, float(v)))
        except (TypeError, ValueError):
            return 0.0


class ImageAnalysisRequest(BaseModel):
    image_file: str = Field(..., description="Base64 encoded image file")
    analysis_types: List[str] = Field(default=["labels", "text", "objects"], description="Types of analysis to perform")
    max_labels: int = Field(default=10, description="Maximum number of labels to return")
    min_confidence: float = Field(default=0.7, description="Minimum confidence threshold")


class Label(BaseModel):
    name: str = Field(..., description="Label name")
    confidence: float = Field(..., description="Confidence score")
    parents: Optional[List[str]] = Field(default=None, description="Parent categories")


class BoundingBox(BaseModel):
    left: float = Field(..., description="Left coordinate")
    top: float = Field(..., description="Top coordinate")
    width: float = Field(..., description="Width")
    height: float = Field(..., description="Height")


class TextDetection(BaseModel):
    text: str = Field(..., description="Detected text")
    confidence: float = Field(..., description="Confidence score")
    bounding_box: Optional[BoundingBox] = Field(default=None, description="Text bounding box")


class Object(BaseModel):
    name: str = Field(..., description="Object name")
    confidence: float = Field(..., description="Confidence score")
    bounding_box: Optional[BoundingBox] = Field(default=None, description="Object bounding box")


class ImageAnalysisResponse(BaseModel):
    analysis_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: ProcessingStatus
    labels: Optional[List[Label]] = Field(default=None, description="Detected labels")
    text_detections: Optional[List[TextDetection]] = Field(default=None, description="Detected text")
    objects: Optional[List[Object]] = Field(default=None, description="Detected objects")
    processing_time: Optional[float] = Field(default=None, description="Processing time in seconds")
    error_message: Optional[str] = Field(default=None, description="Error message if failed")


class ExtractImageAttributesRequest(BaseModel):
    """Request to extract image attributes from a file already in S3 (by key)."""
    s3_key: str = Field(..., description="S3 object key of the image file")
    extract_text: bool = Field(default=True, description="Whether to extract text (OCR)")
    extract_objects: bool = Field(default=True, description="Whether to detect objects")


class ExtractImageAttributesResponse(BaseModel):
    """Response shape expected by orchestrator (ImageAttributes)."""
    labels: List[str] = Field(default_factory=list, description="Detected label names")
    objects: List[Dict[str, Any]] = Field(default_factory=list, description="Detected objects (name, confidence, etc.)")
    text: List[str] = Field(default_factory=list, description="Detected text strings")
    dominant_colors: List[str] = Field(default_factory=list, description="Dominant colors")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Extra metadata (e.g. processing_time)")


class MediaUploadRequest(BaseModel):
    file_name: str = Field(..., description="Original file name")
    file_type: str = Field(..., description="MIME type of the file")
    file_size: int = Field(..., description="File size in bytes")


class MediaMetadata(BaseModel):
    media_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    file_name: str = Field(..., description="Original file name")
    file_type: str = Field(..., description="MIME type")
    file_size: int = Field(..., description="File size in bytes")
    s3_key: str = Field(..., description="S3 object key")
    s3_bucket: str = Field(..., description="S3 bucket name")
    upload_time: datetime = Field(default_factory=datetime.utcnow)
    processing_status: ProcessingStatus = Field(default=ProcessingStatus.PENDING)


class MediaUploadResponse(BaseModel):
    media_id: str = Field(..., description="Unique media identifier")
    upload_url: Optional[str] = Field(default=None, description="Pre-signed upload URL")
    metadata: MediaMetadata = Field(..., description="Media metadata")


class BatchProcessingRequest(BaseModel):
    files: List[Union[AudioTranscriptionRequest, ImageAnalysisRequest]] = Field(..., description="List of files to process")
    processing_type: str = Field(..., description="Type of processing (audio or image)")


class BatchProcessingResponse(BaseModel):
    batch_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: ProcessingStatus
    total_files: int = Field(..., description="Total number of files")
    processed_files: int = Field(default=0, description="Number of processed files")
    failed_files: int = Field(default=0, description="Number of failed files")
    results: List[Union[AudioTranscriptionResponse, ImageAnalysisResponse]] = Field(default=[], description="Processing results")
    processing_time: Optional[float] = Field(default=None, description="Total processing time")


class ErrorResponse(BaseModel):
    error: Dict[str, Any] = Field(..., description="Error details")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    status: str = Field(default="ok", description="Service status")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    version: str = Field(default="1.0.0", description="Service version")
    aws_services: Dict[str, str] = Field(default={}, description="AWS services status")
