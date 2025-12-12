# TalknShop Database Documentation

## Overview

This document provides comprehensive details about all databases used in the TalknShop project, including schema definitions, table structures, access patterns, and configuration information.

**Last Updated**: October 2025

---

## Database Systems

The TalknShop project primarily uses **AWS DynamoDB** as its database system. The project also references Redis for caching (planned) and PostgreSQL for local development (catalog-service), but these are not currently implemented in production.

### Primary Database: AWS DynamoDB

- **Provider**: Amazon Web Services (AWS)
- **Region**: `us-west-2` (configurable via `AWS_REGION` environment variable)
- **Billing Mode**: Pay-per-request (on-demand)
- **Access Pattern**: NoSQL key-value/document store
- **Client Library**: Boto3 (AWS SDK for Python)

---

## DynamoDB Tables

The project uses three DynamoDB tables:

### 1. orchestrator-requests (Sessions Table)

**Purpose**: Stores conversation session state, user interactions, requirement specifications, and search results for the buyer flow.

**Table Name**: `orchestrator-requests` (configurable via `DYNAMODB_TABLE_NAME`)

**Primary Key**:
- **Partition Key (pk)**: `String` - Session ID (e.g., `sess_123abc`)
- **Sort Key (sk)**: `String` - Session identifier pattern (`SESSION#{session_id}`)

**Table Configuration**:
- **Billing Mode**: Pay-per-request (on-demand)
- **Removal Policy**: DESTROY (for development, use RETAIN in production)
- **TTL**: Enabled (24 hours from creation)
- **Streams**: Not configured
- **Global Secondary Indexes**: None (uses scan with filter for user queries)

**Schema**:

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `pk` | String | Yes | Primary key - Session ID |
| `sk` | String | Yes | Sort key - `SESSION#{session_id}` |
| `user_id` | String | Yes | User identifier |
| `workflow_stage` | String | Yes | Current workflow stage (enum: initial, media_processing, requirement_building, clarification, searching, ranking, completed, failed, cancelled) |
| `request_type` | String | Yes | Type of request (enum: search, chat, clarification) |
| `clarification_count` | Number | Yes | Number of clarification rounds (default: 0) |
| `created_at` | String | Yes | ISO 8601 timestamp of session creation |
| `updated_at` | String | Yes | ISO 8601 timestamp of last update |
| `ttl` | Number | Yes | Time-to-live timestamp (24 hours from creation) |
| `requirement_spec` | String (JSON) | No | Serialized RequirementSpec object |
| `search_results` | String (JSON) | No | Serialized SearchResults object |
| `last_message` | String | No | Last user message |
| `transcript` | String | No | Audio transcript (if audio was processed) |
| `image_attributes` | String (JSON) | No | Extracted image attributes (if image was processed) |
| `metadata` | String (JSON) | No | Additional metadata (default: `{}`) |

**Access Patterns**:

1. **Get Session by ID**
   - Operation: `get_item`
   - Key: `{pk: session_id, sk: "SESSION#{session_id}"}`
   - Used in: Session retrieval, state updates

2. **Create Session**
   - Operation: `put_item`
   - Key: `{pk: session_id, sk: "SESSION#{session_id}"}`
   - Used in: New session creation

3. **Update Session**
   - Operation: `update_item`
   - Key: `{pk: session_id, sk: "SESSION#{session_id}"}`
   - Used in: State updates, requirement spec storage, search results storage

4. **Delete Session**
   - Operation: `delete_item`
   - Key: `{pk: session_id, sk: "SESSION#{session_id}"}`
   - Used in: Session cleanup

5. **Get User Sessions**
   - Operation: `scan` with filter
   - Filter: `user_id = :user_id`
   - Note: Not optimal for production - should use GSI if needed frequently

6. **Increment Clarification Count**
   - Operation: `update_item` with `ADD` expression
   - Used in: Tracking clarification loops

**Data Models**:

The table stores serialized JSON for complex objects:

