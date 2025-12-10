import aiohttp
import logging
import base64
from typing import List, Optional, Dict, Any
from models.search import Product, ShippingInfo

logger = logging.getLogger(__name__)


class KrogerAPIClient:
    """Client for Kroger Product API"""
    
    BASE_URL = "https://api.kroger.com/v1"
    TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token"
    
    def __init__(self, client_id: str, client_secret: str):
        """
        Initialize Kroger API client
        
        Args:
            client_id: Kroger API Client ID
            client_secret: Kroger API Client Secret
        """
        if not client_id or not client_secret:
            raise ValueError("Kroger Client ID and Client Secret are required")
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = None
        self.token_expires_at = None
    
    async def _get_access_token(self) -> str:
        """
        Get OAuth 2.0 access token (Client Credentials flow)
        
        Returns:
            Access token string
        """
        try:
            # Create Basic Auth header
            credentials = f"{self.client_id}:{self.client_secret}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()
            
            headers = {
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            
            data = {
                "grant_type": "client_credentials",
                "scope": "product.compact"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.TOKEN_URL,
                    headers=headers,
                    data=data,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Kroger token error: {response.status} - {error_text}")
                        
                        # Try to parse error response for better error message
                        try:
                            error_json = await response.json()
                            error_code = error_json.get("error", "unknown")
                            error_description = error_json.get("error_description", error_text)
                            logger.error(f"Kroger OAuth error: {error_code} - {error_description}")
                            
                            # Clear token on error
                            self.access_token = None
                            self.token_expires_at = None
                            
                            raise Exception(f"Kroger OAuth error ({error_code}): {error_description}")
                        except:
                            # If not JSON, use raw error text
                            self.access_token = None
                            self.token_expires_at = None
                            raise Exception(f"Failed to get Kroger access token: {response.status} - {error_text}")
                    
                    token_data = await response.json()
                    self.access_token = token_data.get("access_token")
                    expires_in = token_data.get("expires_in", 3600)
                    
                    # Set expiration time (with 60 second buffer)
                    import time
                    self.token_expires_at = time.time() + expires_in - 60
                    
                    logger.info("Successfully obtained Kroger access token")
                    return self.access_token
                    
        except Exception as e:
            logger.error(f"Error getting Kroger access token: {str(e)}")
            raise
    
    async def _ensure_token(self) -> str:
        """
        Ensure we have a valid access token
        
        Returns:
            Valid access token
        """
        import time
        
        # Clear token if expired or missing
        if not self.access_token or (self.token_expires_at and time.time() >= self.token_expires_at):
            self.access_token = None  # Clear old token
            self.token_expires_at = None
            await self._get_access_token()
        
        return self.access_token
    
    async def search_products(
        self,
        query: str,
        limit: int = 20,
        start: int = 0,
        location_id: Optional[str] = None,
        zip_code: Optional[str] = None
    ) -> List[Product]:
        """
        Search products on Kroger
        
        Args:
            query: Search query
            limit: Number of results (max 50)
            start: Starting index for pagination
            location_id: Store location ID (optional)
        
        Returns:
            List of Product objects
        """
        try:
            await self._ensure_token()
            
            url = f"{self.BASE_URL}/products"
            params = {
                "filter.term": query,
                "filter.limit": str(min(limit, 50)),
                "filter.start": str(start)
            }
            
            # Location is required for prices - try to get from zip_code if not provided
            if location_id:
                params["filter.locationId"] = location_id
            elif zip_code:
                # Try to get location from zip code
                try:
                    locations = await self.get_locations(zip_code=zip_code)
                    if locations and len(locations) > 0:
                        location_id = locations[0].get("locationId")
                        if location_id:
                            params["filter.locationId"] = location_id
                            logger.info(f"Using location_id {location_id} for zip code {zip_code}")
                except Exception as e:
                    logger.warning(f"Could not get location for zip code {zip_code}: {str(e)}")
                    # Continue without location_id - prices won't be available
            
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json"
            }
            
            logger.info(f"Calling Kroger API: query='{query}', limit={limit}")
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15)
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Kroger API error: {response.status} - {error_text}")
                        raise Exception(f"Kroger API returned status {response.status}: {error_text}")
                    
                    data = await response.json()
                    
                    # Transform Kroger response to unified Product format
                    products = self._transform_kroger_response(data)
                    logger.info(f"Successfully fetched {len(products)} products from Kroger")
                    return products
                    
        except aiohttp.ClientError as e:
            logger.error(f"Network error calling Kroger API: {str(e)}")
            raise Exception(f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Error searching products from Kroger: {str(e)}")
            raise
    
    async def get_product_details(self, product_id: str, location_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Get detailed product information by product ID
        
        Args:
            product_id: Kroger product ID
            location_id: Store location ID (optional)
        
        Returns:
            Product details dictionary or None
        """
        try:
            await self._ensure_token()
            
            url = f"{self.BASE_URL}/products/{product_id}"
            params = {}
            
            if location_id:
                params["filter.locationId"] = location_id
            
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15)
                ) as response:
                    if response.status != 200:
                        logger.error(f"Kroger API error for product {product_id}: {response.status}")
                        return None
                    
                    data = await response.json()
                    return data.get("data", {})
                    
        except Exception as e:
            logger.error(f"Error fetching product details from Kroger: {str(e)}")
            return None
    
    async def get_locations(self, zip_code: Optional[str] = None, latitude: Optional[float] = None, longitude: Optional[float] = None) -> List[Dict[str, Any]]:
        """
        Get store locations
        
        Args:
            zip_code: Zip code to search near
            latitude: Latitude coordinate
            longitude: Longitude coordinate
        
        Returns:
            List of store locations
        """
        try:
            await self._ensure_token()
            
            url = f"{self.BASE_URL}/locations"
            params = {}
            
            if zip_code:
                params["filter.zipCode.near"] = zip_code
            elif latitude and longitude:
                params["filter.lat.near"] = str(latitude)
                params["filter.lon.near"] = str(longitude)
            
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15)
                ) as response:
                    if response.status != 200:
                        return []
                    
                    data = await response.json()
                    return data.get("data", [])
                    
        except Exception as e:
            logger.error(f"Error fetching locations from Kroger: {str(e)}")
            return []
    
    def _transform_kroger_response(self, data: Dict[str, Any]) -> List[Product]:
        """
        Transform Kroger API response to unified Product format
        
        Args:
            data: Kroger API response JSON
        
        Returns:
            List of Product objects
        """
        products = []
        
        # Kroger API returns products in data["data"]
        items = data.get("data", [])
        
        for item in items:
            try:
                product_id = item.get("productId", "")
                if not product_id:
                    continue
                
                # Extract price
                price = None
                items_list = item.get("items", [])
                if items_list and len(items_list) > 0:
                    first_item = items_list[0]
                    price_info = first_item.get("price", {})
                    if price_info:
                        regular_price = price_info.get("regular")
                        if regular_price:
                            price = float(regular_price)
                
                # Extract availability
                availability = "out_of_stock"
                if items_list and len(items_list) > 0:
                    first_item = items_list[0]
                    inventory = first_item.get("inventory", {})
                    if inventory:
                        stock_level = inventory.get("stockLevel", "OUT_OF_STOCK")
                        if stock_level != "OUT_OF_STOCK":
                            availability = "in_stock"
                
                # Extract images - use featured/front image
                image_url = None
                images = item.get("images", [])
                if images and len(images) > 0:
                    # Find featured image (front perspective) or use first image
                    featured_image = None
                    for img in images:
                        if img.get("featured") or img.get("perspective") == "front":
                            featured_image = img
                            break
                    
                    # Use featured image or first image
                    target_image = featured_image or images[0]
                    
                    # Get large or xlarge size
                    sizes = target_image.get("sizes", [])
                    if sizes:
                        # Prefer large or xlarge
                        for size_obj in sizes:
                            if size_obj.get("size") in ["xlarge", "large"]:
                                image_url = size_obj.get("url")
                                break
                        
                        # Fallback to first available size
                        if not image_url and sizes:
                            image_url = sizes[0].get("url")
                
                # Extract brand
                brand = item.get("brand", None)
                
                # Extract ratings - Kroger API provides ratings in ratingsAndReviews
                rating = None
                review_count = None
                ratings_info = item.get("ratingsAndReviews", {})
                if ratings_info:
                    rating = ratings_info.get("averageOverallRating")
                    if rating:
                        try:
                            rating = float(rating)
                        except (ValueError, TypeError):
                            rating = None
                    
                    review_count = ratings_info.get("totalReviewCount")
                    if review_count:
                        try:
                            review_count = int(review_count)
                        except (ValueError, TypeError):
                            review_count = None
                
                # Use productPageURI for URL (from API response)
                product_url = None
                product_page_uri = item.get("productPageURI", "")
                if product_page_uri:
                    # productPageURI is relative, make it absolute
                    if product_page_uri.startswith("/"):
                        product_url = f"https://www.kroger.com{product_page_uri}"
                    else:
                        product_url = f"https://www.kroger.com/{product_page_uri}"
                else:
                    # Fallback: try to construct URL from UPC
                    upc = item.get("upc", "")
                    if upc:
                        product_url = f"https://www.kroger.com/p/{upc}"
                
                product = Product(
                    id=f"kroger_{product_id}",
                    title=item.get("description", "Unknown Product"),
                    brand=brand,
                    price=price,  # Will be None if location_id not provided
                    currency="USD",
                    platform="kroger",
                    platform_id=product_id,
                    rating=rating,  # Now extracted from ratingsAndReviews
                    review_count=review_count,  # Now extracted from ratingsAndReviews
                    image_url=image_url,
                    availability=availability,
                    shipping_info=None,  # Grocery items typically require pickup/delivery
                    description=item.get("description"),
                    url=product_url
                )
                
                products.append(product)
                
            except Exception as e:
                logger.warning(f"Error transforming Kroger item {item.get('productId', 'unknown')}: {str(e)}")
                continue
        
        return products

