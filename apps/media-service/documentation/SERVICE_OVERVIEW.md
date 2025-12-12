# TalknShop Media Service - End User Guide

## Overview

The **TalknShop Media Service** is an intelligent media analysis API that extracts detailed product characteristics from images and audio files. It combines AWS AI services with local vision-language models to provide comprehensive product information for e-commerce, inventory management, and search applications.

---

## Core Capabilities

### 🖼️ Image Analysis

The service can analyze product images and extract:

**Basic Detection (via AWS Rekognition):**
- Object labels (e.g., "Bottle", "Shoe", "Clothing")
- Text detection (brand names, model numbers, labels)
- Object locations with bounding boxes
- Confidence scores for each detection

**Enhanced Characteristics (via Vision LLM):**
- **Brand/Manufacturer**: Product brand identification
- **Color**: Primary and secondary colors
- **Material**: Material type (plastic, leather, fabric, etc.)
- **Size**: Size indicators or dimensions
- **Style**: Style keywords (casual, formal, sporty, etc.)
- **Condition**: Product condition (new, used, damaged)
- **Features**: Key product features
- **Use Case**: Primary use cases
- **Target Audience**: Target demographic
- **Price Range**: Budget/mid-range/premium classification

### 🎤 Audio Analysis

The service can transcribe and analyze audio files:
- Speech-to-text transcription
- Speaker identification and segmentation
- Language detection
- Audio characteristic extraction from transcripts

---

## Supported Product Types

The service automatically detects and analyzes:

- **Shoes** (sneakers, boots, sandals, etc.)
- **Clothing** (shirts, pants, dresses, jackets, etc.)
- **Bottles** (water bottles, containers, etc.)
- **Electronics** (phones, laptops, accessories, etc.)
- **Furniture** (chairs, tables, sofas, etc.)
- **Bags** (handbags, backpacks, luggage, etc.)
- **Watches** (wristwatches, smartwatches, etc.)
- **Jewelry** (rings, necklaces, bracelets, etc.)
- **Books** (physical books, magazines, etc.)
- **Toys** (action figures, games, etc.)
- **Unknown/Other** (automatically categorized)

---

## API Endpoints

### 1. Extract Product Characteristics (Primary Endpoint)

**Endpoint:** `POST /api/v1/extract-characteristics`

**Purpose:** Extract comprehensive product characteristics from images using both AWS Rekognition and vision LLM.

**Request:**
```json
{
  "image_file": "<base64_encoded_image>",
  "analysis_types": ["labels", "text", "objects"],
  "max_labels": 20,
  "min_confidence": 0.5
}
```

**Response:**
```json
{
  "analysis_id": "uuid",
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
    }
    // ... more characteristics
  ],
  "extraction_method": "ollama_vision_enhanced",
  "confidence_score": 0.85,
  "aws_results": {
    "labels": [...],
    "text_detections": [...],
    "objects": [...]
  }
}
```

### 2. Basic Image Analysis

**Endpoint:** `POST /api/v1/analyze-image`

**Purpose:** Get AWS Rekognition results only (labels, text, objects).

**Request:** Same as above

**Response:** AWS Rekognition results with labels, text detections, and objects.

### 3. Audio Transcription

**Endpoint:** `POST /api/v1/transcribe`

**Purpose:** Transcribe audio files to text.

**Request:**
```json
{
  "audio_file": "<base64_encoded_audio>",
  "language_code": "en-US",
  "speaker_count": 2,
  "vocabulary_name": null
}
```

**Response:**
```json
{
  "status": "completed",
  "transcript": "Full transcribed text...",
  "confidence": 0.95,
  "speakers": [
    {
      "speaker": "spk_0",
      "start_time": 0.0,
      "end_time": 5.2,
      "text": "Speaker 1 text..."
    }
  ],
  "processing_time": 12.5
}
```

### 4. Extract Audio Characteristics

**Endpoint:** `POST /api/v1/extract-audio-characteristics`

**Purpose:** Extract characteristics from audio content after transcription.

**Request:** Same as audio transcription

**Response:** Transcript + extracted characteristics from audio content.

### 5. Batch Processing

**Endpoints:**
- `POST /api/v1/analyze-image/batch` - Batch image analysis
- `POST /api/v1/transcribe/batch` - Batch audio transcription

**Purpose:** Process multiple files in parallel.

### 6. Media Management

- `POST /api/v1/upload` - Upload media files to S3
- `GET /api/v1/media/{media_id}` - Get media metadata
- `DELETE /api/v1/media/{media_id}` - Delete media files
- `GET /api/v1/media/{media_id}/download` - Download media files

### 7. Health Check

**Endpoint:** `GET /health`

