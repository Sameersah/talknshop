import logging
from typing import Any, Dict, List, Optional

import aiohttp

from models.search import Product, ShippingInfo

logger = logging.getLogger(__name__)


class RapidAPIAmazonClient:
    """Client for RapidAPI Amazon Product API."""

    BASE_URL = "https://real-time-amazon-data.p.rapidapi.com"
    RAPIDAPI_HOST = "real-time-amazon-data.p.rapidapi.com"

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("RapidAPI key is required")
        self.api_key = api_key
        self.headers = {
            "x-rapidapi-host": self.RAPIDAPI_HOST,
            "x-rapidapi-key": self.api_key,
        }

    async def search_products(
        self,
        query: str,
        page: int = 1,
        country: str = "US",
        sort_by: str = "RELEVANCE",
        product_condition: str = "ALL",
        is_prime: bool = False,
        deals_and_discounts: str = "NONE",
    ) -> List[Product]:
        try:
            url = f"{self.BASE_URL}/search"
            params = {
                "query": query,
                "page": str(page),
                "country": country,
                "sort_by": sort_by,
                "product_condition": product_condition,
                "is_prime": "true" if is_prime else "false",
                "deals_and_discounts": deals_and_discounts,
            }

            logger.info(f"Calling RapidAPI search: query='{query}', page={page}")

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=self.headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"RapidAPI search error: {response.status} - {error_text}")
                        raise Exception(f"RapidAPI returned status {response.status}: {error_text}")

                    data = await response.json()

                    if data.get("status") != "OK":
                        error_msg = data.get("message", "Unknown error")
                        raise Exception(f"RapidAPI error: {error_msg}")

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
        try:
            url = f"{self.BASE_URL}/product-details"
            params = {"asin": asin, "country": country}

            logger.info(f"Fetching product details for ASIN: {asin}")

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=self.headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as response:
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
        star_rating: str = "ALL",
    ) -> Optional[List[Dict[str, Any]]]:
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
                "current_format_only": "false",
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=self.headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as response:
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
        products: List[Product] = []
        response_data = data.get("data", {})

        items = []
        if isinstance(response_data, list):
            items = response_data
        elif isinstance(response_data, dict):
            if "products" in response_data:
                items = response_data["products"]
            elif "results" in response_data:
                items = response_data["results"]
            elif "items" in response_data:
                items = response_data["items"]
            else:
                items = [response_data] if response_data else []

        for item in items:
            try:
                asin = item.get("asin", "")
                if not asin:
                    continue

                price = None
                price_str = item.get("product_price") or item.get("price") or item.get("sale_price")
                if price_str:
                    price_str = str(price_str).replace("$", "").replace(",", "").strip()
                    try:
                        price = float(price_str)
                    except Exception:
                        pass

                rating = None
                review_count = None
                rating_str = item.get("product_star_rating") or item.get("star_rating") or item.get("rating")
                if rating_str:
                    try:
                        rating = float(rating_str)
                    except Exception:
                        pass

                review_count_str = item.get("product_num_ratings") or item.get("num_ratings") or item.get("review_count")
                if review_count_str:
                    try:
                        review_count = int(review_count_str)
                    except Exception:
                        pass

                availability = "out_of_stock"
                availability_text = item.get("product_availability") or item.get("availability", "")
                if availability_text and any(
                    word in availability_text.lower() for word in ["in stock", "available", "order soon"]
                ):
                    availability = "in_stock"

                image_url = None
                if "product_photo" in item:
                    image_url = item["product_photo"]
                elif (
                    "product_images" in item
                    and isinstance(item["product_images"], list)
                    and len(item["product_images"]) > 0
                ):
                    image_url = item["product_images"][0]

                shipping_info = None
                if item.get("is_prime"):
                    shipping_info = ShippingInfo(free_shipping=True, delivery_time="Prime shipping")

                currency_val = item.get("currency") or "USD"
                price_val = price
                product = Product(
                    id=f"amazon_{asin}",
                    title=item.get("product_title") or item.get("title") or "Unknown Product",
                    brand=item.get("product_brand") or item.get("brand"),
                    price=price_val,
                    currency=str(currency_val) if currency_val else "USD",
                    platform="amazon",
                    platform_id=asin,
                    rating=rating,
                    review_count=review_count,
                    image_url=image_url,
                    availability=availability,
                    shipping_info=shipping_info,
                    url=item.get("product_url") or item.get("url"),
                )
                products.append(product)

            except Exception as e:
                logger.warning(f"Failed to transform item: {str(e)}")
                continue

        return products
