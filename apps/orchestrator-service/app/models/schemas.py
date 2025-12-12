"""
Pydantic models for the orchestrator service.

Defines data schemas for requests, responses, and internal state.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from typing_extensions import TypedDict
from pydantic import BaseModel, Field, validator

from app.models.enums import (
    WorkflowStage,
    RequestType,
    EventType,
    MediaType,
    MarketplaceProvider,
    ProductCondition,
    ErrorSeverity
)


# ===== Request/Response Models =====

class MediaReference(BaseModel):
    """Reference to uploaded media file."""
    
    media_type: MediaType
    s3_key: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime


class TurnInput(BaseModel):
    """User input for a single turn."""
    
    message: str = Field(..., min_length=1, max_length=5000, description="User message")
    media: List[MediaReference] = Field(default_factory=list, description="Optional media files")
    session_id: Optional[str] = Field(default=None, description="Session ID for continuation")
    user_id: str = Field(..., description="User identifier")
    
    @validator('message')
    def validate_message(cls, v: str) -> str:
        """Validate and clean message."""
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty")
        return v


class ClarificationResponse(BaseModel):
    """User response to clarification question."""
    
    answer: str = Field(..., min_length=1, max_length=2000)
    session_id: str
    
    @validator('answer')
    def validate_answer(cls, v: str) -> str:
        """Validate and clean answer."""
        v = v.strip()
        if not v:
            raise ValueError("Answer cannot be empty")
        return v


# ===== Requirement Spec Models =====

class PriceFilter(BaseModel):
    """Price filter criteria."""
    
    min: Optional[float] = Field(default=None, ge=0, description="Minimum price")
    max: Optional[float] = Field(default=None, ge=0, description="Maximum price")
    currency: str = Field(default="USD", description="Currency code")
    
    @validator('max')
    def validate_max_price(cls, v: Optional[float], values: dict) -> Optional[float]:
        """Validate max price is greater than min."""
        if v is not None and 'min' in values and values['min'] is not None:
            if v < values['min']:
                raise ValueError("Maximum price must be greater than minimum price")
        return v


class RequirementSpec(BaseModel):
    """Structured product search requirements."""
    
    product_type: str = Field(..., description="Type of product (e.g., 'laptop', 'phone')")
    attributes: Dict[str, Any] = Field(default_factory=dict, description="Product attributes")
    filters: Dict[str, Any] = Field(default_factory=dict, description="Search filters")
    price: Optional[PriceFilter] = Field(default=None, description="Price filter")
    brand_preferences: List[str] = Field(default_factory=list, description="Preferred brands")
    rating_min: Optional[float] = Field(default=None, ge=0, le=5, description="Minimum rating")
    condition: Optional[ProductCondition] = Field(default=None, description="Product condition")
    marketplaces: List[MarketplaceProvider] = Field(
        default_factory=lambda: [MarketplaceProvider.AMAZON, MarketplaceProvider.WALMART],
        description="Target marketplaces"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
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
                    "max": 1200,
                    "currency": "USD"
                },
                "brand_preferences": ["Apple", "Dell", "Lenovo"],
                "rating_min": 4.2,
                "condition": "new"
            }
        }


# ===== Product Models =====

class ProductResult(BaseModel):
    """Single product result."""
    
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
    why_ranked: Optional[str] = None  # Explanation for ranking


class SearchResults(BaseModel):
    """Aggregated search results."""
    
    products: List[ProductResult]
    total_count: int
    requirement_spec: RequirementSpec
    search_metadata: Dict[str, Any] = Field(default_factory=dict)
    marketplaces_searched: List[MarketplaceProvider]
    search_duration_ms: int


# ===== Session Models =====

class SessionState(BaseModel):
    """Conversation session state."""
    
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
    
    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "sess_123abc",
                "user_id": "user_456",
                "workflow_stage": "requirement_building",
                "request_type": "chat",
                "clarification_count": 0,
                "created_at": "2025-10-24T10:00:00Z",
                "updated_at": "2025-10-24T10:05:00Z"
            }
        }


# ===== WebSocket Event Models =====

class ClientMessage(BaseModel):
    """Message from client to server."""
    
    type: EventType
    message: Optional[str] = None
    media: List[MediaReference] = Field(default_factory=list)
    session_id: Optional[str] = None


class ServerEvent(BaseModel):
    """Event from server to client."""
    
    type: EventType
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    session_id: Optional[str] = None


class ProgressEvent(BaseModel):
    """Progress update event data."""
    
    step: str
    message: str
    progress_percent: Optional[int] = Field(default=None, ge=0, le=100)


class TokenEvent(BaseModel):
    """LLM token streaming event data."""
    
    content: str
    is_complete: bool = False


class ClarificationEvent(BaseModel):
    """Clarification question event data."""
    
    question: str
    context: Optional[str] = None
    suggestions: List[str] = Field(default_factory=list)


class ErrorEvent(BaseModel):
    """Error event data."""
    
    error: str
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
    recoverable: bool = True
    details: Dict[str, Any] = Field(default_factory=dict)


# ===== LangGraph State =====

class WorkflowState(TypedDict, total=False):
    """
    LangGraph workflow state.
    
    Note: TypedDict is used for LangGraph state, not Pydantic BaseModel.
    """
    
    # Input
    session_id: str
    user_id: str
    message: str
    media: List[Dict[str, Any]]
    
    # Intermediate state
    workflow_stage: WorkflowStage
    transcript: Optional[str]
    image_attributes: Optional[Dict[str, Any]]
    requirement_spec: Optional[Dict[str, Any]]
    needs_clarification: bool
    clarification_question: Optional[str]
    clarification_count: int
    
    # Search results
    raw_search_results: Optional[List[Dict[str, Any]]]
    ranked_results: Optional[List[Dict[str, Any]]]
    final_results: Optional[Dict[str, Any]]
    
    # Metadata
    error: Optional[str]
    metadata: Dict[str, Any]


# ===== Media Processing Models =====

class TranscriptionResult(BaseModel):
    """Audio transcription result."""
    
    transcript: str
    confidence: float = Field(ge=0, le=1)
    language: str = "en"
    duration_seconds: Optional[float] = None
    segments: List[Dict[str, Any]] = Field(default_factory=list)


class ImageAttributes(BaseModel):
    """Image analysis result."""
    
    labels: List[str] = Field(default_factory=list)
    objects: List[Dict[str, Any]] = Field(default_factory=list)
    text: List[str] = Field(default_factory=list)
    dominant_colors: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ===== API Response Models =====

class HealthResponse(BaseModel):
    """Health check response."""
    
    status: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    version: str
    environment: str
    aws_services: Optional[Dict[str, bool]] = None


class SessionResponse(BaseModel):
    """Session information response."""
    
    session: SessionState
    active: bool
    connection_count: int = 0


class ErrorResponse(BaseModel):
    """Standard error response."""
    
    error: str
    details: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    request_id: Optional[str] = None






