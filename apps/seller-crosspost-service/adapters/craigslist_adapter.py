"""
Craigslist marketplace posting adapter.

Handles Craigslist-specific listing transformation and API integration.
"""

import logging
from typing import Dict, Any
from datetime import datetime

from .base_adapter import BaseMarketplaceAdapter

logger = logging.getLogger(__name__)


class CraigslistAdapter(BaseMarketplaceAdapter):
    """Craigslist marketplace posting adapter."""
    
    @property
    def marketplace_name(self) -> str:
        return "craigslist"
    
    @property
    def max_images(self) -> int:
        return 8
    
    @property
    def max_title_length(self) -> int:
        return 70
    
    async def validate_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        """Validate listing for Craigslist requirements."""
        errors = []
        warnings = []
        
        # Craigslist requires ZIP code
        location = listing_spec.get("location", {})
        if not location.get("zip"):
            errors.append("ZIP code is required for Craigslist")
        
        # Title length
        if len(listing_spec.get("title", "")) > 70:
            warnings.append("Title will be truncated to 70 characters")
        
        # Images
        if len(listing_spec.get("media_s3_keys", [])) > 8:
            warnings.append("Only first 8 images will be used (Craigslist limit)")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    async def transform_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        """Transform to Craigslist listing format."""
        
        location = listing_spec.get("location", {})
        
        payload = {
            "posting_title": self._truncate_title(listing_spec["title"]),
            "price": int(listing_spec["price"]),  # Craigslist wants integer
            "body": listing_spec["description"],
            "category": self._map_category_to_craigslist(listing_spec.get("category", "")),
            "postal_code": location.get("zip"),
            "contact_email": "hidden",  # Use Craigslist relay
            "contact_phone": None,  # Optional
        }
        
        return payload
    
    async def upload_images(self, s3_keys: list) -> list:
        """Upload images for Craigslist."""
        # TODO: Implement actual upload
        return self._limit_images(s3_keys)
    
    async def post_listing(self, marketplace_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Post listing to Craigslist API."""
        try:
            logger.info(f"Posting to Craigslist: {marketplace_payload.get('posting_title')}")
            
            # Simulate API delay
            import asyncio
            await asyncio.sleep(1.5)
            
            listing_id = f"cl_{int(datetime.utcnow().timestamp())}"
            
            return {
                "success": True,
                "listing_id": listing_id,
                "confirmation_link": f"https://sfbay.craigslist.org/sfc/mob/d/{listing_id}.html",
                "posted_at": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Craigslist posting failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_code": "CRAIGSLIST_ERROR"
            }
    
    async def get_listing_status(self, listing_id: str) -> Dict[str, Any]:
        """Check Craigslist listing status."""
        return {
            "listing_id": listing_id,
            "status": "live",
            "last_updated": datetime.utcnow().isoformat()
        }
    
    async def update_listing(self, listing_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update Craigslist listing."""
        return {"success": False, "error": "Not implemented"}
    
    async def delete_listing(self, listing_id: str) -> Dict[str, Any]:
        """Delete Craigslist listing."""
        return {"success": False, "error": "Not implemented"}
    
    def _map_category_to_craigslist(self, generic_category: str) -> str:
        """Map generic category to Craigslist category slug."""
        category_map = {
            "Electronics > Smartphones": "mob",
            "Electronics > Laptops": "sys",
            "Electronics > Monitors": "ele",
            # ... more categories
        }
        return category_map.get(generic_category, "for")  # Default: for sale






