TalkNShop

Media Service
Design Specification
Version 0.1

Puneet Bajaj
(puneet.bajaj@sjsu.edu)


Version History
Introduction
References
Requirements
Functional Overview
Configuration/ External Interfaces
Debug
Logging
Counters
Implementation
Testing
General Approach
Unit Tests
Integration Tests
Functional Tests
Appendix


Version History
Version

Changes

0.1

Design details of Media service and current implementation status


Introduction
This document details the design specification for the Media Service, a key backend component of the TalkNShop platform. This service is responsible for processing multimedia content (images and audio) using AWS AI/ML services combined with local vision-language models. It plays a critical role in enabling multimodal input processing for the orchestrator service, extracting detailed product characteristics from images and transcribing audio content. The media service is accessed by the Orchestrator Service through both REST API endpoints and an MCP (Model Context Protocol) server, which provides a standardized interface for the orchestrator to invoke media processing functions as tools. This dual-access pattern allows flexible integration - direct REST calls for explicit media processing needs, and MCP tools for AI-driven tool selection within orchestration workflows.

References
AWS Transcribe documentation for speech-to-text conversion
AWS Rekognition documentation for image analysis
AWS S3 documentation for media file storage
Ollama documentation for local LLM inference
Model Context Protocol (MCP) specification for tool-based AI integration
TalkNShop System Architecture (AWS API Gateway, ALB, Orchestrator-Service integration)
FastAPI documentation for async web framework


Architecture Diagram

System architecture. I own the media service workflow for multimodal input processing.


Requirements
Functional Requirements
●
●
●
●
●
●
●
●
●
●
●

Accept base64-encoded media files (images/audio) from orchestrator or client
Process audio files using AWS Transcribe for speech-to-text conversion
Analyze images using AWS Rekognition for labels, text, and object detection
Extract enhanced product characteristics from images using vision-language model (Ollama LLaVA)
Determine product type automatically from image analysis (shoe, clothing, bottle, electronics, etc.)
Return structured analysis results with confidence scores and metadata
Support batch processing for multiple media files
Generate presigned S3 URLs for direct media uploads
Extract characteristics from audio transcripts using LLM analysis
Provide health check endpoint for service monitoring
Return raw AWS results alongside enhanced characteristics for comparison

Non-Functional Requirements
●
●
●
●
●
●
●

Response time P95 < 6s for image characteristic extraction (AWS Rekognition ~1-2s, LLM ~4-6s)
Response time P95 < 15s for audio transcription (AWS Transcribe async processing)
Graceful fallback when Ollama LLM unavailable (AWS-only extraction with logging)
Secure credential management via environment variables/.env
File size validation (max 50MB) and format validation (JPEG/PNG/WebP for images, MP3/WAV/M4A/FLAC for audio)
Structured logging with request correlation IDs
Future: Result caching, rate limiting, automated health checks


Functional Overview
MCP Integration
The Media MCP Server acts as an adapter layer between the Orchestrator Service and the Media Service:
- Purpose: Allows the orchestrator to invoke media processing functions as MCP tools
- Implementation: MCP server exposes media analysis functions that the orchestrator can call
- Benefits:
- Standardized interface for orchestrator-to-media communication
- Tool-based invocation model (extract_image_characteristics, transcribe_audio, etc.)
- Easier integration with orchestrator's tool selection logic
- Seamless multimodal input processing within orchestration workflows

MCP Tools Exposed (Completed):
- extract_image_characteristics - Extract product characteristics from images using vision LLM
- analyze_image - Basic image analysis using AWS Rekognition (labels, text, objects)
- transcribe_audio - Convert audio to text using AWS Transcribe
- extract_audio_characteristics - Extract characteristics from audio transcripts
- upload_media - Generate presigned S3 URLs for media uploads

Media Service API
The Media Service acts as a specialized processing layer for multimodal content:
- Purpose: Process images and audio to extract structured information for product search
- Implementation: FastAPI-based microservice with async endpoints for media processing
- Benefits:
- Centralized media processing logic
- Integration with AWS AI/ML services
- Enhanced characteristic extraction using vision-language models
- Structured responses for downstream services
- MCP server integration for orchestrator tool invocation