- **RequirementSpec** (stored as JSON string):
  ```json
  {
    "product_type": "laptop",
    "attributes": {
      "ram_gb": ">=16",
      "storage_gb": ">=512",
      "processor": "Intel i7 or AMD Ryzen 7"
    },
    "filters": {
      "screen_size": "15-17 inch"
    },
    "price": {
      "min": null,
      "max": 1200,
      "currency": "USD"
    },
    "brand_preferences": ["Apple", "Dell", "Lenovo"],
    "rating_min": 4.2,
    "condition": "new",
    "marketplaces": ["amazon", "walmart"]
  }
  ```

- **SearchResults** (stored as JSON string):
  ```json
  {
    "products": [
      {
        "product_id": "prod_123",
        "marketplace": "amazon",
        "title": "Product Title",
        "price": 999.99,
        "currency": "USD",
        "rating": 4.5,
        "review_count": 1234,
        "availability": "in_stock",
        "deep_link": "https://amazon.com/...",
        "marketplace_url": "https://amazon.com/...",
        "attributes": {},
        "why_ranked": "Matches all requirements"
      }
    ],
    "total_count": 1,
    "requirement_spec": {...},
    "search_metadata": {},
    "marketplaces_searched": ["amazon", "walmart"],
    "search_duration_ms": 1500
  }
  ```

**Workflow Stages**:

The `workflow_stage` field tracks the current stage of the conversation:

- `initial` - Session just created
- `media_processing` - Processing audio/image files
- `requirement_building` - Building product search requirements
- `clarification` - Waiting for user clarification
- `searching` - Searching product catalogs
- `ranking` - Ranking and composing results
- `completed` - Search completed, results ready
- `failed` - Error occurred
- `cancelled` - Session cancelled

**TTL Configuration**:

- **TTL Attribute**: `ttl`
- **TTL Value**: Unix timestamp (seconds since epoch)
- **Default TTL**: 24 hours from creation
- **Purpose**: Automatic cleanup of stale sessions

**Implementation Files**:
- Repository: `apps/orchestrator-service/app/db/dynamodb.py`
- Models: `apps/orchestrator-service/app/models/schemas.py`
- Configuration: `apps/orchestrator-service/app/core/config.py`
- AWS Clients: `apps/orchestrator-service/app/core/aws_clients.py`

---

### 2. orchestrator-checkpoints (LangGraph Checkpoints Table)

**Purpose**: Stores LangGraph workflow checkpoints for state machine persistence and resumability.

**Table Name**: `orchestrator-checkpoints` (configurable via `DYNAMODB_CHECKPOINT_TABLE`)

**Primary Key**:
- **Partition Key (thread_id)**: `String` - Session/thread ID (matches session_id)
- **Sort Key (checkpoint_id)**: `String` - Checkpoint identifier

**Table Configuration**:
- **Billing Mode**: Pay-per-request (on-demand)
- **Removal Policy**: DESTROY (for development, use RETAIN in production)
- **TTL**: Not configured
- **Streams**: Not configured
- **Global Secondary Indexes**: None

**Schema**:

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `thread_id` | String | Yes | Primary key - Session/thread ID |
| `checkpoint_id` | String | Yes | Sort key - Checkpoint identifier |
| `checkpoint_data` | Map | Yes | LangGraph state checkpoint |
| `created_at` | String | Yes | ISO 8601 timestamp |
| `metadata` | Map | No | Additional metadata |

**Access Patterns**:

1. **Save Checkpoint**
   - Operation: `put_item`
   - Used by: LangGraph after each node execution

2. **Load Checkpoint**
   - Operation: `get_item` or `query`
   - Used by: LangGraph to resume workflow

3. **List Checkpoints**
   - Operation: `query`
   - Used by: LangGraph to retrieve workflow history

**Purpose**: 
- Enables workflow resumability after interruptions
- Allows workflow state inspection and debugging
- Supports workflow versioning and rollback

**Implementation**:
- Currently uses in-memory checkpointer (`MemorySaver`) for development
- Production should use `DynamoDBSaver` from `langgraph.checkpoint.dynamodb`
- Configuration in: `apps/orchestrator-service/app/graph/graph.py`

**Note**: This table is planned but not fully implemented. The current implementation uses `MemorySaver` for checkpoints.

