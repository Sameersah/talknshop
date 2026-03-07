import asyncio
import boto3
import json
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from botocore.exceptions import ClientError, BotoCoreError
from models import (
    AudioTranscriptionResponse, 
    ImageAnalysisResponse, 
    ProcessingStatus,
    Label,
    TextDetection,
    Object,
    BoundingBox
)

logger = logging.getLogger(__name__)


class AWSServiceError(Exception):
    """Custom exception for AWS service errors"""
    pass


class S3Service:
    def __init__(self, bucket_name: str, region: str = "us-west-1"):
        self.bucket_name = bucket_name
        self.region = region
        self.s3_client = boto3.client('s3', region_name=region)
        
    async def upload_file(self, file_content: bytes, key: str, content_type: str) -> str:
        """Upload file to S3 and return the S3 URL"""
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=file_content,
                ContentType=content_type
            )
            return f"s3://{self.bucket_name}/{key}"
        except ClientError as e:
            logger.error(f"Failed to upload file to S3: {e}")
            raise AWSServiceError(f"S3 upload failed: {str(e)}")
    
    async def generate_presigned_url(
        self, key: str, expiration: int = 3600, content_type: str | None = None
    ) -> str:
        """Generate presigned URL for file upload. If content_type is set, the client must send the same Content-Type header."""
        try:
            params = {'Bucket': self.bucket_name, 'Key': key}
            if content_type:
                params['ContentType'] = content_type
            response = self.s3_client.generate_presigned_url(
                'put_object',
                Params=params,
                ExpiresIn=expiration
            )
            return response
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise AWSServiceError(f"Presigned URL generation failed: {str(e)}")
    
    async def download_file(self, key: str) -> bytes:
        """Download file from S3"""
        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
            return response['Body'].read()
        except ClientError as e:
            logger.error(f"Failed to download file from S3: {e}")
            raise AWSServiceError(f"S3 download failed: {str(e)}")
    
    async def delete_file(self, key: str) -> bool:
        """Delete file from S3"""
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            logger.error(f"Failed to delete file from S3: {e}")
            raise AWSServiceError(f"S3 delete failed: {str(e)}")
    
    async def file_exists(self, key: str) -> bool:
        """Check if file exists in S3"""
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError:
            return False

    async def delete_objects_older_than_minutes(
        self, prefix: str, minutes: int
    ) -> int:
        """
        List objects under prefix, delete those whose LastModified is older than
        the given number of minutes. Returns the number of objects deleted.
        S3 lifecycle minimum is 1 day; this provides sub-day TTL via scheduled cleanup.
        """
        now_utc = datetime.now(timezone.utc)
        cutoff_ts = now_utc.timestamp() - (minutes * 60)
        deleted = 0
        paginator = self.s3_client.get_paginator("list_objects_v2")
        try:
            for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
                contents = page.get("Contents") or []
                keys_to_delete = []
                for obj in contents:
                    lm = obj.get("LastModified")
                    if not lm:
                        continue
                    # S3 returns UTC; ensure we have a comparable timestamp (naive = assume UTC)
                    lm_ts = lm.timestamp() if lm.tzinfo else (lm.replace(tzinfo=timezone.utc).timestamp())
                    if lm_ts < cutoff_ts:
                        keys_to_delete.append({"Key": obj["Key"]})
                if not keys_to_delete:
                    continue
                # delete_objects accepts up to 1000 keys per request
                for i in range(0, len(keys_to_delete), 1000):
                    batch = keys_to_delete[i : i + 1000]
                    resp = self.s3_client.delete_objects(
                        Bucket=self.bucket_name,
                        Delete={"Objects": batch, "Quiet": True},
                    )
                    errors = resp.get("Errors") or []
                    deleted += len(batch) - len(errors)
                    for err in errors:
                        logger.warning(
                            "S3 cleanup delete failed key=%s code=%s message=%s",
                            err.get("Key"), err.get("Code"), err.get("Message"),
                        )
            if deleted:
                logger.info(
                    "S3 TTL cleanup: prefix=%s older_than_min=%s deleted=%s",
                    prefix, minutes, deleted,
                )
        except ClientError as e:
            logger.error("S3 TTL cleanup list/delete failed: %s", e)
            raise AWSServiceError(f"S3 cleanup failed: {str(e)}")
        return deleted