FastAPI-based microservice exposing:
● GET /health – Health probe for orchestrator and load balancer
● POST /api/v1/transcribe – Audio transcription endpoint accepting base64 audio
● POST /api/v1/analyze-image – Basic image analysis using AWS Rekognition
● POST /api/v1/extract-characteristics – Enhanced characteristic extraction with vision LLM
● POST /api/v1/extract-audio-characteristics – Characteristic extraction from audio transcripts
● POST /api/v1/upload – Generate presigned S3 URLs for media uploads
● POST /api/v1/analyze-image/batch – Batch image analysis
● POST /api/v1/transcribe/batch – Batch audio transcription

Internal flow:
1. Request received via REST API or MCP tool invocation
2. Validate incoming media file (format, size, encoding)
3. For image requests:
   a. Decode base64 image to bytes
   b. Call AWS Rekognition to detect labels, text, and objects
   c. Determine product type from detected labels
   d. If Ollama available: Pass image to vision LLM for enhanced characteristic extraction
   e. Parse LLM response to extract structured characteristics (brand, color, material, style, etc.)
   f. Return combined results (AWS analysis + LLM enhancements)
4. For audio requests:
   a. Decode base64 audio to bytes
   b. Upload to S3 for processing
   c. Start AWS Transcribe job with language code and speaker count
   d. Poll job status until completion
   e. Retrieve transcription results with confidence scores
   f. If Ollama available: Extract characteristics from transcript using LLM
   g. Return transcript + extracted characteristics

MCP Integration flow:
1. Orchestrator detects multimodal input (image/audio) from user
2. Orchestrator selects appropriate MCP tool (extract_image_characteristics, transcribe_audio, etc.)
3. MCP server receives tool invocation with media file and parameters
4. MCP server wraps REST endpoint call to media service
5. Media service processes request as described above
6. MCP server formats response according to MCP tool schema
7. Orchestrator receives structured response and integrates into reasoning pipeline


Configuration/ External Interfaces
Environment Variables (config.env)
●
●
●
●
●
●
●
●
●

AWS_REGION=us-west-1
AWS_ACCESS_KEY_ID=<AWS access key>
AWS_SECRET_ACCESS_KEY=<AWS secret key>
S3_BUCKET_NAME=talknshop-media-storage
OLLAMA_MODEL=llava:7b
OLLAMA_HOST=http://localhost:11434
MAX_FILE_SIZE=52428800  # 50MB
ALLOWED_AUDIO_FORMATS=mp3,wav,m4a,flac
ALLOWED_IMAGE_FORMATS=jpg,jpeg,png,webp
DEBUG=false
LOG_LEVEL=INFO

External APIs
● AWS Transcribe
   ○ StartTranscriptionJob
   ○ GetTranscriptionJob
   ○ Retrieve transcription results from S3
● AWS Rekognition
   ○ detect_labels (object detection with confidence scores)
   ○ detect_text (OCR text extraction)
   ○ detect_objects (object localization with bounding boxes)
● AWS S3
   ○ put_object (media file upload)
   ○ generate_presigned_url (direct client upload)
   ○ get_object (download media files)
   ○ delete_object (cleanup)
● Ollama API (Local)
   ○ POST /api/chat (vision model inference with image base64)
   ○ GET /api/tags (list available models)
● MCP Server (Media Service)
   ○ Exposes tools: extract_image_characteristics, analyze_image, transcribe_audio, extract_audio_characteristics, upload_media
   ○ Tool invocation protocol for orchestrator integration
   ○ Standardized response format for orchestration pipeline

Internal Interfaces
● Orchestrator → Media (via MCP): Tool invocations for media processing functions
● Orchestrator → Media (direct REST): POST /api/v1/extract-characteristics with ImageAnalysisRequest
● Orchestrator → Media (direct REST): POST /api/v1/transcribe with AudioTranscriptionRequest
● Media → Orchestrator/UI: ExtractedCharacteristics (item_type, primary_item, characteristics array)
● Media → Orchestrator/UI: AudioTranscriptionResponse (transcript, confidence, speakers)

