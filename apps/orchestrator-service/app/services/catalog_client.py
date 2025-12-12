"""
Catalog service client for product search and retrieval.

Handles communication with the catalog-service for marketplace searches.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from app.core.config import settings
from app.core.errors import CatalogSearchError
from app.models.schemas import RequirementSpec, ProductResult, SearchResults
from app.models.enums import MarketplaceProvider
from app.services.base_client import BaseServiceClient

logger = logging.getLogger(__name__)


class CatalogServiceClient(BaseServiceClient):
    """Client for catalog/marketplace search service."""
    
    def __init__(self, base_url: Optional[str] = None):
        super().__init__(
            base_url=base_url or settings.catalog_service_url,
            service_name="catalog-service"
        )
    
    async def search_products(
        self,
        requirement_spec: RequirementSpec,
        limit: int = 20,
        timeout: Optional[float] = None
    ) -> SearchResults:
        """
        Search for products across marketplaces.
        
        Args:
            requirement_spec: Product search requirements
            limit: Maximum number of results per marketplace
            timeout: Request timeout override
            
        Returns:
            SearchResults: Aggregated search results
            
        Raises:
            CatalogSearchError: If search fails
        """
        try:
            start_time = datetime.utcnow()
            
            logger.info(
                "Searching products",
                extra={
                    "product_type": requirement_spec.product_type,
                    "marketplaces": [m.value for m in requirement_spec.marketplaces],
                    "limit": limit
                }
            )
            
            payload = {
                "requirement_spec": requirement_spec.model_dump(),
                "limit": limit,
                "marketplaces": [m.value for m in requirement_spec.marketplaces]
            }
            
            request_kwargs = {"json": payload}
            if timeout:
                request_kwargs["timeout"] = timeout
            else:
                # Use longer timeout for search operations
                request_kwargs["timeout"] = 60.0
            
            # Use orchestrator-compatible endpoint on catalog-service
            response = await self.post(
                "/api/v1/search/orchestrator",
                **request_kwargs
            )
            
            products = []
            for product_data in response.get("products", []):
                try:
                    platform_raw = product_data.get("platform") or "amazon"
                    marketplace = MarketplaceProvider(platform_raw) if platform_raw in MarketplaceProvider._value2member_map_ else MarketplaceProvider.AMAZON
                    deep_link = product_data.get("url") or product_data.get("image_url") or ""
                    marketplace_url = deep_link
                    price_val = product_data.get("price")
                    price = float(price_val) if price_val is not None else 0.0
                    availability = product_data.get("availability") or "unknown"
                    product_id = product_data.get("id") or product_data.get("platform_id") or f"{marketplace.value}_{product_data.get('title','item')}"

                    products.append(
                        ProductResult(
                            product_id=product_id,
                            marketplace=marketplace,
                            title=product_data.get("title", "Unknown Product"),
                            description=product_data.get("description"),
                            price=price,
                            currency=product_data.get("currency", "USD"),
                            rating=product_data.get("rating"),
                            review_count=product_data.get("review_count"),
                            condition=None,
                            availability=availability,
                            image_url=product_data.get("image_url"),
                            deep_link=deep_link,
                            marketplace_url=marketplace_url,
                            seller_name=product_data.get("brand"),
                            attributes=product_data.get("attributes", {}),
                        )
                    )
                except Exception as e:
                    logger.warning(
                        "Skipping product due to mapping error",
                        extra={"product_data": product_data, "error": str(e)},
                    )
            
            # Calculate search duration
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            search_results = SearchResults(
                products=products,
                total_count=response.get("total_count", len(products)),
                requirement_spec=requirement_spec,
                search_metadata=response.get("metadata", {}),
                marketplaces_searched=[
                    MarketplaceProvider(m) for m in response.get("marketplaces_searched", [])
                ],
                search_duration_ms=duration_ms
            )
            
            logger.info(
                "Product search completed",
                extra={
                    "product_count": len(products),
                    "duration_ms": duration_ms,
                    "marketplaces": len(search_results.marketplaces_searched)
                }
            )
            
            return search_results
            
        except Exception as e:
            logger.error(
                f"Product search failed: {str(e)}",
                extra={"product_type": requirement_spec.product_type},
                exc_info=True
            )
            raise CatalogSearchError(
                f"Failed to search products: {str(e)}",
                details={"product_type": requirement_spec.product_type}
            ) from e
    
    async def get_product_details(
        self,
        product_id: str,
        marketplace: MarketplaceProvider
    ) -> Dict[str, Any]:
        """
        Get detailed information for a specific product.
        
        Args:
            product_id: Product identifier
            marketplace: Marketplace provider
            
        Returns:
            dict: Product details
            
        Raises:
            CatalogSearchError: If retrieval fails
        """
        try:
            logger.debug(
                "Fetching product details",
                extra={"product_id": product_id, "marketplace": marketplace.value}
            )
            
            response = await self.get(
                f"/api/v1/products/{product_id}",
                params={"marketplace": marketplace.value}
            )
            
            logger.debug(
                "Product details retrieved",
                extra={"product_id": product_id}
            )
            
            return response
            
        except Exception as e:
            logger.error(
                f"Failed to get product details: {str(e)}",
                extra={"product_id": product_id},
                exc_info=True
            )
            raise CatalogSearchError(
                f"Failed to get product details: {str(e)}",
                details={"product_id": product_id}
            ) from e
    
    async def rank_products(
        self,
        products: List[ProductResult],
        requirement_spec: RequirementSpec,
        ranking_criteria: Optional[Dict[str, Any]] = None
    ) -> List[ProductResult]:
        """
        Rank and sort products based on criteria.
        
        Args:
            products: List of products to rank
            requirement_spec: Original requirements
            ranking_criteria: Custom ranking criteria
            
        Returns:
            List[ProductResult]: Ranked products
            
        Raises:
            CatalogSearchError: If ranking fails
        """
        try:
            logger.debug(f"Ranking {len(products)} products")
            
            payload = {
                "products": [p.model_dump() for p in products],
                "requirement_spec": requirement_spec.model_dump(),
                "criteria": ranking_criteria or {
                    "price_weight": 0.3,
                    "rating_weight": 0.3,
                    "relevance_weight": 0.4
                }
            }
            
            response = await self.post(
                "/api/v1/rank",
                json=payload
            )
            
            ranked_products = [
                ProductResult(**product_data)
                for product_data in response.get("products", [])
            ]
            
            logger.debug(f"Products ranked successfully")
            
            return ranked_products
            
        except Exception as e:
            logger.error(
                f"Failed to rank products: {str(e)}",
                exc_info=True
            )
            # Return original list if ranking fails
            logger.warning("Returning unranked products due to ranking failure")
            return products
    
    async def get_price_history(
        self,
        product_id: str,
        marketplace: MarketplaceProvider,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get price history for a product.
        
        Args:
            product_id: Product identifier
            marketplace: Marketplace provider
            days: Number of days of history
            
        Returns:
            list: Price history data points
            
        Raises:
            CatalogSearchError: If retrieval fails
        """
        try:
            logger.debug(
                "Fetching price history",
                extra={"product_id": product_id, "days": days}
            )
            
            response = await self.get(
                f"/api/v1/products/{product_id}/price-history",
                params={
                    "marketplace": marketplace.value,
                    "days": days
                }
            )
            
            return response.get("history", [])
            
        except Exception as e:
            logger.warning(
                f"Failed to get price history: {str(e)}",
                extra={"product_id": product_id}
            )
            # Return empty list if price history unavailable
            return []


# Global catalog client instance
catalog_client = CatalogServiceClient()