---

### 3. seller-crosspost-jobs (Seller Job Tracking Table)

**Purpose**: Tracks asynchronous marketplace posting jobs for the seller flow.

**Table Name**: `seller-crosspost-jobs` (mentioned in architecture, implementation pending)

**Primary Key**:
- **Partition Key (job_id)**: `String` - Job identifier

**Table Configuration**:
- **Billing Mode**: Pay-per-request (on-demand)
- **Removal Policy**: RETAIN (recommended for production)
- **TTL**: Not configured
- **Streams**: Not configured
- **Global Secondary Indexes**: None (may need GSI on `user_id` for user queries)

**Schema** (Planned):

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | String | Yes | Primary key - Job identifier |
| `user_id` | String | Yes | User identifier |
| `session_id` | String | No | Associated session ID |
| `listing_spec` | Map | Yes | Product listing specification |
| `status` | String | Yes | Job status (enum: created, processing, completed, failed, partial_success, cancelled) |
| `marketplace_jobs` | List | Yes | Array of marketplace-specific job statuses |
| `created_at` | String | Yes | ISO 8601 timestamp |
| `completed_at` | String | No | ISO 8601 timestamp of completion |
| `error` | String | No | Error message if failed |
| `metadata` | Map | No | Additional metadata |

**Marketplace Job Structure**:

```json
{
  "marketplace": "ebay",
  "job_id": "ebay_xyz123",
  "status": "live",
  "listing_id": "123456789",
  "confirmation_link": "https://ebay.com/itm/123456789",
  "posted_at": "2025-10-24T18:01:45Z",
  "error": null
}
```

**Access Patterns**:

1. **Create Job**
   - Operation: `put_item`
   - Used in: Job creation

2. **Get Job Status**
   - Operation: `get_item`
   - Key: `{job_id: job_id}`
   - Used in: Status checks

3. **Update Job Status**
   - Operation: `update_item`
   - Used in: Status updates from workers

4. **Get User Jobs**
   - Operation: `scan` with filter (or GSI on `user_id`)
   - Filter: `user_id = :user_id`
   - Used in: User job history

**Status Values**:

- `created` - Job created, queued
- `processing` - Job being processed
- `completed` - All marketplaces posted successfully
- `partial_success` - Some marketplaces succeeded, some failed
- `failed` - All marketplaces failed
- `cancelled` - Job cancelled by user

**Implementation Status**: 
- Architecture defined in `ARCHITECTURE.md`
- Referenced in `apps/seller-crosspost-service/README.md`
- Implementation pending

---

## Database Configuration

### Environment Variables

**Orchestrator Service** (`apps/orchestrator-service/.env`):

```bash
# AWS Configuration
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key  # Optional, use IAM roles in production
AWS_SECRET_ACCESS_KEY=your_secret_key  # Optional, use IAM roles in production

# DynamoDB Tables
DYNAMODB_TABLE_NAME=orchestrator-requests
DYNAMODB_CHECKPOINT_TABLE=orchestrator-checkpoints

# Session Configuration
SESSION_TTL_HOURS=24
MAX_CLARIFICATION_LOOPS=2
```

**Seller Crosspost Service** (`apps/seller-crosspost-service/.env`):

```bash
# AWS Configuration
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# DynamoDB Tables
DYNAMODB_JOBS_TABLE=seller-crosspost-jobs
DYNAMODB_LISTINGS_TABLE=seller-listings
```

### AWS Credentials

**Production**:
- Use IAM roles attached to ECS tasks
- No explicit credentials in environment variables
- Roles should have permissions for:
  - `dynamodb:GetItem`
  - `dynamodb:PutItem`
  - `dynamodb:UpdateItem`
  - `dynamodb:DeleteItem`
  - `dynamodb:Query`
  - `dynamodb:Scan`

**Development**:
- Use AWS access keys in `.env` file
- Never commit `.env` files to version control
- Use `env.example` as template

### Boto3 Configuration

**Connection Settings**:
- **Region**: `us-west-2` (configurable)
- **Retry Mode**: Adaptive
- **Max Retries**: 3
- **Connect Timeout**: 10 seconds
- **Read Timeout**: 60 seconds
- **Max Pool Connections**: 50