MCP Server Interface
● MCP Server exposes media processing tools to orchestrator
● Tools wrap REST endpoints and provide structured tool schemas
● Orchestrator selects appropriate tools based on user input (image/audio detection)
● Response format standardized for orchestrator's reasoning pipeline


Debug
Debug endpoints (Planned)
● GET /api/v1/debug/rekognition – Raw AWS Rekognition payloads for given image
● GET /api/v1/debug/ollama – Raw Ollama LLM responses for given image
● GET /api/v1/debug/transcribe – Raw AWS Transcribe job details

Logging
● INFO: Media file received, AWS service call start/end, extraction method used, confidence scores
● ERROR: AWS service failures with details (status code, message), LLM parsing errors, file validation failures
● DEBUG: Raw LLM responses, parsing steps, item type detection logic (when DEBUG=true)
● Planned: include request correlation IDs and structured JSON logs

Sample logs:
​
INFO: Starting image analysis for item type: bottle
INFO: AWS Rekognition completed: 15 labels, 2 text detections, 1 object detected
INFO: Ollama vision extraction completed: 10 characteristics extracted
ERROR: Ollama connection failed: Connection refused - falling back to AWS-only extraction
ERROR: AWS Rekognition failed: InvalidImageFormatException


Counters
●
●
●
●
●
●

Images processed per analysis type (labels/text/objects)
Audio transcription jobs started vs completed
Characteristic extraction attempts (LLM vs AWS-only)
Ollama LLM availability status
AWS service latency per provider (Rekognition, Transcribe)
File validation failures (size, format)


Implementation
Design Notes
●
●
●
●
●
●
●

FastAPI with async endpoints, uvicorn for dev server
boto3 for AWS service integration (Rekognition, Transcribe, S3)
Ollama Python client for local LLM inference
CharacteristicExtractor handles vision LLM extraction + parsing
AudioCharacteristicExtractor handles transcript analysis
Unified data models (models.py):
   ○ ImageAnalysisRequest/Response (Pydantic models)
   ○ AudioTranscriptionRequest/Response
   ○ Characteristic dataclass (name, value, confidence, category)
   ○ ExtractedCharacteristics (item_type, primary_item, characteristics list)
   ○ ItemType enum (shoe, clothing, bottle, electronics, furniture, bag, watch, jewelry, book, toy, unknown)
● AWS service wrappers (aws_services.py):
   ○ RekognitionService: detect_labels(), detect_text(), detect_objects(), analyze_image()
   ○ TranscribeService: start_transcription_job(), wait_for_completion(), get_transcription_results()
   ○ S3Service: upload_file(), generate_presigned_url(), download_file(), delete_file()
● Vision LLM integration:
   ○ Uses LLaVA 7B model for image understanding
   ○ Structured prompt engineering for keyword-based extraction
   ○ Response parsing from numbered list format to Characteristic objects
   ○ Fallback to AWS-only extraction if LLM unavailable
● Item type detection from AWS labels using keyword matching
● Error handling with AWSServiceError exceptions and graceful degradation
● MCP server integration:
   ○ Exposes media processing functions as MCP tools
   ○ Wraps REST endpoints with standardized tool schemas
   ○ Enables orchestrator's AI agent to select appropriate media tools
   ○ Returns structured responses compatible with orchestration pipeline
   ○ Tool selection based on input type detection (image vs audio)


Subtasks
●
●
●
●
●
●
●
●
●
●

AWS Rekognition Service Client (Completed)
AWS Transcribe Service Client (Completed)
AWS S3 Service Client (Completed)
Characteristic Extractor with Ollama Integration (Completed)
Item Type Detection Logic (Completed)
Vision LLM Response Parsing (Completed)
Image Characteristic Extraction Endpoint (Completed)
Audio Transcription Endpoint (Completed)
Audio Characteristic Extraction Endpoint (Completed)
Batch Processing Endpoints (Completed)
Health Check Endpoint (Completed)
Presigned S3 URL Generation (Completed)
MCP Server Integration (Completed)
MCP Tools Implementation (Completed)
Debug endpoints (Planned in Sprint 10)
Result caching layer (Planned in Sprint 10)
Rate limiting and retry wrappers (Planned in Sprint 10)


