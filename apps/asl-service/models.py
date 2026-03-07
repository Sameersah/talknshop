"""
Pydantic models for ASL recognition API.
Contract aligned with ASL_INTEGRATION_TECHNICAL_DESIGN.md for media-service integration.
"""

from typing import Optional
from pydantic import BaseModel, Field


class ASLRecognizeRequest(BaseModel):
    """Request body when calling with S3 reference (optional; media-service may send video file instead)."""
    s3_bucket: str = Field(..., description="S3 bucket name")
    s3_key: str = Field(..., description="S3 object key for the video file")


class ASLRecognizeResponse(BaseModel):
    """Response from ASL recognition: transcript and optional confidence."""
    transcript: str = Field(..., description="Recognized text from ASL video")
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Confidence score 0-1 if available")
    provider: Optional[str] = Field(None, description="Backend used: stub, wlasl, etc.")
    processing_time_seconds: Optional[float] = Field(None, description="Processing time in seconds")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(..., description="healthy or unhealthy")
    service: str = Field(default="asl-service", description="Service name")
    model_loaded: bool = Field(default=False, description="Whether WLASL/model is loaded (false for stub)")
