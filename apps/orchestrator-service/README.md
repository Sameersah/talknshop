# Orchestrator Service

The central coordination service for the TalknShop application. This FastAPI-based service acts as the main entry point and orchestrates communication between various backend services including media processing, catalog search, and response composition.

## Overview

The orchestrator service is responsible for:
- **Input Processing**: Parsing and validating user requests
- **Workflow Orchestration**: Coordinating the flow between different services
- **State Management**: Tracking conversation state and user sessions
- **Response Coordination**: Aggregating responses from multiple services
- **Error Handling**: Managing failures and fallback strategies

## Architecture

```
User Request → Orchestrator → Media Service
                           → Catalog Service  
                           → Response Composer
                           → User Response
```

## API Endpoints

### Health Check
- **GET** `/health` - Service health status
- **Response**: `{"status": "ok"}`

### Core Endpoints (To be implemented)
- **POST** `/api/v1/search` - Main search orchestration endpoint
- **POST** `/api/v1/chat` - Conversational interface
- **GET** `/api/v1/sessions/{session_id}` - Get session state
- **POST** `/api/v1/sessions/{session_id}/clarify` - Handle clarification requests

## Dependencies

- **FastAPI**: Web framework for building APIs
- **Uvicorn**: ASGI server for running the application
- **Pydantic**: Data validation and settings management
- **Boto3**: AWS SDK for Python
- **Python-dotenv**: Environment variable management

## Environment Variables

```bash
# Database
DYNAMODB_TABLE_NAME=orchestrator-requests
AWS_REGION=us-west-2

# Service URLs
MEDIA_SERVICE_URL=http://media-service:8001
CATALOG_SERVICE_URL=http://catalog-service:8002
RESPONSE_COMPOSER_URL=http://response-composer:8003

# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Application
LOG_LEVEL=INFO
DEBUG=false
```

## Local Development

### Prerequisites
- Python 3.11+
- Docker and Docker Compose
- AWS CLI configured (for DynamoDB access)

### Setup

1. **Create virtual environment**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run the service**:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Using Docker

```bash
# Build the image
docker build -t talknshop-orchestrator .

# Run the container
docker run -p 8000:8000 --env-file .env talknshop-orchestrator
```

### Using Docker Compose (Recommended)

From the monorepo root:
```bash
docker-compose up orchestrator-service
```

## Database Schema

### DynamoDB Table: `orchestrator-requests`

| Attribute | Type | Description |
|-----------|------|-------------|
| pk | String | Primary key (session_id) |
| sk | String | Sort key (timestamp or request_id) |
| user_id | String | User identifier |
| request_type | String | Type of request (search, chat, etc.) |
| status | String | Request status (pending, processing, completed, failed) |
| input_data | Map | Original request data |
| workflow_state | Map | Current workflow state |
| created_at | String | ISO timestamp |
| updated_at | String | ISO timestamp |

## Service Integration

### Media Service Integration
- **Purpose**: Handle audio transcription and image processing
- **Endpoints**: 
  - `POST /transcribe` - Audio transcription
  - `POST /extract-image-attributes` - Image analysis

### Catalog Service Integration
- **Purpose**: Search and retrieve product information
- **Endpoints**:
  - `POST /search` - Product search
  - `GET /products/{product_id}` - Product details

### Response Composer Integration
- **Purpose**: Format and rank responses
- **Endpoints**:
  - `POST /compose` - Compose final response
  - `POST /rank` - Rank search results

## Workflow States

1. **INITIAL**: Request received, parsing input
2. **MEDIA_PROCESSING**: Processing media files if present
3. **REQUIREMENT_BUILDING**: Building search requirements
4. **CLARIFICATION**: Waiting for user clarification
5. **SEARCHING**: Searching product catalogs
6. **RANKING**: Ranking and composing results
7. **COMPLETED**: Response ready
8. **FAILED**: Error occurred

## Error Handling

The service implements comprehensive error handling:

- **Validation Errors**: Invalid input data
- **Service Unavailable**: Downstream service failures
- **Timeout Errors**: Service response timeouts
- **Authentication Errors**: Invalid credentials
- **Rate Limiting**: Too many requests

## Monitoring and Logging

- **Health Checks**: Built-in health monitoring
- **Structured Logging**: JSON-formatted logs
- **Metrics**: Request/response timing, error rates
- **Tracing**: Distributed tracing for debugging

## Testing

```bash
# Run unit tests
pytest tests/

# Run integration tests
pytest tests/integration/

# Run with coverage
pytest --cov=app tests/
```

## Deployment

### AWS Deployment
1. **Build and push to ECR**:
   ```bash
   aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-west-2.amazonaws.com
   docker build -t talknshop-orchestrator .
   docker tag talknshop-orchestrator:latest <account>.dkr.ecr.us-west-2.amazonaws.com/talknshop-orchestrator:latest
   docker push <account>.dkr.ecr.us-west-2.amazonaws.com/talknshop-orchestrator:latest
   ```

2. **Deploy using CDK**:
   ```bash
   cd ../../infrastructure/cdk
   cdk deploy TalknShop-Orchestrator
   ```

### Environment-Specific Configuration

- **Development**: Local DynamoDB, mock services
- **Staging**: AWS DynamoDB, staging service URLs
- **Production**: AWS DynamoDB, production service URLs, enhanced monitoring

## API Documentation

Once the service is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass before submitting PR

## Troubleshooting

### Common Issues

1. **DynamoDB Connection Issues**:
   - Verify AWS credentials
   - Check AWS region configuration
   - Ensure table exists

2. **Service Communication Issues**:
   - Verify service URLs in environment variables
   - Check network connectivity
   - Review service logs

3. **Performance Issues**:
   - Monitor DynamoDB read/write capacity
   - Check service response times
   - Review memory usage

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=DEBUG
export DEBUG=true
```

## License

This project is part of the TalknShop application.