class TranscribeService:
    def __init__(self, region: str = "us-west-1"):
        self.region = region
        self.transcribe_client = boto3.client('transcribe', region_name=region)
        
    async def start_transcription_job(
        self, 
        job_name: str, 
        media_uri: str, 
        language_code: str = "en-US",
        media_format: str = "mp3",
        speaker_count: Optional[int] = None,
        vocabulary_name: Optional[str] = None
    ) -> str:
        """Start a transcription job. media_format: mp3, webm, wav, flac, m4a, etc."""
        try:
            logger.info(
                "TranscribeService.start_transcription_job: job_name=%s media_uri=%s media_format=%s language_code=%s",
                job_name, media_uri, media_format, language_code,
            )
            # Only include speaker labeling when requested (2+ speakers). AWS rejects
            # ShowSpeakerLabels=false with MaxSpeakerLabels present.
            job_settings: Dict[str, Any] = {}
            if speaker_count is not None and speaker_count > 1:
                job_settings['ShowSpeakerLabels'] = True
                job_settings['MaxSpeakerLabels'] = min(10, max(2, speaker_count))
            if vocabulary_name:
                job_settings['VocabularyName'] = vocabulary_name

            request_kw: Dict[str, Any] = {
                'TranscriptionJobName': job_name,
                'Media': {'MediaFileUri': media_uri},
                'MediaFormat': media_format,
                'LanguageCode': language_code,
            }
            if job_settings:
                request_kw['Settings'] = job_settings

            response = self.transcribe_client.start_transcription_job(**request_kw)
            out_name = response['TranscriptionJob']['TranscriptionJobName']
            status = response['TranscriptionJob'].get('TranscriptionJobStatus', 'UNKNOWN')
            logger.info("TranscribeService.start_transcription_job: started status=%s", status)
            return out_name
        except ClientError as e:
            logger.error("TranscribeService.start_transcription_job failed: %s (media_uri=%s)", e, media_uri)
            raise AWSServiceError(f"Transcription job start failed: {str(e)}")
    
    async def get_transcription_job(self, job_name: str) -> Dict[str, Any]:
        """Get transcription job status and results"""
        try:
            response = self.transcribe_client.get_transcription_job(
                TranscriptionJobName=job_name
            )
            return response['TranscriptionJob']
        except ClientError as e:
            logger.error(f"Failed to get transcription job: {e}")
            raise AWSServiceError(f"Failed to get transcription job: {str(e)}")
    
    async def wait_for_completion(self, job_name: str, timeout: int = 300) -> Dict[str, Any]:
        """Wait for transcription job to complete"""
        start_time = time.time()
        poll_count = 0
        while time.time() - start_time < timeout:
            job = await self.get_transcription_job(job_name)
            status = job['TranscriptionJobStatus']
            poll_count += 1
            logger.debug(
                "TranscribeService.wait_for_completion: job_name=%s poll=%s status=%s",
                job_name, poll_count, status,
            )
            if status == 'COMPLETED':
                logger.info("TranscribeService.wait_for_completion: job_name=%s completed in %s polls", job_name, poll_count)
                return job
            elif status == 'FAILED':
                failure_reason = job.get('FailureReason', 'Unknown error')
                logger.error("TranscribeService.wait_for_completion: job failed job_name=%s reason=%s", job_name, failure_reason)
                raise AWSServiceError(f"Transcription job failed: {failure_reason}")
            
            await asyncio.sleep(5)  # Non-blocking wait before checking again
        
        logger.error("TranscribeService.wait_for_completion: timeout job_name=%s timeout=%s", job_name, timeout)
        raise AWSServiceError(f"Transcription job timed out after {timeout} seconds")
    
    async def get_transcription_results(self, transcript_uri: str) -> Dict[str, Any]:
        """Get transcription results from pre-signed transcript URL (JSON)."""
        try:
            import httpx
            logger.info("TranscribeService.get_transcription_results: fetching uri (first 80 chars)=%s...", (transcript_uri or "")[:80])
            async with httpx.AsyncClient() as client:
                response = await client.get(transcript_uri)
                logger.info(
                    "TranscribeService.get_transcription_results: status=%s content_type=%s",
                    response.status_code, response.headers.get("content-type"),
                )
                if response.status_code != 200:
                    logger.error("TranscribeService.get_transcription_results: non-200 status=%s body=%s", response.status_code, response.text[:500])
                    raise AWSServiceError(f"Transcript fetch failed: HTTP {response.status_code}")
                data = response.json()
                top_keys = list(data.keys()) if isinstance(data, dict) else []
                results = data.get("results", {}) if isinstance(data, dict) else {}
                result_keys = list(results.keys()) if isinstance(results, dict) else []
                logger.info(
                    "TranscribeService.get_transcription_results: top_keys=%s results_keys=%s",
                    top_keys, result_keys,
                )
                return data
        except Exception as e:
            logger.error("TranscribeService.get_transcription_results failed: %s (uri_prefix=%s)", e, (transcript_uri or "")[:60], exc_info=True)
            raise AWSServiceError(f"Failed to get transcription results: {str(e)}")


