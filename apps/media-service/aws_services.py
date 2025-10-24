import boto3
import json
import time
import logging
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
    
    async def generate_presigned_url(self, key: str, expiration: int = 3600) -> str:
        """Generate presigned URL for file upload"""
        try:
            response = self.s3_client.generate_presigned_url(
                'put_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
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


class TranscribeService:
    def __init__(self, region: str = "us-west-1"):
        self.region = region
        self.transcribe_client = boto3.client('transcribe', region_name=region)
        
    async def start_transcription_job(
        self, 
        job_name: str, 
        media_uri: str, 
        language_code: str = "en-US",
        speaker_count: Optional[int] = None,
        vocabulary_name: Optional[str] = None
    ) -> str:
        """Start a transcription job"""
        try:
            job_settings = {
                'ShowSpeakerLabels': speaker_count is not None and speaker_count > 1,
                'MaxSpeakerLabels': speaker_count or 2
            }
            
            if vocabulary_name:
                job_settings['VocabularyName'] = vocabulary_name
            
            response = self.transcribe_client.start_transcription_job(
                TranscriptionJobName=job_name,
                Media={'MediaFileUri': media_uri},
                MediaFormat='mp3',  # Will be determined from file extension
                LanguageCode=language_code,
                Settings=job_settings
            )
            
            return response['TranscriptionJob']['TranscriptionJobName']
        except ClientError as e:
            logger.error(f"Failed to start transcription job: {e}")
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
        
        while time.time() - start_time < timeout:
            job = await self.get_transcription_job(job_name)
            status = job['TranscriptionJobStatus']
            
            if status == 'COMPLETED':
                return job
            elif status == 'FAILED':
                failure_reason = job.get('FailureReason', 'Unknown error')
                raise AWSServiceError(f"Transcription job failed: {failure_reason}")
            
            time.sleep(5)  # Wait 5 seconds before checking again
        
        raise AWSServiceError(f"Transcription job timed out after {timeout} seconds")
    
    async def get_transcription_results(self, transcript_uri: str) -> Dict[str, Any]:
        """Get transcription results from S3"""
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(transcript_uri)
                return response.json()
        except Exception as e:
            logger.error(f"Failed to get transcription results: {e}")
            raise AWSServiceError(f"Failed to get transcription results: {str(e)}")


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
        min_confidence: float = 0.7
    ) -> Dict[str, Any]:
        """Comprehensive image analysis"""
        results = {}
        
        try:
            if 'labels' in analysis_types:
                results['labels'] = await self.detect_labels(image_bytes, max_labels, min_confidence)
            
            if 'text' in analysis_types:
                results['text_detections'] = await self.detect_text(image_bytes)
            
            if 'objects' in analysis_types:
                results['objects'] = await self.detect_objects(image_bytes, min_confidence)
            
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
