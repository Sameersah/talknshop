# Seller Crosspost Service

An asynchronous job processing service for posting product listings to multiple marketplaces simultaneously. Part of the TalknShop seller flow.

## 🎯 Overview

The seller-crosspost-service handles the **asynchronous posting** of product listings across multiple e-commerce platforms. It receives listing requests from the orchestrator, creates background jobs via SQS, and processes them through dedicated workers.

### Key Features
- ✅ **Asynchronous Processing**: Non-blocking job submission
- ✅ **Multi-Marketplace Support**: eBay, Craigslist, Facebook, Poshmark
- ✅ **SQS-Based Queue**: Scalable job processing
- ✅ **Retry Logic**: Automatic retry with exponential backoff
- ✅ **Partial Success**: Handle mixed marketplace results
- ✅ **Job Tracking**: Real-time status updates
- ✅ **Rate Limiting**: Respect marketplace API limits

---

## 🏗️ Architecture

```
Orchestrator Service
        ↓
  POST /api/v1/post
        ↓
┌───────────────────────────┐
│ Seller Crosspost Service  │
│  - Validate listing       │
│  - Create SQS jobs        │
│  - Return job_id (202)    │
└───────────┬───────────────┘
            │
     ┌──────┴──────┐
     │  Amazon SQS  │
     │  - ebay-queue      │
     │  - craigslist-queue│
     │  - facebook-queue  │
     └──────┬──────┘
            │
   ┌────────↓─────────┐
   │   SQS Workers    │
   │  (ECS Fargate)   │
   └────────┬─────────┘
            │
  ┌─────────↓──────────────┐
  │ Marketplace Adapters   │
  │  - Transform payload   │
  │  - Call marketplace API│
  │  - Capture confirmation│
  └────────┬───────────────┘
           │
  ┌────────↓─────────────────┐
  │ External Marketplaces    │
  │  - eBay API (8-12s)      │
  │  - Craigslist API (5-10s)│
  │  - Facebook API (6-9s)   │
  └──────────────────────────┘
           │
  ┌────────↓─────────────┐
  │ DynamoDB Job Status  │
  │  - job_id            │
  │  - status per MP     │
  │  - confirmation_links│
  └──────────────────────┘
           │
  ┌────────↓─────────────┐
  │ Notify Client        │
  │  - WebSocket push    │
  │  - APNs notification │
  └──────────────────────┘
```

---

## 📁 Project Structure

```
seller-crosspost-service/
├── adapters/                   # Marketplace posting adapters
│   ├── __init__.py
│   ├── base_adapter.py        # Base adapter interface
│   ├── ebay_adapter.py        # eBay posting logic
│   ├── craigslist_adapter.py  # Craigslist posting logic
│   ├── facebook_adapter.py    # Facebook posting logic
│   └── poshmark_adapter.py    # Poshmark posting logic
│
├── workers/                    # SQS job processors
│   ├── __init__.py
│   ├── crosspost_worker.py    # Main worker logic
│   └── sqs_consumer.py        # SQS message consumer
│
├── validators/                 # Listing validation
│   ├── __init__.py
│   ├── listing_validator.py   # Generic validation
│   └── marketplace_validator.py # MP-specific validation
│
├── job_tracker/                # Job status management
│   ├── __init__.py
│   ├── dynamodb_tracker.py    # DynamoDB operations
│   └── status_manager.py      # Status update logic
│
├── models/                     # Data models
│   ├── __init__.py
│   ├── listing.py             # ListingSpec model
│   └── job.py                 # Job status models
│
├── main.py                     # FastAPI application
├── worker_main.py              # Worker entry point
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Container image
├── Dockerfile.worker           # Worker container image
├── env.example                 # Environment variables template
└── README.md                   # This file
```

---

## 🚀 API Endpoints

### Health Check
**GET** `/health`

Response:
```json
{
  "status": "healthy",
  "service": "seller-crosspost-service",
  "workers": "active"
}
```

---

### Post Listing
**POST** `/api/v1/post`

Create a new multi-marketplace listing job.

**Request Body**:
```json
{
  "listing_spec": {
    "title": "iPhone 13, 128GB, Blue, Good Condition",
    "description": "Gently used iPhone 13 in excellent working condition...",
    "price": 650.00,
    "currency": "USD",
    "condition": "good",
    "category": "Electronics > Smartphones",
    "attributes": {
      "brand": "Apple",
      "model": "iPhone 13",
      "storage": "128GB",
      "color": "Blue"
    },
    "media_s3_keys": [
      "s3://talknshop-media/user123/img1.jpg",
      "s3://talknshop-media/user123/img2.jpg"
    ],
    "target_marketplaces": ["ebay", "craigslist", "facebook"],
    "shipping_options": ["local_pickup", "shipping"],
    "location": {
      "city": "San Jose",
      "state": "CA",
      "zip": "95112"
    }
  },
  "user_id": "user_123",
  "session_id": "session_abc"
}
```

