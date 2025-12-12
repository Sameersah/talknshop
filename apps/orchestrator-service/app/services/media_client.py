"""
Media service client for audio transcription and image analysis.

Handles communication with the media-service for multimedia processing.
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime

from app.core.config import settings
from app.core.errors import MediaProcessingError
from app.models.schemas import TranscriptionResult, ImageAttributes
from app.services.base_client import BaseServiceClient

logger = logging.getLogger(__name__)


class MediaServiceClient(BaseServiceClient):
    """Client for media processing service."""
    
    def __init__(self, base_url: Optional[str] = None):
        super().__init__(
            base_url=base_url or settings.media_service_url,
            service_name="media-service"
        )
        self.mock_enabled = settings.use_mock_services
    
    async def transcribe_audio(
        self,
        s3_key: str,
        language: str = "en",
        timeout: Optional[float] = None
    ) -> TranscriptionResult:
        """
        Transcribe audio file to text.
        
        Args:
            s3_key: S3 key of audio file
            language: Language code (default: en)
            timeout: Request timeout override
            
        Returns:
            TranscriptionResult: Transcription with confidence score
            
        Raises:
            MediaProcessingError: If transcription fails
        """
        try:
            if self.mock_enabled:
                logger.info("Mock transcription invoked")
                return TranscriptionResult(
                    transcript="This is a mocked transcription of your audio request.",
                    confidence=0.99,
                    language=language,
                    duration_seconds=3.5,
                    segments=[]
                )
            logger.info(
                "Requesting audio transcription",
                extra={"s3_key": s3_key, "language": language}
            )
            
            payload = {
                "s3_key": s3_key,
                "language": language
            }
            
            request_kwargs = {"json": payload}
            if timeout:
                request_kwargs["timeout"] = timeout
            
            response = await self.post(
                "/api/v1/transcribe",
                **request_kwargs
            )
            
            transcription = TranscriptionResult(
                transcript=response["transcript"],
                confidence=response.get("confidence", 1.0),
                language=response.get("language", language),
                duration_seconds=response.get("duration_seconds"),
                segments=response.get("segments", [])
            )
            
            logger.info(
                "Audio transcription completed",
                extra={
                    "s3_key": s3_key,
                    "confidence": transcription.confidence,
                    "transcript_length": len(transcription.transcript)
                }
            )
            
            return transcription
            
        except Exception as e:
            logger.error(
                f"Audio transcription failed: {str(e)}",
                extra={"s3_key": s3_key},
                exc_info=True
            )
            raise MediaProcessingError(
                f"Failed to transcribe audio: {str(e)}",
                details={"s3_key": s3_key}
            ) from e
    
    async def extract_image_attributes(
        self,
        s3_key: str,
        extract_text: bool = True,
        extract_objects: bool = True,
        timeout: Optional[float] = None
    ) -> ImageAttributes:
        """
        Extract attributes from image.
        
        Args:
            s3_key: S3 key of image file
            extract_text: Whether to extract text (OCR)
            extract_objects: Whether to detect objects
            timeout: Request timeout override
            
        Returns:
            ImageAttributes: Extracted image attributes
            
        Raises:
            MediaProcessingError: If extraction fails
        """
        try:
            if self.mock_enabled:
                logger.info("Mock image attribute extraction invoked")
                return ImageAttributes(
                    labels=["mock_label"],
                    objects=[{"name": "mock_object", "confidence": 0.9}],
                    text=["Sample text"],
                    dominant_colors=["blue", "white"],
                    metadata={"mock": True}
                )
            logger.info(
                "Requesting image attribute extraction",
                extra={"s3_key": s3_key}
            )
            
            payload = {
                "s3_key": s3_key,
                "extract_text": extract_text,
                "extract_objects": extract_objects
            }
            
            request_kwargs = {"json": payload}
            if timeout:
                request_kwargs["timeout"] = timeout
            
            response = await self.post(
                "/api/v1/extract-image-attributes",
                **request_kwargs
            )
            
            attributes = ImageAttributes(
                labels=response.get("labels", []),
                objects=response.get("objects", []),
                text=response.get("text", []),
                dominant_colors=response.get("dominant_colors", []),
                metadata=response.get("metadata", {})
            )
            
            logger.info(
                "Image attribute extraction completed",
                extra={
                    "s3_key": s3_key,
                    "labels_count": len(attributes.labels),
                    "objects_count": len(attributes.objects)
                }
            )
            
            return attributes
            
        except Exception as e:
            logger.error(
                f"Image attribute extraction failed: {str(e)}",
                extra={"s3_key": s3_key},
                exc_info=True
            )
            raise MediaProcessingError(
                f"Failed to extract image attributes: {str(e)}",
                details={"s3_key": s3_key}
            ) from e
    
    async def get_upload_url(
        self,
        file_name: str,
        content_type: str,
        media_type: str = "image"
    ) -> Dict[str, str]:
        """
        Get pre-signed URL for file upload.
        
        Args:
            file_name: Name of file to upload
            content_type: MIME type
            media_type: Type of media (image, audio, video)
            
        Returns:
            dict: Upload URL and S3 key
            
        Raises:
            MediaProcessingError: If request fails
        """
        try:
            logger.debug(
                "Requesting upload URL",
                extra={"file_name": file_name, "media_type": media_type}
            )
            
            response = await self.post(
                "/api/v1/upload-url",
                json={
                    "file_name": file_name,
                    "content_type": content_type,
                    "media_type": media_type
                }
            )
            
            return {
                "upload_url": response["upload_url"],
                "s3_key": response["s3_key"]
            }
            
        except Exception as e:
            logger.error(
                f"Failed to get upload URL: {str(e)}",
                extra={"file_name": file_name},
                exc_info=True
            )
            raise MediaProcessingError(
                f"Failed to get upload URL: {str(e)}",
                details={"file_name": file_name}
            ) from e


# Global media client instance
media_client = MediaServiceClient()






