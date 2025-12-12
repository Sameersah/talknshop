# TalknShop Architecture

## Overview

TalknShop is a conversational AI shopping platform that enables users to search for products (buyer flow) and post listings (seller flow) across multiple marketplaces through natural language chat.

## Core Design Principles

1. **Service Separation**: Separate services for buyer (READ) and seller (WRITE) operations
2. **Asynchronous Processing**: Seller flow uses SQS for long-running marketplace API calls
3. **Scalability**: Independent scaling for each service
4. **Failure Isolation**: Issues in one flow don't affect the other
5. **Marketplace Agnosticism**: Orchestrator doesn't know marketplace details

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│  ┌──────────────┐              ┌──────────────┐            │
│  │  iOS App     │              │  Web App     │            │
│  │  (Swift)     │              │  (React/TS)  │            │
│  └──────┬───────┘              └──────┬───────┘            │
│         └────────────┬─────────────────┘                    │
│                      │ WebSocket                            │
└──────────────────────┼──────────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────────┐
│              ORCHESTRATOR LAYER                             │
│  ┌───────────────────▼───────────────────────────┐         │
│  │    Orchestrator Service (Port 8000)           │         │
│  │    - WebSocket Manager                        │         │
│  │    - LangGraph State Machine (10+12 nodes)   │         │
│  │    - AWS Bedrock (Claude 3 Sonnet)            │         │
│  │    - DynamoDB (State Persistence)             │         │
│  │    - Session Management                       │         │
│  └───┬───────────────────────────────────┬───────┘         │
│      │                                   │                 │
│      │ Buyer Flow                        │ Seller Flow    │
└──────┼───────────────────────────────────┼─────────────────┘
       │                                   │
┌──────▼──────────────┐         ┌──────────▼─────────────────┐
│   BUYER SERVICES    │         │   SELLER SERVICES          │
│  ┌─────────────────┐│         │ ┌──────────────────────────┴┐
│  │ Catalog Service ││         │ │ Seller Crosspost Service  │
│  │ (Port 8002)     ││         │ │ (Port 8003)               │
│  │                 ││         │ │                            │
│  │ - Search        ││         │ │ - Validate Listings       │
│  │ - Aggregate     ││         │ │ - Create SQS Jobs         │
│  │ - Rank          ││         │ │ - Track Job Status        │
│  │ - Fast (1-3s)   ││         │ │ - Return 202 + job_id     │
│  └─────────┬───────┘│         │ └──────────┬────────────────┘
│            │        │         │            │                 │
│  ┌─────────▼────────┴┐        │  ┌─────────▼────────────────┴┐
│  │ Search Adapters   │        │  │    Amazon SQS             │
│  │ - eBay           │        │  │  - ebay-queue             │
│  │ - Amazon         │        │  │  - craigslist-queue       │
│  │ - Walmart        │        │  │  - facebook-queue         │
│  │ - Best Buy       │        │  └─────────┬─────────────────┘
│  └─────────┬────────┘         │            │                 │
└────────────┼──────────────────┘  ┌─────────▼─────────────────┴┐
             │                     │  SQS Workers (ECS)         │
┌────────────▼────────────────┐   │  - Consume messages        │
│  MARKETPLACE LAYER (READ)   │   │  - Process per marketplace │
│  - eBay API (Search)        │   └─────────┬──────────────────┘
│  - Amazon API (Search)      │             │                   
│  - Walmart API (Search)     │   ┌─────────▼─────────────────┐
└─────────────────────────────┘   │  Posting Adapters         │
                                  │  - eBay Adapter            │
                                  │  - Craigslist Adapter      │
                                  │  - Facebook Adapter        │
                                  └─────────┬──────────────────┘
                                            │
                               ┌────────────▼────────────────┐
                               │ MARKETPLACE LAYER (WRITE)   │
                               │ - eBay API (Post)           │
                               │ - Craigslist API (Post)     │
                               │ - Facebook API (Post)       │
                               └─────────────────────────────┘
