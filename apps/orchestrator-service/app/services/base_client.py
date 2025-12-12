"""
Base HTTP client with retry logic and error handling.

Provides a reusable async HTTP client for service-to-service communication.
"""

import logging
import asyncio
from typing import Optional, Dict, Any
from functools import wraps
import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)

from app.core.config import settings
from app.core.errors import ServiceUnavailableError, ServiceTimeoutError, MaxRetriesExceededError

logger = logging.getLogger(__name__)


class BaseServiceClient:
    """Base class for HTTP service clients with retry and error handling."""
    
    def __init__(self, base_url: str, service_name: str):
        self.base_url = base_url.rstrip('/')
        self.service_name = service_name
        self._client: Optional[httpx.AsyncClient] = None
        
        logger.info(
            f"Initializing {service_name} client",
            extra={"base_url": base_url}
        )
    
    async def __aenter__(self):
        """Async context manager entry."""
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(settings.http_timeout),
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100)
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()
    
    @property
    def client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(settings.http_timeout),
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=100)
            )
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
        before_sleep=before_sleep_log(logger, logging.WARNING)
    )
    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> httpx.Response:
        """
        Make HTTP request with retry logic.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint
            **kwargs: Additional request parameters
            
        Returns:
            httpx.Response: HTTP response
            
        Raises:
            ServiceUnavailableError: If service is unavailable
            ServiceTimeoutError: If request times out
            MaxRetriesExceededError: If max retries exceeded
        """
        url = f"{endpoint}" if endpoint.startswith('/') else f"/{endpoint}"
        
        try:
            logger.debug(
                f"{self.service_name} request: {method} {url}",
                extra={"method": method, "endpoint": endpoint}
            )
            
            response = await self.client.request(method, url, **kwargs)
            
            # Log response
            logger.debug(
                f"{self.service_name} response: {response.status_code}",
                extra={
                    "method": method,
                    "endpoint": endpoint,
                    "status_code": response.status_code
                }
            )
            
            # Raise for error status codes
            response.raise_for_status()
            
            return response
            
        except httpx.TimeoutException as e:
            logger.error(
                f"{self.service_name} request timeout: {endpoint}",
                extra={"endpoint": endpoint, "timeout": settings.http_timeout},
                exc_info=True
            )
            raise ServiceTimeoutError(
                f"{self.service_name} request timed out",
                details={"endpoint": endpoint, "timeout": settings.http_timeout}
            ) from e
        
        except httpx.HTTPStatusError as e:
            logger.error(
                f"{self.service_name} HTTP error: {e.response.status_code}",
                extra={
                    "endpoint": endpoint,
                    "status_code": e.response.status_code,
                    "response": e.response.text
                },
                exc_info=True
            )
            raise ServiceUnavailableError(
                f"{self.service_name} returned error: {e.response.status_code}",
                details={
                    "endpoint": endpoint,
                    "status_code": e.response.status_code,
                    "error": e.response.text
                }
            ) from e
        
        except (httpx.ConnectError, httpx.NetworkError) as e:
            logger.error(
                f"{self.service_name} connection error",
                extra={"endpoint": endpoint},
                exc_info=True
            )
            raise ServiceUnavailableError(
                f"Cannot connect to {self.service_name}",
                details={"endpoint": endpoint, "error": str(e)}
            ) from e
        
        except Exception as e:
            logger.error(
                f"{self.service_name} unexpected error",
                extra={"endpoint": endpoint},
                exc_info=True
            )
            raise ServiceUnavailableError(
                f"{self.service_name} request failed: {str(e)}",
                details={"endpoint": endpoint}
            ) from e
    
    async def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make GET request and return JSON."""
        response = await self._request("GET", endpoint, **kwargs)
        return response.json()
    
    async def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make POST request and return JSON."""
        response = await self._request("POST", endpoint, **kwargs)
        return response.json()
    
    async def put(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make PUT request and return JSON."""
        response = await self._request("PUT", endpoint, **kwargs)
        return response.json()
    
    async def delete(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make DELETE request and return JSON."""
        response = await self._request("DELETE", endpoint, **kwargs)
        return response.json()
    
    async def health_check(self) -> bool:
        """
        Check if service is healthy.
        
        Returns:
            bool: True if service is healthy
        """
        try:
            response = await self._request("GET", "/health", timeout=5.0)
            return response.status_code == 200
        except Exception as e:
            logger.warning(
                f"{self.service_name} health check failed",
                extra={"error": str(e)}
            )
            return False






