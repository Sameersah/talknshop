# TalknShop - AI-Powered Shopping Assistant

A conversational AI platform that enables users to search across multiple marketplaces for buying and list products across multiple platforms for selling, all through natural language chat.

## 🏗️ Architecture Overview

```
┌─────────────────┐
│   iOS/Web App   │
└────────┬────────┘
         │ WebSocket
         ↓
┌─────────────────────────────────┐
│   Orchestrator Service (ECS)    │
│   - WebSocket Manager            │
│   - LangGraph State Machine      │
│   - AWS Bedrock (Claude 3)       │
│   - DynamoDB (State Persistence) │
└────────┬───────────────┬─────────┘
         │               │
    ┌────↓─────┐    ┌───↓──────────┐
    │  Buyer   │    │   Seller     │
    │  Flow    │    │   Flow       │
    └────┬─────┘    └───┬──────────┘
         │              │
    ┌────↓─────────────────────────┐    ┌───↓────────────────────────────┐
    │  Catalog Service (Buyer)     │    │ Seller Crosspost Service       │
    │  - Search products           │    │ - Post listings (async)        │
    │  - Multi-marketplace search  │    │ - SQS Workers                  │
    │  - Ranking & aggregation     │    │ - Job status tracking          │
    └────────────┬─────────────────┘    └────────────┬───────────────────┘
                 │                                     │
        ┌────────↓─────────────┐              ┌──────↓──────────────────┐
        │ Marketplace Adapters │              │ Marketplace Adapters    │
        │ - eBay Search        │              │ - eBay Posting          │
        │ - Amazon Search      │              │ - Craigslist Posting    │
        │ - Walmart Search     │              │ - Facebook Posting      │
        └──────────────────────┘              └─────────────────────────┘
                 │                                     │
        ┌────────↓─────────────┐              ┌──────↓──────────────────┐
        │ External Marketplaces│              │ External Marketplaces   │
        │ (READ Operations)    │              │ (WRITE Operations)      │
        └──────────────────────┘              └─────────────────────────┘
```

## 📁 Project Structure

```
talknshop/
├── apps/
│   ├── orchestrator-service/        # Central coordinator (WebSocket + LangGraph)
│   │   ├── app/
│   │   │   ├── core/               # Config, AWS clients, logging
│   │   │   ├── models/             # Pydantic schemas & enums
│   │   │   ├── websocket/          # WebSocket manager & handlers
│   │   │   ├── db/                 # DynamoDB operations
│   │   │   ├── services/           # External service clients
│   │   │   └── graph/              # LangGraph nodes & state machine
│   │   ├── main.py
│   │   └── README.md
│   │
│   ├── catalog-service/             # Buyer flow - Product search
│   │   ├── adapters/               # Marketplace search adapters
│   │   │   ├── ebay_adapter.py
│   │   │   ├── amazon_adapter.py
│   │   │   └── walmart_adapter.py
│   │   ├── search/                 # Search logic
│   │   ├── ranking/                # Result ranking
│   │   ├── main.py
│   │   └── README.md
│   │
│   ├── seller-crosspost-service/    # Seller flow - Product listing
│   │   ├── adapters/               # Marketplace posting adapters
│   │   │   ├── ebay_adapter.py
│   │   │   ├── craigslist_adapter.py
│   │   │   └── facebook_adapter.py
│   │   ├── workers/                # SQS job processors
│   │   ├── validators/             # Listing validation
│   │   ├── job_tracker/            # Job status management
│   │   ├── main.py
│   │   └── README.md
│   │
│   ├── media-service/               # Audio/image processing
│   │   ├── main.py
│   │   └── README.md
│   │
│   ├── talknshop-web/               # React web app (MVP)
│   │   └── README.md
│   │
│   └── TalknShopApp/                # iOS app
│       └── README.md
│
├── infrastructure/
│   └── cdk/                         # AWS CDK infrastructure
│       ├── app.py
│       └── stacks/
│
├── tools/
│   └── documentation/               # Design docs & diagrams
│
├── docker-compose.yml               # Local development
└── README.md                        # This file
```

## 🚀 Services

### 1. Orchestrator Service (Port 8000)
**Purpose**: Central coordination service for both buyer and seller flows

**Technology**: FastAPI + WebSocket + LangGraph + AWS Bedrock

**Responsibilities**:
- WebSocket connection management
- LangGraph state machine execution
- AWS Bedrock (Claude 3) integration
- DynamoDB state persistence
- Routing to catalog/seller services

**Key Features**:
- Real-time bidirectional communication
- Token-by-token LLM streaming
- 10-node buyer flow graph
- 12-node seller flow graph
- Session management

---

### 2. Catalog Service (Port 8002) - **Buyer Flow**
**Purpose**: Product search and discovery across multiple marketplaces

**Technology**: FastAPI + Marketplace APIs

**Responsibilities**:
- Multi-marketplace product search
- Result aggregation and ranking
- Price comparison
- Product details retrieval

**Supported Marketplaces** (Search):
- eBay
- Amazon
- Walmart
- Best Buy

**Key Features**:
- Fast synchronous search (1-3 seconds)
- Intelligent ranking
- Caching with Redis
- Parallel marketplace queries

---

### 3. Seller Crosspost Service (Port 8003) - **Seller Flow**
**Purpose**: Cross-post listings to multiple marketplaces asynchronously

**Technology**: FastAPI + SQS Workers + DynamoDB

**Responsibilities**:
- Validate listing requirements
- Dispatch SQS jobs per marketplace
- Process listings via workers
- Track job status
- Return confirmation links

