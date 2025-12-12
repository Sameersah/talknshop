"""
Enumerations for the orchestrator service.

Defines workflow stages, event types, and other categorical values.
"""

from enum import Enum


class WorkflowStage(str, Enum):
    """Workflow execution stages."""
    
    INITIAL = "initial"
    MEDIA_PROCESSING = "media_processing"
    REQUIREMENT_BUILDING = "requirement_building"
    CLARIFICATION = "clarification"
    SEARCHING = "searching"
    RANKING = "ranking"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RequestType(str, Enum):
    """Type of user request."""
    
    SEARCH = "search"
    CHAT = "chat"
    CLARIFICATION = "clarification"


class EventType(str, Enum):
    """WebSocket event types."""
    
    # Server to client
    CONNECTED = "connected"
    PROGRESS = "progress"
    THINKING = "thinking"
    TOKEN = "token"
    CLARIFICATION = "clarification"
    RESULTS = "results"
    ERROR = "error"
    DONE = "done"
    PING = "ping"
    
    # Client to server
    MESSAGE = "message"
    ANSWER = "answer"
    PONG = "pong"
    DISCONNECT = "disconnect"


class MediaType(str, Enum):
    """Type of media content."""
    
    AUDIO = "audio"
    IMAGE = "image"
    VIDEO = "video"


class MarketplaceProvider(str, Enum):
    """Supported marketplace providers."""
    
    AMAZON = "amazon"
    WALMART = "walmart"
    EBAY = "ebay"
    KROGER = "kroger"
    TARGET = "target"


class ProductCondition(str, Enum):
    """Product condition."""
    
    NEW = "new"
    LIKE_NEW = "like_new"
    GOOD = "good"
    FAIR = "fair"
    REFURBISHED = "refurbished"


class ErrorSeverity(str, Enum):
    """Error severity levels."""
    
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"






