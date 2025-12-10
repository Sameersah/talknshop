import aiohttp
import logging
from typing import List, Optional, Dict, Any
from models.search import Product, ShippingInfo

logger = logging.getLogger(__name__)


class RapidAPIAmazonClient:
    """Client for RapidAPI Amazon Product API"""
    
    BASE_URL = "https://real-time-amazon-data.p.rapidapi.com"
    RAPIDAPI_HOST = "real-time-amazon-data.p.rapidapi.com"
    
    def __init__(self, api_key: str):
        """
        Initialize RapidAPI Amazon client
        
        Args:
            api_key: RapidAPI key
        """
        if not api_key:
            raise ValueError("RapidAPI key is required")
        self.api_key = api_key
        self.headers = {
            "x-rapidapi-host": self.RAPIDAPI_HOST,
            "x-rapidapi-key": self.api_key
        }
    
    async def search_products(
        self,
        query: str,
        page: int = 1,
        country: str = "US",
        sort_by: str = "RELEVANCE",
        product_condition: str = "ALL",
        is_prime: bool = False,
        deals_and_discounts: str = "NONE"
    ) -> List[Product]:
        """
        Search products on Amazon via RapidAPI
        
        Args:
            query: Search query
            page: Page number
            country: Country code (default: US)
            sort_by: Sort order (RELEVANCE, PRICE_LOW_TO_HIGH, etc.)
            product_condition: Product condition filter
            is_prime: Filter Prime products only
            deals_and_discounts: Deals filter
        
        Returns:
            List of Product objects
        """
        try:
            url = f"{self.BASE_URL}/search"
            params = {
                "query": query,
                "page": str(page),
                "country": country,
                "sort_by": sort_by,
                "product_condition": product_condition,
                "is_prime": "true" if is_prime else "false",
                "deals_and_discounts": deals_and_discounts
            }
            
            logger.info(f"Calling RapidAPI search: query='{query}', page={page}")
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, headers=self.headers, timeout=aiohttp.ClientTimeout(total=15)) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"RapidAPI search error: {response.status} - {error_text}")
                        raise Exception(f"RapidAPI returned status {response.status}: {error_text}")
                    
                    data = await response.json()
                    
                    # Check for errors
                    if data.get("status") != "OK":
                        error_msg = data.get("message", "Unknown error")
                        raise Exception(f"RapidAPI error: {error_msg}")
                    
                    # Transform response to unified Product format
                    products = self._transform_search_response(data)
                    logger.info(f"Successfully fetched {len(products)} products from RapidAPI")
                    return products
                    
        except aiohttp.ClientError as e:
            logger.error(f"Network error calling RapidAPI: {str(e)}")
            raise Exception(f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Error searching products: {str(e)}")
            raise
    
    async def get_product_details(self, asin: str, country: str = "US") -> Optional[Dict[str, Any]]:
        """
        Get detailed product information by ASIN
        
        Args:
            asin: Amazon ASIN
            country: Country code
        
        Returns:
            Product details dictionary or None
        """
        try:
            url = f"{self.BASE_URL}/product-details"
            params = {
                "asin": asin,
                "country": country
            }
            
            logger.info(f"Fetching product details for ASIN: {asin}")
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, headers=self.headers, timeout=aiohttp.ClientTimeout(total=15)) as response:
                    if response.status != 200:
                        logger.error(f"RapidAPI product-details error: {response.status}")
                        return None
                    
                    data = await response.json()
                    
                    if data.get("status") != "OK":
                        return None
                    
                    return data.get("data", {})
                    
        except Exception as e:
            logger.error(f"Error fetching product details: {str(e)}")
            return None
    
    async def get_product_reviews(
        self,
        asin: str,
        country: str = "US",
        page: int = 1,
        sort_by: str = "TOP_REVIEWS",
        star_rating: str = "ALL"
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Get product reviews
        
        Args:
            asin: Amazon ASIN
            country: Country code
            page: Page number
            sort_by: Sort order
            star_rating: Star rating filter
        
        Returns:
            List of reviews or None
        """
        try:
            url = f"{self.BASE_URL}/product-reviews"
            params = {
                "asin": asin,
                "country": country,
                "page": str(page),
                "sort_by": sort_by,
                "star_rating": star_rating,
                "verified_purchases_only": "false",
                "images_or_videos_only": "false",
                "current_format_only": "false"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, headers=self.headers, timeout=aiohttp.ClientTimeout(total=15)) as response:
                    if response.status != 200:
                        return None
                    
                    data = await response.json()
                    
                    if data.get("status") != "OK":
                        return None
                    
                    return data.get("data", {}).get("reviews", [])
                    
        except Exception as e:
            logger.error(f"Error fetching reviews: {str(e)}")
            return None
    
    def _transform_search_response(self, data: Dict[str, Any]) -> List[Product]:
        """
        Transform RapidAPI search response to unified Product format
        
        Args:
            data: RapidAPI search response JSON
        
        Returns:
            List of Product objects
        """
        products = []
        
        # RapidAPI returns data in data["data"] or data["products"]
        response_data = data.get("data", {})
        
        # Try different possible response structures
        items = []
        if isinstance(response_data, list):
            items = response_data
        elif isinstance(response_data, dict):
            # Look for products list
            if "products" in response_data:
                items = response_data["products"]
            elif "results" in response_data:
                items = response_data["results"]
            elif "items" in response_data:
                items = response_data["items"]
            else:
                # Try to get first level list if available
                items = [response_data] if response_data else []
        
        for item in items:
            try:
                # Extract ASIN
                asin = item.get("asin", "")
                if not asin:
                    continue
                
                # Extract price
                price = None
                price_str = item.get("product_price") or item.get("price") or item.get("sale_price")
                if price_str:
                    # Remove currency symbols and parse
                    price_str = str(price_str).replace("$", "").replace(",", "").strip()
                    try:
                        price = float(price_str)
                    except:
                        pass
                
                # Extract rating
                rating = None
                review_count = None
                rating_str = item.get("product_star_rating") or item.get("star_rating") or item.get("rating")
                if rating_str:
                    try:
                        rating = float(rating_str)
                    except:
                        pass
                
                review_count_str = item.get("product_num_ratings") or item.get("num_ratings") or item.get("review_count")
                if review_count_str:
                    try:
                        review_count = int(review_count_str)
                    except:
                        pass
                
                # Extract availability
                availability = "out_of_stock"
                availability_text = item.get("product_availability") or item.get("availability", "")
                if availability_text:
                    if any(word in availability_text.lower() for word in ["in stock", "available", "order soon"]):
                        availability = "in_stock"
                
                # Extract images
                image_url = None
                if "product_photo" in item:
                    image_url = item["product_photo"]
                elif "product_images" in item and isinstance(item["product_images"], list) and len(item["product_images"]) > 0:
                    image_url = item["product_images"][0]
                elif "image" in item:
                    image_url = item["image"]
                elif "thumbnail" in item:
                    image_url = item["thumbnail"]
                
                # Extract shipping info
                shipping_info = None
                if "is_prime" in item and item.get("is_prime"):
                    shipping_info = ShippingInfo(
                        free_shipping=True,
                        delivery_time="2-3 days"
                    )
                elif "free_shipping" in item:
                    shipping_info = ShippingInfo(
                        free_shipping=item.get("free_shipping", False),
                        delivery_time="3-5 days"
                    )
                
                product = Product(
                    id=f"amazon_{asin}",
                    title=item.get("product_title") or item.get("title") or "Unknown Product",
                    brand=item.get("product_details", {}).get("Brand") if isinstance(item.get("product_details"), dict) else item.get("brand"),
                    price=price,
                    currency=item.get("currency", "USD"),
                    platform="amazon",
                    platform_id=asin,
                    rating=rating,
                    review_count=review_count,
                    image_url=image_url,
                    availability=availability,
                    shipping_info=shipping_info,
                    description=item.get("product_description") or item.get("description"),
                    url=item.get("product_url") or item.get("url") or f"https://www.amazon.com/dp/{asin}"
                )
                
                products.append(product)
                
            except Exception as e:
                logger.warning(f"Error transforming product {item.get('asin', 'unknown')}: {str(e)}")
                continue
        
        return products
    
    async def search_with_details(
        self,
        query: str,
        page: int = 1,
        include_reviews: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Search products and enrich with detailed information
        
        Args:
            query: Search query
            page: Page number
            include_reviews: Whether to include reviews
        
        Returns:
            List of enriched product dictionaries
        """
        # First, get search results
        products = await self.search_products(query, page=page)
        
        # Enrich each product with details
        enriched_products = []
        for product in products[:10]:  # Limit to first 10 for performance
            try:
                asin = product.platform_id
                if not asin:
                    enriched_products.append(product.dict())
                    continue
                
                # Get detailed product information
                details = await self.get_product_details(asin)
                
                if details:
                    # Update product with additional details
                    product_dict = product.dict()
                    
                    # Add detailed images
                    if "product_photos" in details and details["product_photos"]:
                        product_dict["images"] = details["product_photos"]
                    
                    # Add full product information
                    product_dict["full_details"] = details.get("product_information", {})
                    product_dict["product_details"] = details.get("product_details", {})
                    
                    # Add reviews if requested
                    if include_reviews:
                        reviews = await self.get_product_reviews(asin)
                        if reviews:
                            product_dict["reviews"] = reviews[:5]  # Limit to 5 reviews
                    
                    enriched_products.append(product_dict)
                else:
                    enriched_products.append(product.dict())
                    
            except Exception as e:
                logger.warning(f"Error enriching product {product.platform_id}: {str(e)}")
                enriched_products.append(product.dict())
        
        return enriched_products

