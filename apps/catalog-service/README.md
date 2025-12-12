# Catalog Service - Buyer Flow

A FastAPI service responsible for **product search and discovery** in the TalknShop buyer flow. This service integrates with multiple e-commerce marketplaces to provide unified product search, comparison, and ranking capabilities.

## 🎯 Overview

The catalog service handles the **READ operations** for the buyer flow:
- **Multi-Platform Search**: Search across eBay, Amazon, Walmart, Best Buy
- **Product Aggregation**: Combine results from multiple marketplaces
- **Intelligent Ranking**: Sort by price, rating, relevance
- **Product Comparison**: Compare products across different platforms
- **Price Tracking**: Monitor price changes and deals
- **Product Details**: Comprehensive product information
- **Fast Performance**: Synchronous search (1-3 seconds)

**Note**: For seller flow (posting listings), see [seller-crosspost-service](../seller-crosspost-service/)

## Architecture

```
Search Request → Catalog Service → Amazon API
                           → Walmart API
                           → Kroger API
                           → Other Retailers
                           → Aggregated Results
```

## API Endpoints

### Health Check
- **GET** `/health` - Service health status
- **Response**: `{"status": "ok"}`

### Core Endpoints (To be implemented)

#### Product Search
- **POST** `/api/v1/search` - Search products across platforms
  - **Input**: Search query, filters, pagination
  - **Response**: Aggregated product results
- **GET** `/api/v1/search/suggestions` - Get search suggestions
- **POST** `/api/v1/search/advanced` - Advanced search with filters

#### Product Details
- **GET** `/api/v1/products/{product_id}` - Get detailed product information
- **GET** `/api/v1/products/{product_id}/reviews` - Get product reviews
- **GET** `/api/v1/products/{product_id}/similar` - Get similar products
- **GET** `/api/v1/products/{product_id}/price-history` - Get price history

#### Platform Integration
- **GET** `/api/v1/platforms` - List available platforms
- **GET** `/api/v1/platforms/{platform}/categories` - Get platform categories
- **POST** `/api/v1/platforms/{platform}/sync` - Sync platform data

#### Product Comparison
- **POST** `/api/v1/compare` - Compare multiple products
- **GET** `/api/v1/compare/{comparison_id}` - Get comparison results
- **POST** `/api/v1/compare/save` - Save comparison for later

#### Price Tracking
- **POST** `/api/v1/price-alerts` - Create price alerts
- **GET** `/api/v1/price-alerts` - List user's price alerts
- **DELETE** `/api/v1/price-alerts/{alert_id}` - Delete price alert

## Dependencies

- **FastAPI**: Web framework for building APIs
- **Uvicorn**: ASGI server for running the application
- **Pydantic**: Data validation and settings management
- **Boto3**: AWS SDK for Python (for caching and storage)
- **Python-dotenv**: Environment variable management
- **Requests**: HTTP client for API calls
- **BeautifulSoup4**: HTML parsing for web scraping (if needed)
- **Redis**: Caching layer for performance
- **SQLAlchemy**: Database ORM (for local data storage)

## Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# External API Keys
AMAZON_API_KEY=your_amazon_key
AMAZON_SECRET_KEY=your_amazon_secret
WALMART_API_KEY=your_walmart_key
KROGER_API_KEY=your_kroger_key

# Service URLs
ORCHESTRATOR_SERVICE_URL=http://orchestrator-service:8000
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/catalog_db

# API Configuration
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100
CACHE_TTL=3600
RATE_LIMIT_PER_MINUTE=100

# Application
LOG_LEVEL=INFO
DEBUG=false
```

## Local Development

### Prerequisites
- Python 3.11+
- Docker and Docker Compose
- PostgreSQL (for local data storage)
- Redis (for caching)
- API keys for external services

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
   # Edit .env with your API keys and configuration
   ```

4. **Run the service**:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8002
   ```

### Using Docker

```bash
# Build the image
docker build -t talknshop-catalog .

