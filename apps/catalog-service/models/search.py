from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class Filters(BaseModel):
    """Search filters"""

    price_min: Optional[float] = None
    price_max: Optional[float] = None
    brands: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    platforms: Optional[List[str]] = Field(default=["amazon"], description="Platforms to search")

    class Config:
        json_schema_extra = {
            "example": {
                "price_min": 20.0,
                "price_max": 100.0,
                "brands": ["Apple", "Samsung"],
                "platforms": ["amazon"],
            }
        }


class Pagination(BaseModel):
    """Pagination parameters"""

    page: int = Field(default=1, ge=1, description="Page number")
    size: int = Field(default=20, ge=1, le=100, description="Items per page")

    class Config:
        json_schema_extra = {"example": {"page": 1, "size": 20}}


class SearchRequest(BaseModel):
    """Product search request"""

    query: str = Field(..., min_length=1, description="Search query")
    filters: Optional[Filters] = None
    pagination: Optional[Pagination] = None
    sort_by: Optional[str] = Field(default=None, description="Sort order: price_asc, price_desc, rating_desc, relevance")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "laptop",
                "filters": {"price_min": 200.0, "price_max": 500.0, "platforms": ["amazon"]},
                "pagination": {"page": 1, "size": 20},
                "sort_by": "price_asc",
            }
        }


class ShippingInfo(BaseModel):
    """Shipping information"""

    free_shipping: Optional[bool] = None
    delivery_time: Optional[str] = None


class Product(BaseModel):
    """Unified product model"""

    id: str = Field(..., description="Product ID")
    title: str = Field(..., description="Product title")
    brand: Optional[str] = None
    price: Optional[float] = None
    currency: str = Field(default="USD", description="Currency code")
    platform: str = Field(..., description="Platform name (amazon, etc.)")
    platform_id: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    image_url: Optional[str] = None
    availability: Optional[str] = None
    shipping_info: Optional[ShippingInfo] = None
    description: Optional[str] = None
    url: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "id": "amazon_B07ZPKBL9V",
                "title": "Apple iPhone 11, 64GB, Red",
                "brand": "Apple",
                "price": 299.99,
                "currency": "USD",
                "platform": "amazon",
                "platform_id": "B07ZPKBL9V",
                "rating": 4.5,
                "review_count": 1250,
                "image_url": "https://example.com/image.jpg",
                "availability": "in_stock",
            }
        }


class SearchResponse(BaseModel):
    """Product search response"""

    query: str = Field(..., description="Original search query")
    total_results: int = Field(..., description="Total number of results")
    page: int = Field(..., description="Current page number")
    size: int = Field(..., description="Number of items in this page")
    products: List[Product] = Field(default_factory=list, description="List of products")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Response timestamp")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "laptop",
                "total_results": 1250,
                "page": 1,
                "size": 20,
                "products": [],
                "timestamp": "2024-01-15T10:30:00Z",
            }
        }