Testing
General Approach
●
●
●
●
●

Manual curl/Postman tests hitting /api/v1/extract-characteristics with real product images
Manual tests via /api/v1/transcribe with audio files
Verification of schema compliance, error handling, multimodal processing
End-to-end testing with orchestrator service integration
Controlled failures: invalid API keys, network timeouts, Ollama unavailability, oversized files

Unit Tests (Planned)
●
●
●
●

Item type detection logic with various label combinations
Vision LLM response parsing with structured/natural language formats
Characteristic extraction (LLM vs AWS-only fallback)
Error scenarios: missing Ollama, invalid image format, AWS service failures

Integration Tests (Planned)
●
●
●
●
●
●

End-to-end image analysis via /api/v1/extract-characteristics with real images
End-to-end audio transcription via /api/v1/transcribe with real audio files
Ollama connection and fallback behavior testing
AWS service integration validation (Rekognition, Transcribe, S3)
Batch processing with multiple files
MCP server tool invocation from orchestrator agent (extract_image_characteristics, transcribe_audio)
MCP tool schema validation and response format verification

Functional Tests
● Input: Image of Owala water bottle (JPEG, base64 encoded)
   ○ Check result contains item_type: "bottle"
   ○ Validate characteristics include brand, color, material
   ○ Validate extraction_method indicates "ollama_vision_enhanced" or "aws_only"
   ○ Check confidence scores are within 0-1 range
   ○ Verify AWS results are included in response
● Input: Image of Adidas shoes (JPEG, base64 encoded)
   ○ Check result contains item_type: "shoe"
   ○ Validate characteristics include brand: "Adidas", style, condition
   ○ Check primary_item detection
● Input: Audio file saying "I want a red running shoe under 100 dollars"
   ○ Expect transcript matching the spoken text
   ○ Validate characteristics extracted from transcript
   ○ Check confidence score > 0.8
● Input: Invalid file format (AVI video)
   ○ Expect 400 error with clear message about supported formats
● Input: File exceeding 50MB limit
   ○ Expect 400 error with file size limit message


Appendix
Sample Response - Image Characteristic Extraction:
{
  "analysis_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "item_type": "bottle",
  "primary_item": "Water Bottle",
  "characteristics": [
    {
      "name": "Brand/Manufacturer",
      "value": "Owala",
      "confidence": 0.95,
      "category": "brand"
    },
    {
      "name": "Color",
      "value": "Blue, Orange",
      "confidence": 0.90,
      "category": "color"
    },
    {
      "name": "Material",
      "value": "Plastic",
      "confidence": 0.85,
      "category": "material"
    },
    {
      "name": "Style",
      "value": "Insulated, Travel",
      "confidence": 0.80,
      "category": "style"
    },
    {
      "name": "Features",
      "value": "Leakproof lid, Insulation",
      "confidence": 0.85,
      "category": "features"
    },
    {
      "name": "Use Case",
      "value": "Travel, Workout",
      "confidence": 0.80,
      "category": "use_case"
    },
    {
      "name": "Target",
      "value": "Health-conscious consumers",
      "confidence": 0.75,
      "category": "target"
    },
    {
      "name": "Price Range",
      "value": "Mid-range",
      "confidence": 0.70,
      "category": "price_range"
    }
  ],
  "extraction_method": "ollama_vision_enhanced",
  "confidence_score": 0.85,
  "aws_results": {
    "labels": [
      {
        "name": "Bottle",
        "confidence": 100.0,
        "parents": []
      },
      {
        "name": "Water Bottle",
        "confidence": 99.8775634765625,
        "parents": ["Bottle"]
      },
      {
        "name": "Shaker",
        "confidence": 97.27078247070312,
        "parents": ["Bottle"]
      }
    ],
    "text_detections": [
      {
        "text": "owala",
        "confidence": 90.63531494140625,
        "bounding_box": {
          "left": 0.4140625,
          "top": 0.2265625,
          "width": 0.0869140625,
          "height": 0.0263671875
        }
      }
    ],
    "objects": [
      {
        "name": "Shaker",
        "confidence": 97.27078247070312,
        "bounding_box": {
          "left": 0.37248289585113525,
          "top": 0.055694159120321274,
          "width": 0.26166456937789917,
          "height": 0.8676441311836243
        }
      }
    ]
  },
  "processing_time": 6.234
}