```

---

## Service Breakdown

### 1. Orchestrator Service

**Port**: 8000  
**Technology**: FastAPI + WebSocket + LangGraph + AWS Bedrock  
**Purpose**: Central coordinator for both flows

**Responsibilities**:
- Manage WebSocket connections
- Execute LangGraph state machines
- Route requests to appropriate services
- Persist conversation state to DynamoDB
- Stream LLM responses token-by-token

**Key Components**:
- `ConnectionManager`: WebSocket connection management
- `LangGraph Buyer Flow`: 10-node state machine
- `LangGraph Seller Flow`: 12-node state machine  
- `AWS Bedrock Client`: Claude 3 Sonnet integration
- `DynamoDB Repository`: State persistence

---

### 2. Catalog Service (Buyer Flow)

**Port**: 8002  
**Technology**: FastAPI + Marketplace APIs  
**Purpose**: Product search across marketplaces

**Responsibilities**:
- Execute product searches
- Aggregate results from multiple marketplaces
- Rank results by price, rating, relevance
- Return product details
- Cache search results (Redis)

**Flow**:
```
1. Receive RequirementSpec from orchestrator
2. Transform to marketplace-specific queries
3. Call marketplace search APIs in parallel
4. Aggregate and normalize results
5. Rank by scoring algorithm
6. Return top results
```

**Performance**: Synchronous, 1-3 seconds

**Supported Marketplaces** (Search):
- eBay
- Amazon  
- Walmart
- Best Buy

---

### 3. Seller Crosspost Service (Seller Flow)

**Port**: 8003  
**Technology**: FastAPI + SQS + DynamoDB  
**Purpose**: Asynchronous multi-marketplace listing

**Responsibilities**:
- Validate listing requirements
- Create SQS jobs per marketplace
- Track job status in DynamoDB
- Coordinate workers
- Notify users of completion

**Flow**:
```
1. Receive ListingSpec from orchestrator
2. Validate generic requirements
3. Create job record in DynamoDB
4. Create SQS message per marketplace
5. Return 202 + job_id immediately
6. Workers process asynchronously
7. Update job status as workers complete
8. Notify user via WebSocket/Push
```

**Performance**: Asynchronous, 30s - 5 minutes

**Supported Marketplaces** (Posting):
- eBay
- Craigslist
- Facebook Marketplace
- Poshmark

---

### 4. Media Service

**Port**: 8001  
**Technology**: FastAPI + AWS Bedrock  
**Purpose**: Audio and image processing

**Responsibilities**:
- Audio transcription (speech-to-text)
- Image attribute extraction
- Vision analysis for product identification

**Shared by**: Both buyer and seller flows

---

## Data Flow

### Buyer Flow (Search)

```
User: "Find me a laptop under $1000"
  ↓ WebSocket
Orchestrator
  ├─ ParseInput
  ├─ NeedMediaOps? (No)
  ├─ BuildRequirementSpec
  │    RequirementSpec: {
  │      product_type: "laptop",
  │      filters: { price_max: 1000 }
  │    }
  ├─ NeedClarify? (No)
  └─ SearchMarketplaces
       ↓ HTTP POST /api/v1/search
Catalog Service
  ├─ eBay Search (parallel)
  ├─ Amazon Search (parallel)
  └─ Walmart Search (parallel)
       ↓ Aggregate & Rank
       ↓ Return results (2 seconds)
Orchestrator
  └─ RankAndCompose
       ↓ Stream results
User: [Sees 10 product cards]
```

**Total Time**: 2-4 seconds

---

### Seller Flow (Posting)

```
User: "Sell my iPhone 13, $650, good condition"
  ↓ WebSocket
Orchestrator
  ├─ ParseInput
  ├─ NeedMediaOps? (Yes - process images)
  ├─ ExtractImageAttrs
  ├─ BuildListingSpec
  │    ListingSpec: {
  │      title: "iPhone 13, 128GB, Blue",
  │      price: 650,
  │      condition: "good",
  │      target_marketplaces: ["ebay", "craigslist", "facebook"]
  │    }
  ├─ ValidateListingInputs
  ├─ NeedClarify? (No)
  └─ CrosspostDispatch
       ↓ HTTP POST /api/v1/post
Seller Crosspost Service
  ├─ Validate listing
  ├─ Create job in DynamoDB
  ├─ Create 3 SQS messages
  └─ Return 202 + job_id (100ms)
       ↓
User: "Got it! Processing your listing..."

[Background - SQS Workers]
Worker 1 → eBay Adapter → eBay API (10s) → Success
Worker 2 → Craigslist Adapter → CL API (8s) → Success  
Worker 3 → Facebook Adapter → FB API (6s) → Success

[2 minutes later]
Notify User
  ↓ WebSocket push
User: "✓ Your iPhone is live on 3 marketplaces!"
```

**Total Time**: User waits 0.1s, completes in 2-5 minutes

---

## Design Decisions

### Why Separate catalog-service and seller-crosspost-service?

| Reason | Impact |
|--------|--------|
| **Different Operations** | READ vs WRITE require different patterns |
| **Different Performance** | Fast (1-3s) vs Slow (30s-5min) |
| **Different Scaling** | Stateless HTTP vs Worker Pool |
| **Failure Isolation** | Seller bugs don't affect buyer search |
| **Different SLAs** | 99.9% (buyer) vs 95% (seller) |

---

### Why Duplicate Marketplace Adapters?

**Current Approach**: Duplicate adapters in both services

**Rationale**:
- ✅ Faster MVP development
- ✅ No package management overhead
- ✅ Independent service deployment
- ✅ Each service owns its adapters
- ✅ Simpler for small team

**Future**: Extract to shared `marketplace-adapters` package when:
- Services are stable
- Team grows (5+ engineers)
- Adapter changes become frequent
- Need strict version control

**Trade-off Accepted**: Some code duplication for speed

---

### Why SQS for Seller Flow?

**Problem**: Marketplace APIs are slow (8-15 seconds each)

**Solution**: Asynchronous processing via SQS

**Benefits**:
1. **Don't block users**: Return job_id immediately
2. **Automatic retries**: SQS handles retry logic
3. **Scalability**: Add workers dynamically (ECS Auto Scaling)
4. **Rate limiting**: Control marketplace API call rates
5. **Failure handling**: DLQ for poison messages
6. **Monitoring**: CloudWatch metrics out of the box

**Alternative Considered**: Direct synchronous calls
**Rejected Because**: Would block users for 30+ seconds

---

## State Management

### DynamoDB Tables

#### orchestrator-requests
**Purpose**: Session and conversation state

```
PK: session_id
SK: timestamp