# Run the container
docker run -p 8002:8002 --env-file .env talknshop-catalog
```

### Using Docker Compose (Recommended)

From the monorepo root:
```bash
docker-compose up catalog-service
```

## External API Integrations

### Amazon Product Advertising API
- **Purpose**: Search Amazon products
- **Features**: Product details, pricing, reviews, images
- **Rate Limits**: 1 request per second, 8,640 requests per day
- **Authentication**: AWS credentials + Associate Tag

### Walmart Open API
- **Purpose**: Search Walmart products
- **Features**: Product search, details, pricing
- **Rate Limits**: 5,000 requests per day
- **Authentication**: API key

### Kroger API
- **Purpose**: Search grocery items
- **Features**: Product search, store locations, pricing
- **Rate Limits**: 1,000 requests per day
- **Authentication**: OAuth 2.0

## Data Models

### Search Request
```json
{
  "query": "27 inch monitor",
  "filters": {
    "price_min": 200,
    "price_max": 500,
    "brands": ["Dell", "HP", "Samsung"],
    "categories": ["Electronics", "Computers"],
    "platforms": ["amazon", "walmart"]
  },
  "pagination": {
    "page": 1,
    "size": 20
  },
  "sort_by": "price_asc"
}
```

### Search Response
```json
{
  "query": "27 inch monitor",
  "total_results": 1250,
  "page": 1,
  "size": 20,
  "products": [
    {
      "id": "prod_123",
      "title": "Dell 27-inch 4K Monitor",
      "brand": "Dell",
      "price": 299.99,
      "currency": "USD",
      "platform": "amazon",
      "platform_id": "B08XYZ123",
      "rating": 4.5,
      "review_count": 1250,
      "image_url": "https://example.com/image.jpg",
      "availability": "in_stock",
      "shipping_info": {
        "free_shipping": true,
        "delivery_time": "2-3 days"
      },
      "features": ["4K Resolution", "USB-C", "Adjustable Stand"],
      "specifications": {
        "screen_size": "27 inches",
        "resolution": "3840x2160",
        "refresh_rate": "60Hz"
      }
    }
  ],
  "facets": {
    "brands": [
      {"name": "Dell", "count": 450},
      {"name": "HP", "count": 320}
    ],
    "price_ranges": [
      {"range": "200-300", "count": 600},
      {"range": "300-400", "count": 400}
    ]
  }
}
```

### Product Details
```json
{
  "id": "prod_123",
  "title": "Dell 27-inch 4K Monitor",
  "description": "High-quality 4K monitor with USB-C connectivity...",
  "brand": "Dell",
  "model": "S2721QS",
  "price": {
    "current": 299.99,
    "original": 399.99,
    "currency": "USD",
    "discount_percentage": 25
  },
  "availability": {
    "status": "in_stock",
    "quantity": 15,
    "backorder_available": false
  },
  "images": [
    {
      "url": "https://example.com/image1.jpg",
      "alt": "Front view",
      "primary": true
    }
  ],
  "specifications": {
    "screen_size": "27 inches",
    "resolution": "3840x2160",
    "refresh_rate": "60Hz",
    "response_time": "4ms",
    "connectivity": ["HDMI", "DisplayPort", "USB-C"]
  },
  "reviews": {
    "average_rating": 4.5,
    "total_reviews": 1250,
    "rating_distribution": {
      "5": 650,
      "4": 400,
      "3": 150,
      "2": 30,
      "1": 20
    }
  },
  "shipping": {
    "free_shipping": true,
    "estimated_delivery": "2-3 business days",
    "shipping_cost": 0.00
  }
}
```

## Search Features

### Intelligent Search
- **Query Processing**: Natural language query understanding
- **Spell Correction**: Automatic spelling correction
- **Synonyms**: Handle product synonyms and variations
- **Fuzzy Matching**: Find products with similar names

### Filtering and Sorting
- **Price Filters**: Min/max price ranges
- **Brand Filters**: Filter by specific brands
- **Category Filters**: Filter by product categories
- **Rating Filters**: Filter by minimum ratings
- **Availability Filters**: In-stock, on-sale, etc.

### Sorting Options
- **Price**: Low to high, high to low
- **Rating**: Highest rated first
- **Relevance**: Most relevant results first
- **Newest**: Recently added products
- **Popularity**: Most viewed/purchased

## Caching Strategy

### Redis Caching
- **Search Results**: Cache popular searches
- **Product Details**: Cache frequently accessed products
- **API Responses**: Cache external API responses
- **TTL**: Configurable cache expiration times

### Cache Keys
```
search:{query_hash}:{filters_hash}:{page}
product:{platform}:{product_id}
suggestions:{query_prefix}
```

## Performance Optimization

### Database Optimization
- **Indexing**: Optimized database indexes
- **Query Optimization**: Efficient database queries
- **Connection Pooling**: Reuse database connections
- **Read Replicas**: Distribute read operations

### API Optimization
- **Rate Limiting**: Prevent API abuse
- **Request Batching**: Batch multiple API calls
- **Response Compression**: Compress large responses
- **Pagination**: Efficient pagination implementation

## Error Handling

### API Error Scenarios
- **External API Failures**: Handle third-party API errors
- **Rate Limiting**: Handle API rate limit exceeded
- **Invalid Responses**: Handle malformed API responses
- **Network Timeouts**: Handle network connectivity issues

### Error Response Format
```json
{
  "error": {
    "code": "EXTERNAL_API_ERROR",
    "message": "Failed to fetch products from Amazon",
    "details": {
      "platform": "amazon",
      "error_code": "RATE_LIMIT_EXCEEDED",
      "retry_after": 60
    }
  }
}
```

## Monitoring and Analytics

### Metrics
- **Search Volume**: Number of searches per day
- **API Usage**: External API call statistics
- **Response Times**: Average response times
- **Error Rates**: Success vs failure rates
- **Cache Hit Rates**: Cache effectiveness

### Logging
- **Search Queries**: Log all search queries
- **API Calls**: Log external API interactions
- **Performance**: Log response times and bottlenecks
- **Errors**: Detailed error logging

## Testing

### Unit Tests
```bash
pytest tests/unit/
```

### Integration Tests
```bash
pytest tests/integration/
```

### API Tests
```bash
pytest tests/api/
```

### Load Testing
```bash
# Test with high search volume
pytest tests/load/
```

## Deployment

### AWS Deployment
1. **Build and push to ECR**:
   ```bash
   aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-west-2.amazonaws.com
   docker build -t talknshop-catalog .
   docker tag talknshop-catalog:latest <account>.dkr.ecr.us-west-2.amazonaws.com/talknshop-catalog:latest
   docker push <account>.dkr.ecr.us-west-2.amazonaws.com/talknshop-catalog:latest
   ```

2. **Deploy using CDK**:
   ```bash
   cd ../../infrastructure/cdk
   cdk deploy TalknShop-Catalog
   ```

### Environment-Specific Configuration

- **Development**: Mock external APIs, local database
- **Staging**: Limited external API access, staging database
- **Production**: Full external API access, production database

## Security Considerations

### API Security
- **Authentication**: JWT token validation
- **Rate Limiting**: Prevent API abuse
- **Input Validation**: Strict input validation
- **CORS**: Configure cross-origin requests

### Data Security
- **Encryption**: Encrypt sensitive data
- **Access Control**: Secure database access
- **Audit Logging**: Log all data access

## API Documentation

Once the service is running, visit:
- **Swagger UI**: http://localhost:8002/docs
- **ReDoc**: http://localhost:8002/redoc

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass before submitting PR
5. Test with various search scenarios

## Troubleshooting

### Common Issues

1. **External API Issues**:
   - Verify API keys and credentials
   - Check rate limits and quotas
   - Review API documentation changes

2. **Database Issues**:
   - Check database connectivity
   - Verify database schema
   - Review query performance

3. **Cache Issues**:
   - Check Redis connectivity
   - Verify cache configuration
   - Review cache hit rates

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=DEBUG
export DEBUG=true
```

## License

This project is part of the TalknShop application.
