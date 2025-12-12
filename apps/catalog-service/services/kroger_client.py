import base64
import logging
from typing import Any, Dict, List, Optional

import aiohttp

from models.search import Product, ShippingInfo

logger = logging.getLogger(__name__)


class KrogerAPIClient:
    """Client for Kroger Product API."""

    BASE_URL = "https://api.kroger.com/v1"
    TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token"

    def __init__(self, client_id: str, client_secret: str):
        if not client_id or not client_secret:
            raise ValueError("Kroger Client ID and Client Secret are required")
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[float] = None

    async def _get_access_token(self) -> str:
        try:
            credentials = f"{self.client_id}:{self.client_secret}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()

            headers = {
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            }

            data = {"grant_type": "client_credentials", "scope": "product.compact"}

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.TOKEN_URL,
                    headers=headers,
                    data=data,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Kroger token error: {response.status} - {error_text}")

                        try:
                            error_json = await response.json()
                            error_code = error_json.get("error", "unknown")
                            error_description = error_json.get("error_description", error_text)
                            logger.error(f"Kroger OAuth error: {error_code} - {error_description}")
                            self.access_token = None
                            self.token_expires_at = None
                            raise Exception(f"Kroger OAuth error ({error_code}): {error_description}")
                        except Exception:
                            self.access_token = None
                            self.token_expires_at = None
                            raise Exception(f"Failed to get Kroger access token: {response.status} - {error_text}")

                    token_data = await response.json()
                    self.access_token = token_data.get("access_token")
                    expires_in = token_data.get("expires_in", 3600)

                    import time

                    self.token_expires_at = time.time() + expires_in - 60
                    logger.info("Successfully obtained Kroger access token")
                    return self.access_token

        except Exception as e:
            logger.error(f"Error getting Kroger access token: {str(e)}")
            raise

    async def _ensure_token(self) -> str:
        import time

        if not self.access_token or (self.token_expires_at and time.time() >= self.token_expires_at):
            self.access_token = None
            self.token_expires_at = None
            await self._get_access_token()

        return self.access_token

    async def search_products(
        self,
        query: str,
        limit: int = 20,
        start: int = 0,
        location_id: Optional[str] = None,
        zip_code: Optional[str] = None,
    ) -> List[Product]:
        try:
            await self._ensure_token()

            url = f"{self.BASE_URL}/products"
            params: Dict[str, Any] = {
                "filter.term": query,
                "filter.limit": str(min(limit, 50)),
                "filter.start": str(start),
            }

            if location_id:
                params["filter.locationId"] = location_id
            elif zip_code:
                try:
                    locations = await self.get_locations(zip_code=zip_code)
                    if locations and len(locations) > 0:
                        location_id = locations[0].get("locationId")
                        if location_id:
                            params["filter.locationId"] = location_id
                            logger.info(f"Using location_id {location_id} for zip code {zip_code}")
                except Exception as e:
                    logger.warning(f"Could not get location for zip code {zip_code}: {str(e)}")

            headers = {"Authorization": f"Bearer {self.access_token}", "Accept": "application/json"}

            logger.info(f"Calling Kroger API: query='{query}', limit={limit}")

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Kroger API error: {response.status} - {error_text}")
                        raise Exception(f"Kroger API returned status {response.status}: {error_text}")

                    data = await response.json()
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
        try:
            await self._ensure_token()

            url = f"{self.BASE_URL}/products/{product_id}"
            params: Dict[str, Any] = {}
            if location_id:
                params["filter.locationId"] = location_id

            headers = {"Authorization": f"Bearer {self.access_token}", "Accept": "application/json"}

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status != 200:
                        logger.error(f"Kroger product details error: {response.status}")
                        return None

                    return await response.json()

        except Exception as e:
            logger.error(f"Error fetching Kroger product details: {str(e)}")
            return None

    async def get_locations(self, zip_code: str) -> Optional[List[Dict[str, Any]]]:
        try:
            await self._ensure_token()

            url = f"{self.BASE_URL}/locations"
            params = {"filter.zipCode.near": zip_code, "filter.limit": "5"}
            headers = {"Authorization": f"Bearer {self.access_token}", "Accept": "application/json"}

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status != 200:
                        logger.error(f"Kroger locations error: {response.status}")
                        return None

                    data = await response.json()
                    return data.get("data", [])

        except Exception as e:
            logger.error(f"Error fetching Kroger locations: {str(e)}")
            return None

    def _transform_kroger_response(self, data: Dict[str, Any]) -> List[Product]:
        products: List[Product] = []
        items = data.get("data", [])

        for item in items:
            try:
                product_id = item.get("productId")
                if not product_id:
                    continue

                price = None
                currency = "USD"
                if item.get("items"):
                    first_item = item["items"][0]
                    if first_item.get("price"):
                        price = first_item["price"].get("regular")
                        currency = first_item["price"].get("currency", "USD")

                availability = "in_stock" if item.get("items") else "out_of_stock"
                image_url = None
                if item.get("images"):
                    image_url = item["images"][0].get("sizes", [{}])[0].get("url")

                product = Product(
                    id=f"kroger_{product_id}",
                    title=item.get("description"),
                    brand=item.get("brand"),
                    price=price,
                    currency=currency,
                    platform="kroger",
                    platform_id=product_id,
                    rating=None,
                    review_count=None,
                    image_url=image_url,
                    availability=availability,
                    shipping_info=None,
                    url=None,
                )
                products.append(product)

            except Exception as e:
                logger.warning(f"Failed to transform Kroger item: {str(e)}")
                continue

        return products