**Implementation**: `apps/orchestrator-service/app/core/aws_clients.py`

---

## Data Models

### SessionState

**Location**: `apps/orchestrator-service/app/models/schemas.py`

**Fields**:

```python
class SessionState(BaseModel):
    session_id: str
    user_id: str
    workflow_stage: WorkflowStage
    request_type: RequestType = RequestType.CHAT
    requirement_spec: Optional[RequirementSpec] = None
    clarification_count: int = 0
    last_message: Optional[str] = None
    last_media: List[MediaReference] = Field(default_factory=list)
    transcript: Optional[str] = None
    image_attributes: Optional[Dict[str, Any]] = None
    search_results: Optional[SearchResults] = None
    created_at: datetime
    updated_at: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)
```

### RequirementSpec

**Location**: `apps/orchestrator-service/app/models/schemas.py`

**Fields**:

```python
class RequirementSpec(BaseModel):
    product_type: str
    attributes: Dict[str, Any] = Field(default_factory=dict)
    filters: Dict[str, Any] = Field(default_factory=dict)
    price: Optional[PriceFilter] = None
    brand_preferences: List[str] = Field(default_factory=list)
    rating_min: Optional[float] = None
    condition: Optional[ProductCondition] = None
    marketplaces: List[MarketplaceProvider] = Field(default_factory=list)
```

### SearchResults

**Location**: `apps/orchestrator-service/app/models/schemas.py`

**Fields**:

```python
class SearchResults(BaseModel):
    products: List[ProductResult]
    total_count: int
    requirement_spec: RequirementSpec
    search_metadata: Dict[str, Any] = Field(default_factory=dict)
    marketplaces_searched: List[MarketplaceProvider]
    search_duration_ms: int
```

### ProductResult

**Location**: `apps/orchestrator-service/app/models/schemas.py`

**Fields**:

```python
class ProductResult(BaseModel):
    product_id: str
    marketplace: MarketplaceProvider
    title: str
    description: Optional[str] = None
    price: float
    currency: str = "USD"
    rating: Optional[float] = None
    review_count: Optional[int] = None
    condition: Optional[ProductCondition] = None
    availability: str
    image_url: Optional[str] = None
    deep_link: str
    marketplace_url: str
    seller_name: Optional[str] = None
    shipping_info: Optional[Dict[str, Any]] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)
    why_ranked: Optional[str] = None
```

---

## Database Operations

### Repository Pattern

The project uses a repository pattern for database operations:

**Location**: `apps/orchestrator-service/app/db/dynamodb.py`

**SessionRepository Class**:

```python
class SessionRepository:
    async def create_session(...) -> SessionState
    async def get_session(session_id: str) -> Optional[SessionState]
    async def update_session(session_id: str, **updates) -> SessionState
    async def delete_session(session_id: str) -> None
    async def save_requirement_spec(...) -> None
    async def save_search_results(...) -> None
    async def increment_clarification_count(...) -> int
    async def get_user_sessions(user_id: str, limit: int = 10) -> List[SessionState]
```

### Error Handling

**Custom Exceptions**:
- `DynamoDBError` - Base exception for DynamoDB operations
- `SessionNotFoundError` - Session not found
- `DynamoDBClientError` - AWS client errors

**Location**: `apps/orchestrator-service/app/core/errors.py`

### Serialization

Complex objects are serialized to JSON strings before storage:
- `RequirementSpec` → JSON string
- `SearchResults` → JSON string
- `image_attributes` → JSON string
- `metadata` → JSON string

Deserialization happens when reading from DynamoDB.

---

## Infrastructure as Code

### CDK Stack

**Location**: `infrastructure/cdk/stacks/orchestrator_stack.py`

**Current Implementation**:

```python
dynamodb.Table(self, "OrchestratorRequestsTable",
    partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
    sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
    billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
    removal_policy=cdk.RemovalPolicy.DESTROY
)
```

**Planned Implementation** (from `ORCHESTRATOR_WEBSOCKET_PLAN.md`):