Attributes:
- user_id
- workflow_stage
- requirement_spec / listing_spec
- turn_history
- media_refs
- created_at
- updated_at
```

#### seller-crosspost-jobs
**Purpose**: Seller job tracking

```
PK: job_id

Attributes:
- user_id
- session_id
- listing_spec
- status (created, processing, completed, failed)
- marketplace_jobs []
  - marketplace
  - status
  - listing_id
  - confirmation_link
- created_at
- completed_at
```

---

## Scaling Strategy

### Catalog Service (Buyer)
```
Normal Load:  3 instances (handle 100 searches/min)
Peak Load:    10 instances (handle 500 searches/min)
Trigger:      CPU > 70% or Queue Depth > 50
```

### Seller Crosspost Service
```
API Layer:     2 instances (handle job creation)
Workers:       5-20 instances (based on SQS queue depth)
Trigger:       SQS Queue Depth > 100 messages
```

### Orchestrator Service
```
Normal Load:  2 instances (handle 50 concurrent connections)
Peak Load:    5 instances (handle 200 concurrent connections)  
Trigger:      Active WebSocket connections > 80% capacity
```

---

## Monitoring & Observability

### Key Metrics

**Orchestrator**:
- Active WebSocket connections
- Messages per second
- LangGraph execution time
- DynamoDB read/write latency

**Catalog Service**:
- Search requests per minute
- Average search latency (p50, p95, p99)
- Marketplace API success rate
- Cache hit rate

**Seller Crosspost Service**:
- Jobs created per hour
- Jobs completed per hour
- SQS queue depth (per marketplace)
- Worker processing time
- Marketplace success rate

### Alarms

- Orchestrator down → Page on-call
- Catalog search latency > 5s → Alert
- SQS queue depth > 1000 → Scale workers
- Seller job failure rate > 20% → Investigate
- DLQ has messages → Alert + investigate

---

## Security

### Authentication
- WebSocket: Session token validation
- Service-to-service: IAM roles (within AWS)
- External APIs: API keys in AWS Secrets Manager

### Data Protection
- DynamoDB: Encryption at rest
- S3: Encryption at rest + in transit
- Secrets: AWS Secrets Manager
- Network: VPC + Security Groups

### Rate Limiting
- Per user: 10 requests/minute (orchestrator)
- Per marketplace: Respect API limits
- Global: AWS WAF rules

---

## Deployment

### Local Development
```bash
# Start all services
docker-compose up

# Or individually
cd apps/orchestrator-service && python main.py
cd apps/catalog-service && python main.py  
cd apps/seller-crosspost-service && python main.py
```

### AWS Deployment (ECS Fargate)
```bash
# Deploy via CDK
cd infrastructure/cdk
cdk deploy --all
```

**Resources Created**:
- ECS Cluster + Services (3 services)
- Application Load Balancer
- API Gateway (WebSocket API)
- SQS Queues (3 queues)
- DynamoDB Tables (2 tables)
- CloudWatch Log Groups
- IAM Roles

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React, TypeScript, WebSocket, Tailwind CSS |
| **Orchestrator** | Python, FastAPI, LangGraph, LangChain, AWS Bedrock |
| **Services** | Python, FastAPI, Pydantic |
| **Queue** | AWS SQS |
| **Database** | AWS DynamoDB |
| **Storage** | AWS S3 |
| **Compute** | AWS ECS Fargate |
| **API Gateway** | AWS API Gateway (WebSocket) |
| **Monitoring** | AWS CloudWatch |
| **Infrastructure** | AWS CDK (Python) |

---

## Future Enhancements

### Phase 2
- [ ] Extract shared marketplace adapters package
- [ ] Add more marketplaces (5+ each)
- [ ] Implement full LangGraph integration
- [ ] Add recommendation engine
- [ ] User preference learning

### Phase 3
- [ ] Real-time price alerts
- [ ] Bulk listing support  
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Mobile app (iOS + Android)

---

## Contributing

See individual service READMEs:
- [Orchestrator Service](apps/orchestrator-service/README.md)
- [Catalog Service](apps/catalog-service/README.md)
- [Seller Crosspost Service](apps/seller-crosspost-service/README.md)

---

## License

SJSU Master's Project - Educational Use






