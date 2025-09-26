# Media Service

A specialized FastAPI service responsible for processing multimedia content in the TalknShop application. This service handles audio transcription, image analysis, and media file management using AWS AI/ML services.

## Overview

The media service provides:
- **Audio Transcription**: Convert speech to text using AWS Transcribe
- **Image Analysis**: Extract attributes and objects from images using AWS Rekognition
- **Media Storage**: Manage media files in AWS S3
- **Content Processing**: Handle various media formats and sizes
- **Batch Processing**: Process multiple media files efficiently

## Architecture

```
Media Files → Media Service → AWS Transcribe (Audio)
                          → AWS Rekognition (Images)
                          → AWS S3 (Storage)
                          → Processed Results
```

## API Endpoints

### Health Check
- **GET** `/health` - Service health status
- **Response**: `{"status": "ok"}`

### Core Endpoints (To be implemented)

#### Audio Processing
- **POST** `/api/v1/transcribe` - Transcribe audio files
  - **Input**: Audio file (MP3, WAV, M4A, etc.)
  - **Response**: Transcription text with confidence scores
- **GET** `/api/v1/transcribe/{job_id}` - Get transcription status
- **POST** `/api/v1/transcribe/batch` - Batch audio transcription

#### Image Processing
- **POST** `/api/v1/analyze-image` - Analyze image content
  - **Input**: Image file (JPEG, PNG, etc.)
  - **Response**: Detected objects, text, faces, labels
- **POST** `/api/v1/extract-attributes` - Extract product attributes from images
- **POST** `/api/v1/analyze-image/batch` - Batch image analysis

#### Media Management
- **POST** `/api/v1/upload` - Upload media files to S3
- **GET** `/api/v1/media/{media_id}` - Get media metadata
- **DELETE** `/api/v1/media/{media_id}` - Delete media files
- **GET** `/api/v1/media/{media_id}/download` - Download media files

## Dependencies

- **FastAPI**: Web framework for building APIs
- **Uvicorn**: ASGI server for running the application
- **Pydantic**: Data validation and settings management
- **Boto3**: AWS SDK for Python (Transcribe, Rekognition, S3)
- **Python-dotenv**: Environment variable management
- **Pillow**: Image processing library
- **aiofiles**: Async file operations

## Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# S3 Configuration
S3_BUCKET_NAME=talknshop-media
S3_PREFIX=uploads/

# AWS Services
TRANSCRIBE_LANGUAGE_CODE=en-US
REKOGNITION_MAX_LABELS=10
REKOGNITION_MIN_CONFIDENCE=0.7

# Service URLs
ORCHESTRATOR_SERVICE_URL=http://orchestrator-service:8000

# Application
LOG_LEVEL=INFO
DEBUG=false
MAX_FILE_SIZE=50MB
ALLOWED_AUDIO_FORMATS=mp3,wav,m4a,flac
ALLOWED_IMAGE_FORMATS=jpg,jpeg,png,webp
```

## Local Development

### Prerequisites
- Python 3.11+
- Docker and Docker Compose
- AWS CLI configured
- AWS S3 bucket for media storage
- AWS Transcribe and Rekognition access

### Setup

1. **Create virtual environment**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your AWS configuration
   ```

4. **Run the service**:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8001
   ```

### Using Docker

```bash
# Build the image
docker build -t talknshop-media .