Sample Response - Audio Transcription:
{
  "transcription_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "completed",
  "transcript": "I want a red running shoe under 100 dollars",
  "confidence": 0.95,
  "speakers": [
    {
      "speaker": "spk_0",
      "start_time": 0.0,
      "end_time": 3.2,
      "text": "I want a red running shoe under 100 dollars"
    }
  ],
  "processing_time": 12.5
}

API Request/Response Schema Example
ImageAnalysisRequest:
{
  "image_file": "<base64_encoded_image>",
  "analysis_types": ["labels", "text", "objects"],
  "max_labels": 20,
  "min_confidence": 0.5
}

AudioTranscriptionRequest:
{
  "audio_file": "<base64_encoded_audio>",
  "language_code": "en-US",
  "speaker_count": 2,
  "vocabulary_name": null
}

Characteristic Data Structure:
{
  "name": "Brand/Manufacturer",
  "value": "Owala",
  "confidence": 0.95,
  "category": "brand"
}

Categories:
- brand: Brand/Manufacturer name
- color: Color information (primary, secondary)
- material: Material type (plastic, leather, fabric, etc.)
- size: Size indicators or dimensions
- style: Style keywords (casual, formal, sporty, etc.)
- condition: Product condition (new, used, damaged)
- features: Key product features
- use_case: Primary use cases
- target: Target audience
- price_range: Price classification (budget/mid-range/premium)

MCP Tool Schema Examples
{
  "name": "extract_image_characteristics",
  "description": "Extract detailed product characteristics from images using vision-language model. Returns item type, primary item, and structured characteristics with confidence scores.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "image_file": {
        "type": "string",
        "description": "Base64 encoded image file"
      },
      "analysis_types": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Types of analysis to perform: labels, text, objects",
        "default": ["labels", "text", "objects"]
      },
      "max_labels": {
        "type": "integer",
        "description": "Maximum number of labels to return",
        "default": 20
      },
      "min_confidence": {
        "type": "number",
        "description": "Minimum confidence threshold (0.0-1.0)",
        "default": 0.5
      }
    },
    "required": ["image_file"]
  }
}

{
  "name": "transcribe_audio",
  "description": "Transcribe audio file to text using AWS Transcribe. Supports speaker identification and custom vocabulary.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "audio_file": {
        "type": "string",
        "description": "Base64 encoded audio file"
      },
      "language_code": {
        "type": "string",
        "description": "Language code for transcription",
        "default": "en-US"
      },
      "speaker_count": {
        "type": "integer",
        "description": "Number of speakers (optional, enables speaker identification)"
      },
      "vocabulary_name": {
        "type": "string",
        "description": "Custom vocabulary name (optional)"
      }
    },
    "required": ["audio_file"]
  }
}

{
  "name": "analyze_image",
  "description": "Basic image analysis using AWS Rekognition. Detects labels, text, and objects with bounding boxes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "image_file": {
        "type": "string",
        "description": "Base64 encoded image file"
      },
      "analysis_types": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Types of analysis: labels, text, objects",
        "default": ["labels", "text", "objects"]
      },
      "max_labels": {
        "type": "integer",
        "description": "Maximum number of labels to return",
        "default": 10
      },
      "min_confidence": {
        "type": "number",
        "description": "Minimum confidence threshold",
        "default": 0.7
      }
    },
    "required": ["image_file"]
  }
}

{
  "name": "extract_audio_characteristics",
  "description": "Extract product characteristics from audio transcript using LLM analysis. Requires audio transcription first.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "audio_file": {
        "type": "string",
        "description": "Base64 encoded audio file"
      },
      "language_code": {
        "type": "string",
        "description": "Language code for transcription",
        "default": "en-US"
      },
      "speaker_count": {
        "type": "integer",
        "description": "Number of speakers"
      }
    },
    "required": ["audio_file"]
  }
}