**Supported Marketplaces** (Posting):
- eBay
- Craigslist
- Facebook Marketplace
- Poshmark

**Key Features**:
- Asynchronous processing (30s - 5 min)
- SQS-based job queue
- Retry logic with exponential backoff
- Partial success handling (2 of 3 marketplaces)
- Rate limiting per marketplace

---

### 4. Media Service (Port 8001)
**Purpose**: Audio transcription and image processing

**Technology**: FastAPI + AWS Bedrock + S3

**Responsibilities**:
- Audio transcription (speech-to-text)
- Image attribute extraction
- Vision analysis

---

### 5. Web App (Port 5173) / iOS App
**Purpose**: User interfaces for chat-based shopping

**Technology**: React + TypeScript + WebSocket (Web) / Swift (iOS)

**Responsibilities**:
- Chat interface
- WebSocket connection
- Product display
- Media upload

---

## 🔄 Buyer Flow vs Seller Flow

| Aspect | **Buyer Flow** | **Seller Flow** |
|--------|---------------|-----------------|
| **Service** | catalog-service | seller-crosspost-service |
| **Operation** | Search (READ) | Post (WRITE) |
| **Execution** | Synchronous | Asynchronous (SQS) |
| **Response Time** | 1-3 seconds | 30s - 5 minutes |
| **LangGraph Nodes** | 10 nodes | 12 nodes |
| **Data Object** | RequirementSpec | ListingSpec |
| **User Flow** | Search → Results immediately | Post → Get job_id → Notified when done |

---

## 🛠️ Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 18+ (for web app)
- AWS Account with Bedrock access

### 1. Clone Repository
```bash
git clone <repository-url>
cd talknshop
```

### 2. Start All Services with Docker Compose
```bash
docker-compose up
```

Services will be available at:
- Orchestrator: http://localhost:8000
- Media Service: http://localhost:8001
- Catalog Service: http://localhost:8002
- Seller Service: http://localhost:8003

### 3. Start Services Individually

#### Orchestrator Service
```bash
cd apps/orchestrator-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp env.example .env  # Add your AWS credentials
python main.py
```

#### Catalog Service (Buyer)
```bash
cd apps/catalog-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

#### Seller Crosspost Service
```bash
cd apps/seller-crosspost-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp env.example .env
python main.py
```

#### Web App
```bash
cd apps/talknshop-web
npm install
cp env.example .env.local
npm run dev
```

---

## 🧪 Testing

### Test Buyer Flow (Search)
```bash
# Via orchestrator WebSocket
wscat -c "ws://localhost:8000/ws/chat?session_id=test&user_id=user1"

# Send message
{"type":"MESSAGE","session_id":"test","user_id":"user1","text":"Find me a laptop under $1000"}
```

### Test Seller Flow (Posting)
```bash
# Via orchestrator WebSocket
wscat -c "ws://localhost:8000/ws/chat?session_id=test2&user_id=user2"

# Send message
{"type":"MESSAGE","session_id":"test2","user_id":"user2","text":"Sell my iPhone 13, 128GB, blue, good condition, $650"}
```

---

## 📊 Key Design Decisions

### Why Separate catalog-service and seller-crosspost-service?

1. **Different Operations**: READ vs WRITE
2. **Different Performance**: Fast (1-3s) vs Slow (30s-5min)
3. **Different Scaling**: Stateless HTTP vs Worker Pool
4. **Failure Isolation**: Seller bugs don't affect buyer search
5. **Different SLAs**: 99.9% vs 95%

### Why Duplicate Marketplace Adapters?

For **MVP speed** and **simplicity**:
- ✅ No package management overhead
- ✅ Faster development
- ✅ Independent service deployment
- ✅ Each service owns its adapters

**Future**: Extract to shared `marketplace-adapters` package when mature

### Why SQS for Seller Flow?

1. **Async nature**: Posting takes 8-15 seconds per marketplace
2. **Don't block users**: Return job_id immediately
3. **Automatic retries**: SQS handles retry logic
4. **Scalability**: Add workers dynamically
5. **Rate limiting**: Control marketplace API call rates

---

## 🎯 Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Orchestrator Service | ✅ 85% | WebSocket + LangGraph nodes implemented |
| Catalog Service | ⚠️ 20% | Basic structure, needs marketplace adapters |
| Seller Crosspost Service | 🔴 0% | To be implemented |
| Media Service | ⚠️ 30% | Basic structure, needs AWS integration |
| Web App | ✅ 90% | Chat UI complete, WebSocket working |
| iOS App | 🔴 0% | Planned |

---

## 📚 Documentation

- [Orchestrator Service](apps/orchestrator-service/README.md)
- [Catalog Service](apps/catalog-service/README.md)
- [Seller Crosspost Service](apps/seller-crosspost-service/README.md)
- [Web App](apps/talknshop-web/README.md)
- [Architecture Diagrams](tools/documentation/)

---

## 🔐 Security

- AWS credentials via environment variables
- Marketplace API keys in AWS Secrets Manager
- DynamoDB encryption at rest
- WebSocket authentication via session tokens

---

## 📈 Monitoring

- CloudWatch Logs for all services
- DynamoDB metrics
- SQS queue depth monitoring
- API Gateway metrics

---

## 👥 Contributing

1. Follow service-specific README for setup
2. Keep adapters synchronized if updating marketplace logic
3. Test both buyer and seller flows after changes
4. Update documentation for architectural changes

---

## 📄 License

This project is developed as part of SJSU Master's Project.

---

## 🆘 Support

For issues or questions, see individual service READMEs or contact the development team.
