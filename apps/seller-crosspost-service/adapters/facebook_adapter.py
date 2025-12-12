"""
Facebook Marketplace posting adapter.

Handles Facebook-specific listing transformation and API integration.
"""

import logging
from typing import Dict, Any
from datetime import datetime

from .base_adapter import BaseMarketplaceAdapter

logger = logging.getLogger(__name__)


class FacebookAdapter(BaseMarketplaceAdapter):
    """Facebook Marketplace posting adapter."""
    
    @property
    def marketplace_name(self) -> str:
        return "facebook"
    
    @property
    def max_images(self) -> int:
        return 10
    
    @property
    def max_title_length(self) -> int:
        return 100
    
    async def validate_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        """Validate listing for Facebook requirements."""
        errors = []
        warnings = []
        
        # Facebook requires location
        location = listing_spec.get("location", {})
        if not location.get("city") or not location.get("state"):
            errors.append("City and state are required for Facebook Marketplace")
        
        # Images
        if len(listing_spec.get("media_s3_keys", [])) > 10:
            warnings.append("Only first 10 images will be used (Facebook limit)")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    async def transform_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        """Transform to Facebook Marketplace listing format."""
        
        location = listing_spec.get("location", {})
        
        payload = {
            "name": self._truncate_title(listing_spec["title"]),
            "description": listing_spec["description"],
            "price": listing_spec["price"],
            "currency": listing_spec.get("currency", "USD"),
            "condition": self._map_condition_facebook(listing_spec.get("condition")),
            "category": self._map_category_to_facebook(listing_spec.get("category", "")),
            "location": {
                "city": location.get("city"),
                "state": location.get("state"),
                "zip": location.get("zip")
            },
            "delivery_options": self._map_shipping_options(listing_spec.get("shipping_options", [])),
        }
        
        return payload
    
    async def upload_images(self, s3_keys: list) -> list:
        """Upload images for Facebook."""
        # TODO: Implement actual upload
        return self._limit_images(s3_keys)
    
    async def post_listing(self, marketplace_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Post listing to Facebook Marketplace API."""
        try:
            logger.info(f"Posting to Facebook: {marketplace_payload.get('name')}")
            
            # Simulate API delay
            import asyncio
            await asyncio.sleep(1)
            
            listing_id = f"fb_{int(datetime.utcnow().timestamp())}"
            
            return {
                "success": True,
                "listing_id": listing_id,
                "confirmation_link": f"https://www.facebook.com/marketplace/item/{listing_id}",
                "posted_at": datetime.utcnow().isoformat(),
                "status": "pending_review"  # Facebook often requires review
            }
        except Exception as e:
            logger.error(f"Facebook posting failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_code": "FACEBOOK_ERROR"
            }
    
    async def get_listing_status(self, listing_id: str) -> Dict[str, Any]:
        """Check Facebook listing status."""
        return {
            "listing_id": listing_id,
            "status": "live",
            "views": 0,
            "last_updated": datetime.utcnow().isoformat()
        }
    
    async def update_listing(self, listing_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update Facebook listing."""
        return {"success": False, "error": "Not implemented"}
    
    async def delete_listing(self, listing_id: str) -> Dict[str, Any]:
        """Delete Facebook listing."""
        return {"success": False, "error": "Not implemented"}
    
    def _map_condition_facebook(self, condition: str) -> str:
        """Map condition to Facebook values."""
        condition_map = {
            "new": "NEW",
            "like_new": "LIKE_NEW",
            "good": "GOOD",
            "fair": "FAIR",
            "poor": "POOR"
        }
        return condition_map.get(condition.lower(), "USED")
    
    def _map_category_to_facebook(self, generic_category: str) -> str:
        """Map generic category to Facebook category ID."""
        category_map = {
            "Electronics > Smartphones": "219",
            "Electronics > Laptops": "190",
            # ... more categories
        }
        return category_map.get(generic_category, "1")  # Default
    
    def _map_shipping_options(self, options: list) -> list:
        """Map shipping options to Facebook format."""
        fb_options = []
        if "local_pickup" in options:
            fb_options.append("LOCAL_PICKUP")
        if "shipping" in options:
            fb_options.append("SHIPPING")
        return fb_options or ["LOCAL_PICKUP"]






