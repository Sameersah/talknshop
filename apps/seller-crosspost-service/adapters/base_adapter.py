"""
Base adapter interface for marketplace posting.

All marketplace adapters must implement this interface.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from datetime import datetime


class BaseMarketplaceAdapter(ABC):
    """Base interface for all marketplace posting adapters."""
    
    def __init__(self, api_key: Optional[str] = None, **kwargs):
        """
        Initialize adapter with credentials.
        
        Args:
            api_key: Marketplace API key
            **kwargs: Additional marketplace-specific credentials
        """
        self.api_key = api_key
        self.credentials = kwargs
    
    @property
    @abstractmethod
    def marketplace_name(self) -> str:
        """Return marketplace name."""
        pass
    
    @property
    @abstractmethod
    def max_images(self) -> int:
        """Return maximum number of images allowed."""
        pass
    
    @property
    @abstractmethod
    def max_title_length(self) -> int:
        """Return maximum title length."""
        pass
    
    @abstractmethod
    async def validate_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate listing meets marketplace-specific requirements.
        
        Args:
            listing_spec: Generic listing specification
            
        Returns:
            {
                "valid": bool,
                "errors": List[str],  # If not valid
                "warnings": List[str]  # Optional warnings
            }
        """
        pass
    
    @abstractmethod
    async def transform_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform generic listing to marketplace-specific format.
        
        Args:
            listing_spec: Generic listing specification
            
        Returns:
            Marketplace-specific payload ready for API
        """
        pass
    
    @abstractmethod
    async def upload_images(self, s3_keys: list) -> list:
        """
        Upload images to marketplace CDN.
        
        Args:
            s3_keys: List of S3 image keys
            
        Returns:
            List of marketplace image URLs
        """
        pass
    
    @abstractmethod
    async def post_listing(self, marketplace_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Post listing to marketplace API.
        
        Args:
            marketplace_payload: Marketplace-specific listing data
            
        Returns:
            {
                "success": bool,
                "listing_id": str,  # If success
                "confirmation_link": str,  # If success
                "error": str,  # If not success
                "error_code": str  # If not success
            }
        """
        pass
    
    @abstractmethod
    async def get_listing_status(self, listing_id: str) -> Dict[str, Any]:
        """
        Check listing status on marketplace.
        
        Args:
            listing_id: Marketplace-specific listing ID
            
        Returns:
            {
                "listing_id": str,
                "status": str,  # "live", "pending", "expired", "removed"
                "views": int,  # Optional
                "last_updated": str  # ISO timestamp
            }
        """
        pass
    
    @abstractmethod
    async def update_listing(
        self,
        listing_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update an existing listing.
        
        Args:
            listing_id: Marketplace-specific listing ID
            updates: Fields to update
            
        Returns:
            {
                "success": bool,
                "updated_at": str,
                "error": str  # If not success
            }
        """
        pass
    
    @abstractmethod
    async def delete_listing(self, listing_id: str) -> Dict[str, Any]:
        """
        Delete/end a listing.
        
        Args:
            listing_id: Marketplace-specific listing ID
            
        Returns:
            {
                "success": bool,
                "deleted_at": str,
                "error": str  # If not success
            }
        """
        pass
    
    def _map_condition(self, condition: str) -> str:
        """
        Map generic condition to marketplace-specific condition.
        
        Override in subclass if needed.
        """
        condition_map = {
            "new": "NEW",
            "like_new": "LIKE_NEW",
            "good": "GOOD",
            "fair": "FAIR",
            "poor": "POOR"
        }
        return condition_map.get(condition.lower(), "USED")
    
    def _truncate_title(self, title: str) -> str:
        """Truncate title to marketplace maximum."""
        if len(title) <= self.max_title_length:
            return title
        return title[:self.max_title_length - 3] + "..."
    
    def _limit_images(self, image_urls: list) -> list:
        """Limit images to marketplace maximum."""
        return image_urls[:self.max_images]






