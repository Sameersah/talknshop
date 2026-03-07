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
            # Ensure we have a dict (in case response is wrapped)
            if isinstance(response, dict):
                resp = response
            else:
                _dump = getattr(response, "model_dump", None)
                resp = _dump() if callable(_dump) else {}

            # Normalize: media-service may return null for transcript/confidence on failure
            transcript_val = resp.get("transcript")
            transcript_str = transcript_val if isinstance(transcript_val, str) else (str(transcript_val) if transcript_val is not None else "")
            if transcript_str and transcript_str == "None":
                transcript_str = ""
            confidence_val = resp.get("confidence")
            try:
                confidence_float = float(confidence_val) if confidence_val is not None else 0.0
            except (TypeError, ValueError):
                confidence_float = 0.0
            confidence_float = max(0.0, min(1.0, confidence_float))

            transcription = TranscriptionResult(
                transcript=transcript_str,
                confidence=confidence_float,
                language=resp.get("language") or language,
                duration_seconds=resp.get("duration_seconds"),
                segments=resp.get("segments") or []
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
            request_kwargs["timeout"] = (
                timeout if timeout is not None else settings.media_extract_image_timeout
            )
            
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
        file_size: int,
        media_type: str = "image"
    ) -> Dict[str, str]:
        """
        Get pre-signed URL for file upload.
        Calls media-service POST /api/v1/upload and returns upload_url and s3_key.
        
        Args:
            file_name: Name of file to upload
            content_type: MIME type (file_type in media-service)
            file_size: File size in bytes (required by media-service)
            media_type: Type of media (image, audio, video) for logging
            
        Returns:
            dict: upload_url (presigned S3 PUT URL), s3_key (key to reference in messages)
            
        Raises:
            MediaProcessingError: If request fails
        """
        try:
            logger.debug(
                "Requesting upload URL",
                extra={"file_name": file_name, "media_type": media_type, "file_size": file_size}
            )
            
            response = await self.post(
                "/api/v1/upload",
                json={
                    "file_name": file_name,
                    "file_type": content_type,
                    "file_size": file_size,
                }
            )
            
            upload_url = response.get("upload_url")
            metadata = response.get("metadata") or {}
            s3_key = metadata.get("s3_key")
            if not upload_url or not s3_key:
                raise MediaProcessingError(
                    "Invalid response from media service: missing upload_url or metadata.s3_key",
                    details={"response_keys": list(response.keys())}
                )
            
            return {
                "upload_url": upload_url,
                "s3_key": s3_key,
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






