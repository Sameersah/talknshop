"""
Custom exceptions and error handling for the orchestrator service.

Provides structured error hierarchy for different failure scenarios.
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class OrchestratorError(Exception):
    """Base exception for orchestrator errors."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


class ValidationError(OrchestratorError):
    """Raised when input validation fails."""
    pass


class ServiceUnavailableError(OrchestratorError):
    """Raised when an external service is unavailable."""
    pass


class ServiceTimeoutError(OrchestratorError):
    """Raised when a service request times out."""
    pass


class RateLimitError(OrchestratorError):
    """Raised when rate limit is exceeded."""
    pass


class AuthenticationError(OrchestratorError):
    """Raised when authentication fails."""
    pass


class SessionNotFoundError(OrchestratorError):
    """Raised when a session is not found."""
    pass


class WorkflowError(OrchestratorError):
    """Raised when workflow execution fails."""
    pass


class MediaProcessingError(OrchestratorError):
    """Raised when media processing fails."""
    pass


class CatalogSearchError(OrchestratorError):
    """Raised when catalog search fails."""
    pass


class BedrockError(OrchestratorError):
    """Raised when Bedrock API call fails."""
    pass


class DynamoDBError(OrchestratorError):
    """Raised when DynamoDB operation fails."""
    pass


class WebSocketError(OrchestratorError):
    """Raised when WebSocket operation fails."""
    pass


class MaxRetriesExceededError(OrchestratorError):
    """Raised when maximum retry attempts are exceeded."""
    pass


class ClarificationLimitError(OrchestratorError):
    """Raised when clarification loop limit is exceeded."""
    pass


def create_http_exception(
    status_code: int,
    message: str,
    details: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Create a FastAPI HTTPException with structured error response.
    
    Args:
        status_code: HTTP status code
        message: Error message
        details: Additional error details
    
    Returns:
        HTTPException: Formatted HTTP exception
    """
    return HTTPException(
        status_code=status_code,
        detail={
            "error": message,
            "details": details or {}
        }
    )


def map_error_to_http(error: Exception) -> HTTPException:
    """
    Map internal exceptions to HTTP exceptions.
    
    Args:
        error: Internal exception
    
    Returns:
        HTTPException: Corresponding HTTP exception
    """
    error_mapping = {
        ValidationError: (status.HTTP_400_BAD_REQUEST, "Validation failed"),
        SessionNotFoundError: (status.HTTP_404_NOT_FOUND, "Session not found"),
        AuthenticationError: (status.HTTP_401_UNAUTHORIZED, "Authentication failed"),
        RateLimitError: (status.HTTP_429_TOO_MANY_REQUESTS, "Rate limit exceeded"),
        ServiceUnavailableError: (status.HTTP_503_SERVICE_UNAVAILABLE, "Service unavailable"),
        ServiceTimeoutError: (status.HTTP_504_GATEWAY_TIMEOUT, "Service timeout"),
        WorkflowError: (status.HTTP_500_INTERNAL_SERVER_ERROR, "Workflow execution failed"),
        MediaProcessingError: (status.HTTP_500_INTERNAL_SERVER_ERROR, "Media processing failed"),
        CatalogSearchError: (status.HTTP_500_INTERNAL_SERVER_ERROR, "Catalog search failed"),
        BedrockError: (status.HTTP_500_INTERNAL_SERVER_ERROR, "AI service error"),
        DynamoDBError: (status.HTTP_500_INTERNAL_SERVER_ERROR, "Database error"),
        WebSocketError: (status.HTTP_500_INTERNAL_SERVER_ERROR, "WebSocket error"),
        MaxRetriesExceededError: (status.HTTP_503_SERVICE_UNAVAILABLE, "Maximum retries exceeded"),
        ClarificationLimitError: (status.HTTP_400_BAD_REQUEST, "Too many clarification attempts"),
    }
    
    for error_type, (status_code, default_message) in error_mapping.items():
        if isinstance(error, error_type):
            message = str(error) if str(error) else default_message
            details = getattr(error, 'details', {})
            return create_http_exception(status_code, message, details)
    
    # Default to internal server error
    return create_http_exception(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        str(error) or "Internal server error",
        {}
    )