# Run the container
docker run -p 8001:8001 --env-file .env talknshop-media
```

### Using Docker Compose (Recommended)

From the monorepo root:
```bash
docker-compose up media-service
```

## AWS Services Integration

### AWS Transcribe
- **Purpose**: Convert speech to text
- **Supported Formats**: MP3, WAV, M4A, FLAC, OGG
- **Features**: Speaker identification, custom vocabulary, language detection
- **Limits**: 2GB per file, 4 hours max duration

### AWS Rekognition
- **Purpose**: Analyze images and extract information
- **Features**: 
  - Object detection and labeling
  - Text detection (OCR)
  - Face analysis
  - Celebrity recognition
  - Content moderation
- **Limits**: 15MB per image, 5MB for text detection

### AWS S3
- **Purpose**: Store media files and processed results
- **Features**: 
  - Secure file storage
  - Pre-signed URLs for direct uploads
  - Lifecycle policies
  - Cross-region replication

## Data Models

### Audio Transcription Request
```json
{
  "audio_file": "base64_encoded_audio",
  "language_code": "en-US",
  "speaker_count": 2,
  "vocabulary_name": "custom_vocab",
  "output_format": "json"
}
```

### Audio Transcription Response
```json
{
  "transcription_id": "uuid",
  "status": "completed",
  "transcript": "Hello, I'm looking for a 27 inch monitor",
  "confidence": 0.95,
  "speakers": [
    {
      "speaker": "spk_0",
      "start_time": 0.0,
      "end_time": 2.5,
      "text": "Hello, I'm looking for"
    }
  ],
  "processing_time": 15.2
}
```

### Image Analysis Request
```json
{
  "image_file": "base64_encoded_image",
  "analysis_types": ["labels", "text", "objects"],
  "max_labels": 10,
  "min_confidence": 0.7
}
```

### Image Analysis Response
```json
{
  "analysis_id": "uuid",
  "status": "completed",
  "labels": [
    {
      "name": "Monitor",
      "confidence": 0.95,
      "parents": ["Electronics", "Computer"]
    }
  ],
  "text_detections": [
    {
      "text": "27 inch",
      "confidence": 0.98,
      "bounding_box": {...}
    }
  ],
  "objects": [
    {
      "name": "Monitor",
      "confidence": 0.92,
      "bounding_box": {...}
    }
  ],
  "processing_time": 3.1
}
```

## File Processing Pipeline

### Audio Processing
1. **Upload**: Receive audio file via API
2. **Validation**: Check format, size, duration
3. **Storage**: Upload to S3 with unique key
4. **Transcription**: Submit to AWS Transcribe
5. **Polling**: Monitor job status
6. **Results**: Retrieve and format transcription
7. **Cleanup**: Remove temporary files

### Image Processing
1. **Upload**: Receive image file via API
2. **Validation**: Check format, size, dimensions
3. **Storage**: Upload to S3 with unique key
4. **Analysis**: Submit to AWS Rekognition
5. **Processing**: Extract labels, text, objects
6. **Results**: Format and return analysis
7. **Cleanup**: Remove temporary files

## Error Handling

### Common Error Scenarios
- **Invalid File Format**: Unsupported audio/image formats
- **File Size Exceeded**: Files too large for processing
- **AWS Service Errors**: Transcribe/Rekognition failures
- **Storage Errors**: S3 upload/download failures
- **Timeout Errors**: Long-running processing jobs

### Error Response Format
```json
{
  "error": {
    "code": "INVALID_FILE_FORMAT",
    "message": "Unsupported audio format. Supported formats: mp3, wav, m4a",
    "details": {
      "received_format": "avi",
      "supported_formats": ["mp3", "wav", "m4a", "flac"]
    }
  }
}
```

## Performance Optimization

### Caching Strategy
- **Transcription Cache**: Store completed transcriptions
- **Analysis Cache**: Cache image analysis results
- **Metadata Cache**: Cache file metadata

### Batch Processing
- **Audio Batch**: Process multiple audio files
- **Image Batch**: Analyze multiple images
- **Async Processing**: Non-blocking operations

### Resource Management
- **Connection Pooling**: Reuse AWS connections
- **Memory Management**: Efficient file handling
- **Cleanup**: Automatic temporary file cleanup

## Monitoring and Logging

### Metrics
- **Processing Time**: Audio/image processing duration
- **Success Rate**: Successful vs failed operations
- **File Sizes**: Average file sizes processed
- **AWS Costs**: Transcribe/Rekognition usage costs

### Logging
- **Structured Logs**: JSON-formatted logs
- **Request Tracking**: Unique request IDs
- **Error Logging**: Detailed error information
- **Performance Logs**: Processing time metrics

## Testing

### Unit Tests
```bash
pytest tests/unit/
```

### Integration Tests
```bash
pytest tests/integration/
```

### Load Testing
```bash
# Test with large files
pytest tests/load/
```

### AWS Service Mocking
```python
# Mock AWS services for testing
from moto import mock_s3, mock_transcribe, mock_rekognition
```

## Deployment

### AWS Deployment
1. **Build and push to ECR**:
   ```bash
   aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-west-2.amazonaws.com
   docker build -t talknshop-media .
   docker tag talknshop-media:latest <account>.dkr.ecr.us-west-2.amazonaws.com/talknshop-media:latest
   docker push <account>.dkr.ecr.us-west-2.amazonaws.com/talknshop-media:latest
   ```

2. **Deploy using CDK**:
   ```bash
   cd ../../infrastructure/cdk
   cdk deploy TalknShop-Media
   ```

### Environment-Specific Configuration

- **Development**: Local S3, mock AWS services
- **Staging**: AWS services with limited quotas
- **Production**: Full AWS services, enhanced monitoring

## Security Considerations

### File Security
- **Virus Scanning**: Scan uploaded files
- **Content Validation**: Validate file contents
- **Access Control**: Secure S3 bucket policies
- **Encryption**: Encrypt files at rest and in transit

### API Security
- **Authentication**: JWT token validation
- **Rate Limiting**: Prevent abuse
- **Input Validation**: Strict file format validation
- **CORS**: Configure cross-origin requests

## API Documentation

Once the service is running, visit:
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass before submitting PR
5. Test with various file formats and sizes

## Troubleshooting

### Common Issues

1. **AWS Credentials Issues**:
   - Verify AWS credentials configuration
   - Check IAM permissions for Transcribe/Rekognition/S3
   - Ensure correct AWS region

2. **File Upload Issues**:
   - Check file size limits
   - Verify supported formats
   - Review S3 bucket permissions

3. **Processing Failures**:
   - Check AWS service quotas
   - Review error logs
   - Verify file integrity

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=DEBUG
export DEBUG=true
```

## License

This project is part of the TalknShop application.