**Purpose:** Check service and AWS connectivity status.

---

## How It Works

### Image Analysis Flow

1. **Image Upload**: Client sends base64-encoded image
2. **AWS Analysis**: Service calls AWS Rekognition to detect:
   - Generic labels (Bottle, Shoe, etc.)
   - Text in image (brand names, labels)
   - Object locations (bounding boxes)
3. **Item Type Detection**: Service determines product category from AWS labels
4. **Vision LLM Analysis**: Local vision model analyzes image with custom prompts to extract:
   - Product-specific attributes (brand, color, material, etc.)
   - Detailed characteristics
   - Style and use case information
5. **Combined Results**: Service merges AWS accuracy with LLM intelligence
6. **Response**: Returns structured JSON with all characteristics

### Audio Analysis Flow

1. **Audio Upload**: Client sends base64-encoded audio file
2. **S3 Storage**: Audio file uploaded to AWS S3
3. **Transcription**: AWS Transcribe converts speech to text
4. **Speaker Segmentation**: Identifies different speakers (if multiple)
5. **Characteristic Extraction**: LLM analyzes transcript for characteristics
6. **Response**: Returns transcript + extracted characteristics

---

## Key Features

### ✅ Intelligent Extraction
- Automatically determines product type
- Extracts relevant characteristics based on product category
- Combines multiple AI services for comprehensive analysis

### ✅ Flexible Analysis
- Choose which analysis types to perform (labels, text, objects)
- Adjustable confidence thresholds
- Configurable label limits

### ✅ High Accuracy
- AWS Rekognition for reliable object/text detection
- Vision LLM for detailed product attributes
- Confidence scores for all extractions

### ✅ Batch Processing
- Process multiple files simultaneously
- Background job processing
- Status tracking for batch operations

### ✅ Production Ready
- Error handling and validation
- File size limits (50MB default)
- CORS support
- Health check endpoints

---

## Supported File Formats

**Images:**
- JPEG/JPG
- PNG
- WebP

**Audio:**
- MP3
- WAV
- M4A
- FLAC

**Maximum File Size:** 50MB (configurable)

---

## Example Use Cases

1. **E-commerce Product Listing**
   - Automatically extract product attributes from seller images
   - Generate searchable metadata
   - Categorize products automatically

2. **Inventory Management**
   - Scan product images to extract characteristics
   - Build searchable product database
   - Identify product variants

3. **Search Enhancement**
   - Extract keywords from product images
   - Enable visual search capabilities
   - Improve search relevance

4. **Content Moderation**
   - Detect inappropriate content
   - Verify product descriptions match images
   - Quality control for listings

5. **Marketplace Integration**
   - Standardize product data across platforms
   - Auto-tag products with characteristics
   - Generate product descriptions

---

## Response Structure

### Characteristic Object
```json
{
  "name": "Brand/Manufacturer",
  "value": "Owala",
  "confidence": 0.95,
  "category": "brand"
}
```

### Categories
- `brand` - Brand/Manufacturer name
- `color` - Color information
- `material` - Material type
- `size` - Size information
- `style` - Style keywords
- `condition` - Product condition
- `features` - Key features
- `use_case` - Use case information
- `target` - Target audience
- `price_range` - Price classification

---

## Error Handling

The service returns appropriate HTTP status codes:
- `200` - Success
- `400` - Bad request (invalid file, size exceeded, etc.)
- `404` - Resource not found
- `500` - Internal server error

All errors include descriptive error messages in the response.

---

## Configuration

The service can be configured via environment variables:

- `OLLAMA_MODEL` - Vision model to use (default: `llava:7b`)
- `OLLAMA_HOST` - Ollama server URL (default: `http://localhost:11434`)
- `AWS_REGION` - AWS region (default: `us-west-1`)
- `S3_BUCKET_NAME` - S3 bucket for storage
- `MAX_FILE_SIZE` - Maximum file size in bytes (default: 52428800 = 50MB)
- `LOG_LEVEL` - Logging level (default: `INFO`)

---

## Integration Example

```bash
# Start the service
uvicorn main:app --host 0.0.0.0 --port 8001

# Extract characteristics from an image
curl -X POST "http://localhost:8001/api/v1/extract-characteristics" \
  -H "Content-Type: application/json" \
  -d '{
    "image_file": "<base64_encoded_image>",
    "analysis_types": ["labels", "text", "objects"],
    "max_labels": 20,
    "min_confidence": 0.5
  }'
```

---

## Summary

The **TalknShop Media Service** provides a complete solution for extracting product characteristics from images and audio. It combines the reliability of AWS AI services with the flexibility of vision-language models to deliver detailed, structured product information suitable for e-commerce, search, and inventory management applications.