```python
# Sessions table
sessions_table = dynamodb.Table(
    self, "OrchestratorRequestsTable",
    partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
    sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
    billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
    removal_policy=cdk.RemovalPolicy.DESTROY
)

# Checkpoints table
checkpoints_table = dynamodb.Table(
    self, "OrchestratorCheckpointsTable",
    partition_key=dynamodb.Attribute(name="thread_id", type=dynamodb.AttributeType.STRING),
    sort_key=dynamodb.Attribute(name="checkpoint_id", type=dynamodb.AttributeType.STRING),
    billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
    removal_policy=cdk.RemovalPolicy.DESTROY
)
```

---

## Planned Databases

### Redis (Caching)

**Status**: Planned, not implemented

**Purpose**: 
- Cache search results
- Cache product details
- Rate limiting
- Session caching

**Configuration** (from `apps/catalog-service/README.md`):
- **URL**: `redis://localhost:6379`
- **Use Case**: Read-through cache for popular searches
- **TTL**: Configurable (default: 3600 seconds)

**Implementation Status**: Referenced in architecture, not implemented

### PostgreSQL (Local Development)

**Status**: Planned for catalog-service, not implemented

**Purpose**:
- Local data storage for catalog-service
- Product metadata storage
- User preferences storage

**Configuration** (from `apps/catalog-service/README.md`):
- **URL**: `postgresql://user:password@localhost:5432/catalog_db`
- **ORM**: SQLAlchemy
- **Use Case**: Local development and testing

**Implementation Status**: Mentioned in README, not implemented

---

## Performance Considerations

### DynamoDB

**Billing Mode**: Pay-per-request (on-demand)
- **Advantages**: No capacity planning, automatic scaling
- **Cost**: Pay for what you use
- **Suitable for**: Variable workloads, development, MVP

**Future Optimization**:
- Consider provisioned capacity for predictable workloads
- Add Global Secondary Indexes (GSIs) for query patterns
- Enable DynamoDB Streams for real-time processing
- Consider DynamoDB Accelerator (DAX) for caching

### Query Optimization

**Current Limitations**:
- `get_user_sessions()` uses `scan` operation (inefficient)
- No GSI on `user_id` for user queries
- No GSI on `created_at` for time-based queries

**Recommended Improvements**:
1. Add GSI on `user_id` for user session queries
2. Add GSI on `created_at` for time-based queries
3. Use `query` instead of `scan` where possible
4. Implement pagination for large result sets

### TTL Configuration

**Current**: 24 hours TTL on sessions
- **Purpose**: Automatic cleanup of stale sessions
- **Consideration**: Adjust based on usage patterns
- **Monitoring**: Monitor TTL deletions in CloudWatch

---

## Security

### Encryption

**At Rest**:
- DynamoDB encryption at rest is enabled by default
- AWS managed keys (KMS)

**In Transit**:
- All DynamoDB connections use HTTPS/TLS
- Boto3 enforces SSL

### Access Control

**IAM Roles**:
- Use IAM roles for ECS tasks (production)
- Least privilege principle
- Required permissions:
  - `dynamodb:GetItem`
  - `dynamodb:PutItem`
  - `dynamodb:UpdateItem`
  - `dynamodb:DeleteItem`
  - `dynamodb:Query`
  - `dynamodb:Scan`

**Environment Variables**:
- Never commit `.env` files
- Use AWS Secrets Manager for sensitive data
- Rotate credentials regularly

### Data Privacy

**PII Handling**:
- `user_id` stored in sessions (consider pseudonymization)
- No sensitive user data in requirement specs
- No payment information stored
- Session data expires after 24 hours (TTL)

---

## Monitoring and Observability

### CloudWatch Metrics

**DynamoDB Metrics**:
- `ConsumedReadCapacityUnits`
- `ConsumedWriteCapacityUnits`
- `ThrottledRequests`
- `UserErrors`
- `SystemErrors`

### Custom Metrics

**Application Metrics**:
- Session creation rate
- Session update rate
- Average session duration
- Clarification count distribution
- Workflow stage distribution

### Logging