# Rekognition does not accept a text prompt; we filter labels for "product" context after the fact.
# Labels/parents that describe things users typically buy (apparel, accessories, electronics, etc.)
_PRODUCT_LIKE = frozenset({
    "clothing", "apparel", "shirt", "blouse", "t-shirt", "tee", "hoodie", "sweater", "sweatshirt",
    "jacket", "coat", "pants", "jeans", "shorts", "dress", "skirt", "footwear", "shoes", "sneakers",
    "boot", "sandals", "hat", "cap", "bag", "backpack", "accessory", "accessories", "watch",
    "jewelry", "glasses", "sunglasses", "furniture", "chair", "table", "sofa", "bed",
    "electronics", "phone", "laptop", "computer", "tablet", "camera", "television", "tv",
    "appliance", "book", "toy", "sports equipment", "vehicle", "car", "bicycle", "motorcycle",
    "product", "merchandise", "item", "goods", "knitwear", "fleece", "long sleeve", "sleeve",
    "hood", "outerwear", "top", "bottom", "athletic", "casual", "formal",
})
# Labels we explicitly drop when focusing on purchasable items (people, scene, meta)
_NON_PRODUCT_LIKE = frozenset({
    "person", "people", "human", "face", "head", "adult", "child", "male", "female", "man", "woman",
    "portrait", "photography", "photo", "selfie", "beard", "hair", "skin", "eye", "smile",
    "indoor", "outdoor", "room", "wall", "floor", "sky", "nature", "landscape", "building",
})


def _filter_labels_for_products(labels: List[Label], max_keep: int = 15) -> List[Label]:
    """Keep labels that describe purchasable items; drop person/scene/meta labels."""
    kept = []
    for label in labels:
        name_lower = (getattr(label, "name", None) or "").lower()
        parents_lower = [p.lower() for p in (getattr(label, "parents", None) or [])]
        if name_lower in _NON_PRODUCT_LIKE:
            continue
        if any(p in _NON_PRODUCT_LIKE for p in parents_lower):
            continue
        if name_lower in _PRODUCT_LIKE or any(p in _PRODUCT_LIKE for p in parents_lower):
            kept.append(label)
            if len(kept) >= max_keep:
                break
    # If nothing passed the product filter, return top labels that aren't non-product (so we don't return empty)
    if not kept:
        for label in labels:
            name_lower = (getattr(label, "name", None) or "").lower()
            if name_lower not in _NON_PRODUCT_LIKE:
                kept.append(label)
                if len(kept) >= max_keep:
                    break
    return kept