**Response** (202 Accepted):
```json
{
  "job_id": "job_abc123def",
  "status": "processing",
  "created_at": "2025-10-24T18:00:00Z",
  "marketplace_jobs": [
    {
      "marketplace": "ebay",
      "job_id": "ebay_xyz123",
      "status": "queued"
    },
    {
      "marketplace": "craigslist",
      "job_id": "cl_xyz456",
      "status": "queued"
    },
    {
      "marketplace": "facebook",
      "job_id": "fb_xyz789",
      "status": "queued"
    }
  ],
  "estimated_completion": "2-5 minutes"
}
```

---

### Get Job Status
**GET** `/api/v1/jobs/{job_id}`

Check the status of a posting job.

**Response**:
```json
{
  "job_id": "job_abc123def",
  "status": "completed",
  "created_at": "2025-10-24T18:00:00Z",
  "completed_at": "2025-10-24T18:02:30Z",
  "marketplace_results": [
    {
      "marketplace": "ebay",
      "status": "live",
      "listing_id": "123456789",
      "confirmation_link": "https://ebay.com/itm/123456789",
      "posted_at": "2025-10-24T18:01:45Z"
    },
    {
      "marketplace": "craigslist",
      "status": "live",
      "listing_id": "cl_abc123",
      "confirmation_link": "https://craigslist.org/sfo/mob/d/abc123.html",
      "posted_at": "2025-10-24T18:02:10Z"
    },
    {
      "marketplace": "facebook",
      "status": "pending_review",
      "message": "Under review by Facebook Marketplace team",
      "estimated_live": "within 24 hours"
    }
  ]
}
```

---

### Cancel Job
**DELETE** `/api/v1/jobs/{job_id}`

Cancel a pending posting job.

**Response**:
```json
{
  "job_id": "job_abc123def",
  "status": "cancelled",
  "cancelled_at": "2025-10-24T18:01:00Z"
}
```

---

## 🔧 Marketplace Adapters

### Base Adapter Interface

```python
from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseMarketplaceAdapter(ABC):
    """Base interface for all marketplace adapters."""
    
    @abstractmethod
    async def validate_listing(self, listing_spec: Dict[str, Any]) -> bool:
        """Validate listing meets marketplace requirements."""
        pass
    
    @abstractmethod
    async def transform_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        """Transform generic listing to marketplace-specific format."""
        pass
    
    @abstractmethod
    async def post_listing(self, marketplace_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Post listing to marketplace API."""
        pass
    
    @abstractmethod
    async def get_listing_status(self, listing_id: str) -> Dict[str, Any]:
        """Check listing status."""
        pass
```

### eBay Adapter
- Max title: 80 chars
- Max images: 12
- Requires: shipping policy, return policy
- Category: Numeric ID (must map from generic category)
- Processing time: 8-12 seconds

### Craigslist Adapter
- Max title: 70 chars
- Max images: 8
- Requires: ZIP code, phone number
- Category: String slug
- Processing time: 5-10 seconds

### Facebook Adapter
- Max title: 100 chars
- Max images: 10
- Requires: Location, shipping options
- Category: Numeric ID
- Processing time: 6-9 seconds

---

## ⚙️ Configuration

### Environment Variables

Create `.env` file:

```bash
# AWS Configuration
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# SQS Queues
SQS_EBAY_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/123/ebay-queue
SQS_CRAIGSLIST_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/123/craigslist-queue
SQS_FACEBOOK_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/123/facebook-queue

# DynamoDB
DYNAMODB_JOBS_TABLE=seller-crosspost-jobs
DYNAMODB_LISTINGS_TABLE=seller-listings

# Marketplace API Keys (Store in AWS Secrets Manager in production)
EBAY_APP_ID=your_ebay_app_id
EBAY_CERT_ID=your_ebay_cert_id
EBAY_DEV_ID=your_ebay_dev_id

CRAIGSLIST_API_KEY=your_craigslist_key

FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_secret

# Worker Configuration
WORKER_CONCURRENCY=5
MAX_RETRIES=3
RETRY_BACKOFF_BASE=2
VISIBILITY_TIMEOUT=60

# Rate Limiting
EBAY_RATE_LIMIT=5000  # per day
CRAIGSLIST_RATE_LIMIT=100  # per hour
FACEBOOK_RATE_LIMIT=200  # per hour

# Application
LOG_LEVEL=INFO
DEBUG=false
PORT=8003
```