**Structured Logging**:
- JSON format logs
- Include session_id, user_id in logs
- Log all database operations
- Log errors with stack traces

**Location**: `apps/orchestrator-service/app/core/logging_config.py`

---

## Backup and Recovery

### DynamoDB Backups

**Point-in-Time Recovery**:
- Enable PITR for production tables
- 35-day recovery window
- Automatic backups

**On-Demand Backups**:
- Create backups before major changes
- Store backups in S3
- Test restore procedures

### Disaster Recovery

**Strategy**:
- Multi-region replication (future)
- Regular backup testing
- Documented recovery procedures
- RTO: 1 hour (target)
- RPO: 5 minutes (target)

---

## Migration and Schema Evolution

### Schema Changes

**Current Approach**:
- Additive changes only (add new fields)
- Backward compatible changes
- No field deletions without migration

**Future Considerations**:
- Version fields for schema migration
- Migration scripts for data transformation
- Blue-green deployment for zero-downtime migrations

### Data Migration

**Tools**:
- AWS DMS (Database Migration Service)
- Custom Python scripts
- Boto3 batch operations

---

## Testing

### Unit Tests

**Repository Tests**:
- Mock DynamoDB responses
- Test all CRUD operations
- Test error handling
- Test serialization/deserialization

### Integration Tests

**DynamoDB Local**:
- Use DynamoDB Local for testing
- Test against real table structure
- Test access patterns
- Test TTL behavior

### Performance Tests

**Load Testing**:
- Test concurrent session creation
- Test session update performance
- Test query performance
- Test scan performance (with limits)

---

## Troubleshooting

### Common Issues

1. **Throttling Errors**
   - **Cause**: Exceeding provisioned capacity (if using provisioned mode)
   - **Solution**: Switch to on-demand mode or increase capacity

2. **Item Not Found**
   - **Cause**: TTL expired, wrong key, or item never created
   - **Solution**: Check TTL, verify key structure, check logs

3. **Serialization Errors**
   - **Cause**: Invalid JSON in stored fields
   - **Solution**: Validate data before storage, handle deserialization errors

4. **Connection Errors**
   - **Cause**: Network issues, incorrect credentials, wrong region
   - **Solution**: Check AWS credentials, verify region, check network connectivity

### Debugging

**Enable Debug Logging**:
```python
import logging
logging.getLogger('boto3').setLevel(logging.DEBUG)
logging.getLogger('botocore').setLevel(logging.DEBUG)
```

**CloudWatch Insights Queries**:
```
fields @timestamp, @message
| filter @message like /DynamoDB/
| sort @timestamp desc
| limit 100
```

---

## References

### Documentation
- [AWS DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)
- [Boto3 DynamoDB Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/dynamodb.html)
- [LangGraph Checkpoints](https://langchain-ai.github.io/langgraph/how-tos/persistence/)

### Code Files
- `apps/orchestrator-service/app/db/dynamodb.py` - Database operations
- `apps/orchestrator-service/app/models/schemas.py` - Data models
- `apps/orchestrator-service/app/core/aws_clients.py` - AWS client configuration
- `apps/orchestrator-service/app/core/config.py` - Configuration
- `infrastructure/cdk/stacks/orchestrator_stack.py` - Infrastructure as code

### Architecture Documents
- `ARCHITECTURE.md` - Overall system architecture
- `apps/orchestrator-service/README.md` - Orchestrator service documentation
- `apps/seller-crosspost-service/README.md` - Seller service documentation

---

## Summary

The TalknShop project uses **AWS DynamoDB** as its primary database system with three main tables:

1. **orchestrator-requests** - Session and conversation state (implemented)
2. **orchestrator-checkpoints** - LangGraph workflow checkpoints (planned)
3. **seller-crosspost-jobs** - Seller job tracking (planned)

All tables use **pay-per-request billing mode** for automatic scaling and cost efficiency. The implementation follows repository pattern with proper error handling and serialization. Future enhancements include Redis caching and PostgreSQL for local development.

---

**Document Version**: 1.0  
**Last Updated**: October 2025  
**Maintained By**: TalknShop Development Team

