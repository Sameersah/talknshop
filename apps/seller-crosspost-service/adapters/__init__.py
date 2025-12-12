"""
Marketplace posting adapters for seller-crosspost-service.

Each adapter handles marketplace-specific:
- Listing transformation
- API integration
- Image upload
- Status checking
"""

from .base_adapter import BaseMarketplaceAdapter
from .ebay_adapter import EbayAdapter
from .craigslist_adapter import CraigslistAdapter
from .facebook_adapter import FacebookAdapter

__all__ = [
    'BaseMarketplaceAdapter',
    'EbayAdapter',
    'CraigslistAdapter',
    'FacebookAdapter',
]