class RekognitionService:
    def __init__(self, region: str = "us-west-1"):
        self.region = region
        self.rekognition_client = boto3.client('rekognition', region_name=region)
    
    async def detect_labels(self, image_bytes: bytes, max_labels: int = 10, min_confidence: float = 0.7) -> List[Label]:
        """Detect labels in an image"""
        try:
            response = self.rekognition_client.detect_labels(
                Image={'Bytes': image_bytes},
                MaxLabels=max_labels,
                MinConfidence=min_confidence
            )
            
            labels = []
            for label in response['Labels']:
                labels.append(Label(
                    name=label['Name'],
                    confidence=label['Confidence'],
                    parents=[parent['Name'] for parent in label.get('Parents', [])]
                ))
            
            return labels
        except ClientError as e:
            logger.error(f"Failed to detect labels: {e}")
            raise AWSServiceError(f"Label detection failed: {str(e)}")
    
    async def detect_text(self, image_bytes: bytes) -> List[TextDetection]:
        """Detect text in an image"""
        try:
            response = self.rekognition_client.detect_text(
                Image={'Bytes': image_bytes}
            )
            
            text_detections = []
            for detection in response['TextDetections']:
                if detection['Type'] == 'LINE':  # Only process line-level detections
                    bbox = detection.get('Geometry', {}).get('BoundingBox', {})
                    text_detections.append(TextDetection(
                        text=detection['DetectedText'],
                        confidence=detection['Confidence'],
                        bounding_box=BoundingBox(
                            left=bbox.get('Left', 0),
                            top=bbox.get('Top', 0),
                            width=bbox.get('Width', 0),
                            height=bbox.get('Height', 0)
                        ) if bbox else None
                    ))
            
            return text_detections
        except ClientError as e:
            logger.error(f"Failed to detect text: {e}")
            raise AWSServiceError(f"Text detection failed: {str(e)}")
    
    async def detect_objects(self, image_bytes: bytes, min_confidence: float = 0.7) -> List[Object]:
        """Detect objects in an image"""
        try:
            response = self.rekognition_client.detect_labels(
                Image={'Bytes': image_bytes},
                MinConfidence=min_confidence
            )
            
            objects = []
            for label in response['Labels']:
                for instance in label.get('Instances', []):
                    bbox = instance.get('BoundingBox', {})
                    objects.append(Object(
                        name=label['Name'],
                        confidence=instance['Confidence'],
                        bounding_box=BoundingBox(
                            left=bbox.get('Left', 0),
                            top=bbox.get('Top', 0),
                            width=bbox.get('Width', 0),
                            height=bbox.get('Height', 0)
                        )
                    ))
            
            return objects
        except ClientError as e:
            logger.error(f"Failed to detect objects: {e}")
            raise AWSServiceError(f"Object detection failed: {str(e)}")
    
    async def analyze_image(
        self,
        image_bytes: bytes,
        analysis_types: List[str],
        max_labels: int = 10,
        min_confidence: float = 0.7,
        product_context: bool = False,
    ) -> Dict[str, Any]:
        """
        Comprehensive image analysis.
        If product_context=True, requests more labels and filters to those relevant to purchasable items.
        """
        results = {}
        try:
            if "labels" in analysis_types:
                # Request more labels when filtering for products so we have enough after filtering
                req_max = max(max_labels, 25) if product_context else max_labels
                raw_labels = await self.detect_labels(image_bytes, max_labels=req_max, min_confidence=min_confidence)
                if product_context:
                    raw_labels = _filter_labels_for_products(raw_labels, max_keep=max_labels)
                    logger.info(
                        "Rekognition product_context: kept %d labels (filtered for purchasable items)",
                        len(raw_labels),
                    )
                results["labels"] = raw_labels

            if "text" in analysis_types:
                results["text_detections"] = await self.detect_text(image_bytes)

            if "objects" in analysis_types:
                results["objects"] = await self.detect_objects(image_bytes, min_confidence)

            return results
        except Exception as e:
            logger.error(f"Failed to analyze image: {e}")
            raise AWSServiceError(f"Image analysis failed: {str(e)}")


class AWSHealthChecker:
    def __init__(self, region: str = "us-west-1"):
        self.region = region
        self.s3_client = boto3.client('s3', region_name=region)
        self.transcribe_client = boto3.client('transcribe', region_name=region)
        self.rekognition_client = boto3.client('rekognition', region_name=region)
    
    async def check_services(self) -> Dict[str, str]:
        """Check AWS services health"""
        services_status = {}
        
        # Check S3
        try:
            self.s3_client.list_buckets()
            services_status['s3'] = 'healthy'
        except Exception as e:
            services_status['s3'] = f'unhealthy: {str(e)}'
        
        # Check Transcribe
        try:
            self.transcribe_client.list_transcription_jobs(MaxResults=1)
            services_status['transcribe'] = 'healthy'
        except Exception as e:
            services_status['transcribe'] = f'unhealthy: {str(e)}'
        
        # Check Rekognition
        try:
            # Test with a minimal image
            import io
            from PIL import Image
            img = Image.new('RGB', (1, 1), color='white')
            img_bytes = io.BytesIO()
            img.save(img_bytes, format='JPEG')
            img_bytes = img_bytes.getvalue()
            
            self.rekognition_client.detect_labels(Image={'Bytes': img_bytes}, MaxLabels=1)
            services_status['rekognition'] = 'healthy'
        except Exception as e:
            services_status['rekognition'] = f'unhealthy: {str(e)}'
        
        return services_status