---

## 🚀 Local Development

### Prerequisites
- Python 3.11+
- AWS account with SQS and DynamoDB access
- Marketplace API keys
- Docker (optional)

### Setup

1. **Create virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**:
   ```bash
   cp env.example .env
   # Edit .env with your credentials
   ```

4. **Create SQS queues** (one-time setup):
   ```bash
   aws sqs create-queue --queue-name ebay-crosspost-queue
   aws sqs create-queue --queue-name craigslist-crosspost-queue
   aws sqs create-queue --queue-name facebook-crosspost-queue
   ```

5. **Create DynamoDB tables** (one-time setup):
   ```bash
   aws dynamodb create-table \
     --table-name seller-crosspost-jobs \
     --attribute-definitions AttributeName=job_id,AttributeType=S \
     --key-schema AttributeName=job_id,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST
   ```

### Run API Server

```bash
python main.py
```

Server will start at `http://localhost:8003`

### Run Workers

```bash
python worker_main.py
```

Workers will start consuming SQS messages.

---

## 🐳 Docker Deployment

### Build Images

```bash
# API server
docker build -t talknshop-seller-api -f Dockerfile .

# Workers
docker build -t talknshop-seller-worker -f Dockerfile.worker .
```

### Run Containers

```bash
# API server
docker run -p 8003:8003 --env-file .env talknshop-seller-api

# Workers (scale as needed)
docker run --env-file .env talknshop-seller-worker
```

---

## 📊 Job Processing Flow

```
1. User submits listing
   ↓
2. Validate listing (generic requirements)
   ↓
3. Create job in DynamoDB (status: created)
   ↓
4. For each marketplace:
   - Create SQS message
   - Update job (status: queued)
   ↓
5. Return 202 + job_id to user
   ↓
6. SQS Workers pick up messages:
   - Validate marketplace-specific requirements
   - Transform listing to marketplace format
   - Upload images to marketplace CDN
   - Post listing via marketplace API
   - Update job status (live/failed)
   ↓
7. ReconcileStatus checks all marketplaces
   ↓
8. NotifyClient pushes results to user
```

---

## 🔄 Retry Logic

### Retry Strategy

```python
MAX_RETRIES = 3
BACKOFF_BASE = 2  # exponential backoff

Attempt 1: Immediate
Attempt 2: After 2 seconds
Attempt 3: After 4 seconds
Failed: Move to DLQ
```

### Retriable Errors
- Network timeouts
- Rate limit exceeded (429)
- Temporary server errors (500, 502, 503)
- Connection errors

### Non-Retriable Errors
- Invalid credentials (401)
- Bad request (400)
- Resource not found (404)
- Forbidden (403)

---

## 📈 Monitoring

### CloudWatch Metrics

- `JobsCreated` - Number of jobs created
- `JobsCompleted` - Number of jobs completed
- `JobsFailed` - Number of jobs failed
- `QueueDepth` - SQS queue depth per marketplace
- `ProcessingTime` - Time to complete job
- `MarketplaceSuccess` - Success rate per marketplace

### Alarms

- Queue depth > 1000 → Scale up workers
- DLQ has messages → Investigate failures
- Success rate < 80% → Alert team
- Processing time > 10 minutes → Check workers

---

## 🧪 Testing

### Unit Tests

```bash
pytest tests/unit/
```

### Integration Tests

```bash
pytest tests/integration/
```

### Test with Mock Marketplaces

```bash
export USE_MOCK_MARKETPLACES=true
pytest tests/
```

---

## 🚨 Error Handling

### Partial Success Scenario

If posting succeeds on 2 of 3 marketplaces:

```json
{
  "job_id": "job_123",
  "status": "partial_success",
  "success_count": 2,
  "failure_count": 1,
  "marketplace_results": [
    {"marketplace": "ebay", "status": "live"},
    {"marketplace": "craigslist", "status": "live"},
    {"marketplace": "facebook", "status": "failed", "error": "Invalid category"}
  ]
}
```

User can retry failed marketplace individually.

---

## 📝 Future Enhancements

- [ ] Listing update/edit functionality
- [ ] Bulk listing support
- [ ] Scheduled posting (post at specific time)
- [ ] Auto-repost when expired
- [ ] Price adjustment across marketplaces
- [ ] Analytics dashboard
- [ ] Marketplace performance comparison

---

## 🔐 Security

- Store marketplace API keys in AWS Secrets Manager
- Encrypt sensitive data in DynamoDB
- Use IAM roles for AWS service access
- Validate all user inputs
- Rate limit API endpoints

---

## 📄 License

Part of the TalknShop project - SJSU Master's Project.






