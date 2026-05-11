"""
eBay marketplace posting adapter using Inventory API v1 (Sandbox).

End-to-end flow:
  1. Refresh OAuth token using saved refresh_token
  2. PUT  /sell/inventory/v1/inventory_item/{sku}   → create inventory item
  3. POST /sell/inventory/v1/offer                  → create offer
  4. POST /sell/inventory/v1/offer/{offerId}/publish → publish → get listingId
"""

import base64
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from .base_adapter import BaseMarketplaceAdapter

logger = logging.getLogger(__name__)

# Unsplash placeholder images per category (publicly accessible, eBay Sandbox-safe)
CATEGORY_IMAGE_MAP: Dict[str, str] = {
    "Electronics":    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
    "Fashion":        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80",
    "Home & Kitchen": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
    "Sports":         "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&q=80",
    "Books":          "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&q=80",
    "Toys":           "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    "Beauty":         "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80",
    "Automotive":     "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80",
}
DEFAULT_IMAGE = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80"

EBAY_CATEGORY_MAP: Dict[str, str] = {
    # Leaf categories verified in eBay Sandbox
    "Electronics":    "9355",   # Cell Phones & Smartphones
    "Fashion":        "15724",  # Men's Clothing > Shirts
    "Home & Kitchen": "20625",  # Kitchen & Dining > Small Appliances
    "Sports":         "159043", # Sporting Goods > Outdoor Sports
    "Books":          "29223",  # Books > Nonfiction Books
    "Toys":           "19003",  # Toys & Hobbies > Action Figures
    "Beauty":         "31786",  # Health & Beauty > Skin Care
    "Automotive":     "6030",   # eBay Motors > Parts & Accessories
}

# eBay Sandbox is highly restrictive — most leaf categories only allow NEW condition.
# Category 29223 (Books > Nonfiction) is the only one we've verified accepts all
# conditions (NEW, LIKE_NEW, USED_GOOD, USED_ACCEPTABLE) in Sandbox.
# We fall back to this for any combination not in the known-working set so the
# demo flow always succeeds.
SANDBOX_SAFE_CATEGORY_ID = "29223"

# (category_id, condition) pairs we've verified work in eBay Sandbox.
# Anything outside this set is remapped to SANDBOX_SAFE_CATEGORY_ID.
SANDBOX_KNOWN_GOOD: set = {
    ("9355", "NEW"),                          # Electronics + new
    ("9355", "FOR_PARTS_OR_NOT_WORKING"),     # Electronics + poor
    ("19003", "NEW"),                         # Toys + new
    ("29223", "NEW"),                         # Books + any
    ("29223", "LIKE_NEW"),
    ("29223", "USED_GOOD"),
    ("29223", "USED_ACCEPTABLE"),
    ("29223", "FOR_PARTS_OR_NOT_WORKING"),
}

CONDITION_MAP: Dict[str, str] = {
    "new":      "NEW",
    "like-new": "LIKE_NEW",
    "like_new": "LIKE_NEW",
    "good":     "USED_GOOD",
    "fair":     "USED_ACCEPTABLE",
    "poor":     "FOR_PARTS_OR_NOT_WORKING",
}


class EbayAdapter(BaseMarketplaceAdapter):
    """eBay adapter — real Inventory API calls against Sandbox."""

    def __init__(
        self,
        app_id: str,
        cert_id: str,
        refresh_token: str,
        fulfillment_policy_id: str,
        payment_policy_id: str,
        return_policy_id: str,
        merchant_location_key: str,
        sandbox: bool = True,
        ngrok_url: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.app_id = app_id
        self.cert_id = cert_id
        self.refresh_token = refresh_token
        self.fulfillment_policy_id = fulfillment_policy_id
        self.payment_policy_id = payment_policy_id
        self.return_policy_id = return_policy_id
        self.merchant_location_key = merchant_location_key
        self.ngrok_url = ngrok_url
        self.api_base = (
            "https://api.sandbox.ebay.com" if sandbox else "https://api.ebay.com"
        )
        self._access_token: Optional[str] = None

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def marketplace_name(self) -> str:
        return "ebay"

    @property
    def max_images(self) -> int:
        return 12

    @property
    def max_title_length(self) -> int:
        return 80

    # ── OAuth ─────────────────────────────────────────────────────────────────

    async def _refresh_access_token(self) -> str:
        """Exchange refresh_token for a fresh access token."""
        credentials = base64.b64encode(
            f"{self.app_id}:{self.cert_id}".encode()
        ).decode()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.api_base}/identity/v1/oauth2/token",
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self.refresh_token,
                    "scope": (
                        "https://api.ebay.com/oauth/api_scope/sell.inventory "
                        "https://api.ebay.com/oauth/api_scope/sell.account"
                    ),
                },
            )

        if not resp.is_success:
            raise Exception(
                f"Token refresh failed [{resp.status_code}]: {resp.text}"
            )

        token = resp.json()["access_token"]
        logger.info("eBay access token refreshed successfully")
        return token

    async def _get_token(self) -> str:
        """Return cached token or refresh if needed."""
        if not self._access_token:
            self._access_token = await self._refresh_access_token()
        return self._access_token

    def _auth_headers(self, token: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Content-Language": "en-US",
            "Accept": "application/json",
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _map_category(self, category: str) -> str:
        for key, val in EBAY_CATEGORY_MAP.items():
            if key.lower() in category.lower():
                return val
        return "99"  # Everything Else

    def _map_condition(self, condition: str) -> str:
        return CONDITION_MAP.get(condition.lower().replace(" ", "_"), "GOOD")

    def _resolve_image_url(
        self, category: str, local_filename: Optional[str] = None
    ) -> str:
        """
        Return a publicly accessible image URL for eBay.
        Priority:
          1. Sidecar URL written by /api/v1/upload-image (litter.catbox.moe mirror)
             — eBay can fetch this without ngrok's browser-warning interstitial.
          2. ngrok_url + saved filename  (fallback if litterbox upload failed)
          3. Category-appropriate Unsplash placeholder (no local image)
        """
        if local_filename:
            sidecar = Path("/tmp/talknshop_images") / f"{local_filename}.url"
            if sidecar.exists():
                try:
                    url = sidecar.read_text().strip()
                    if url.startswith("https://"):
                        return url
                except Exception as exc:
                    logger.warning("Failed to read sidecar URL %s: %s", sidecar, exc)

            if self.ngrok_url:
                return f"{self.ngrok_url.rstrip('/')}/static/images/{local_filename}"

        for key, url in CATEGORY_IMAGE_MAP.items():
            if key.lower() in category.lower():
                return url
        return DEFAULT_IMAGE

    # ── Core listing flow ─────────────────────────────────────────────────────

    async def create_ebay_listing(
        self,
        listing_data: Dict[str, Any],
        local_image_filename: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Full end-to-end eBay Sandbox listing.

        Args:
            listing_data: dict with keys:
                title, description, price, condition, category,
                brand, quantity, image_urls (optional list)
            local_image_filename: basename of saved image on this server
                (used to build a ngrok-accessible URL when ngrok is configured)

        Returns:
            {success, sku, offer_id, listing_id, listing_url, image_used, posted_at}
        """
        token = await self._get_token()
        headers = self._auth_headers(token)

        sku = f"TNS-{uuid.uuid4().hex[:8].upper()}"
        title = self._truncate_title(listing_data.get("title") or "Item for Sale")
        description = listing_data.get("description") or title
        price = float(listing_data.get("price") or 9.99)
        condition = self._map_condition(listing_data.get("condition") or "good")
        category = listing_data.get("category") or ""
        category_id = self._map_category(category)

        # ── Sandbox safety: most Sandbox leaf categories only accept certain
        # conditions. If the (category, condition) pair isn't in our verified
        # set, fall back to a known-permissive Sandbox category so the listing
        # actually publishes. (No-op in production.)
        is_sandbox = self.api_base.startswith("https://api.sandbox.ebay.com")
        if is_sandbox and (category_id, condition) not in SANDBOX_KNOWN_GOOD:
            logger.info(
                "Sandbox: remapping category %s → %s for condition=%s "
                "(not in known-good set)",
                category_id, SANDBOX_SAFE_CATEGORY_ID, condition,
            )
            category_id = SANDBOX_SAFE_CATEGORY_ID
        brand = listing_data.get("brand") or "Unbranded"
        quantity = max(1, int(listing_data.get("quantity") or 1))

        # Resolve image URL — prefer passed image_urls, else derive one
        image_urls: List[str] = listing_data.get("image_urls") or []
        if not image_urls:
            image_urls = [self._resolve_image_url(category, local_image_filename)]

        logger.info(
            "Creating eBay listing | title=%r sku=%s price=%.2f category_id=%s condition=%s image=%s",
            title, sku, price, category_id, condition, image_urls[0],
        )

        async with httpx.AsyncClient(timeout=30) as client:

            # ── Step 1: Create inventory item ──────────────────────────────
            # Build aspects — include all fields commonly required by eBay categories
            aspects: Dict[str, List[str]] = {
                "Brand": [brand],
                "MPN": [sku],
                "Model": [title[:65]],        # use title as model name
                "Color": ["Black"],           # nearly all categories require Color
                "Network": ["Unlocked"],      # required for cell phones category
                "Storage Capacity": ["64 GB"],# required for cell phones category
                "Type": ["Smartphone"],       # required for cell phones category
            }

            inventory_item = {
                "availability": {
                    "shipToLocationAvailability": {"quantity": quantity}
                },
                "condition": condition,
                "product": {
                    "title": title,
                    "description": description,
                    "imageUrls": image_urls[:12],
                    "aspects": aspects,
                    "brand": brand,
                    "mpn": sku,
                },
            }

            resp = await client.put(
                f"{self.api_base}/sell/inventory/v1/inventory_item/{sku}",
                headers=headers,
                json=inventory_item,
            )
            if resp.status_code not in (200, 204):
                raise Exception(
                    f"Inventory item failed [{resp.status_code}]: {resp.text}"
                )
            logger.info("✓ Inventory item created: SKU=%s", sku)

            # ── Step 2: Create offer ────────────────────────────────────────
            offer_payload = {
                "sku": sku,
                "marketplaceId": "EBAY_US",
                "format": "FIXED_PRICE",
                "availableQuantity": quantity,
                "categoryId": category_id,
                "listingDescription": description,
                "listingPolicies": {
                    "fulfillmentPolicyId": self.fulfillment_policy_id,
                    "paymentPolicyId": self.payment_policy_id,
                    "returnPolicyId": self.return_policy_id,
                },
                "pricingSummary": {
                    "price": {"value": f"{price:.2f}", "currency": "USD"}
                },
                "merchantLocationKey": self.merchant_location_key,
            }

            resp = await client.post(
                f"{self.api_base}/sell/inventory/v1/offer",
                headers=headers,
                json=offer_payload,
            )
            if not resp.is_success:
                raise Exception(
                    f"Offer creation failed [{resp.status_code}]: {resp.text}"
                )
            offer_id = resp.json()["offerId"]
            logger.info("✓ Offer created: offerId=%s", offer_id)

            # ── Step 3: Publish offer ───────────────────────────────────────
            resp = await client.post(
                f"{self.api_base}/sell/inventory/v1/offer/{offer_id}/publish",
                headers=headers,
                json={},
            )
            if not resp.is_success:
                raise Exception(
                    f"Publish failed [{resp.status_code}]: {resp.text}"
                )
            listing_id = resp.json().get("listingId", "")
            logger.info("✓ Published: listingId=%s", listing_id)

        return {
            "success": True,
            "sku": sku,
            "offer_id": offer_id,
            "listing_id": listing_id,
            "listing_url": f"https://www.sandbox.ebay.com/itm/{listing_id}",
            "image_used": image_urls[0],
            "posted_at": datetime.utcnow().isoformat(),
        }

    # ── Abstract method implementations (required by BaseMarketplaceAdapter) ──

    async def validate_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        errors: List[str] = []
        if not listing_spec.get("title"):
            errors.append("Title is required")
        try:
            if float(listing_spec.get("price", 0)) <= 0:
                errors.append("Price must be greater than 0")
        except (TypeError, ValueError):
            errors.append("Valid numeric price is required")
        return {"valid": len(errors) == 0, "errors": errors, "warnings": []}

    async def transform_listing(self, listing_spec: Dict[str, Any]) -> Dict[str, Any]:
        return listing_spec  # create_ebay_listing handles transformation internally

    async def upload_images(self, s3_keys: list) -> list:
        return s3_keys  # URLs resolved inside create_ebay_listing

    async def post_listing(self, marketplace_payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self.create_ebay_listing(marketplace_payload)

    async def get_listing_status(self, listing_id: str) -> Dict[str, Any]:
        return {
            "listing_id": listing_id,
            "status": "live",
            "last_updated": datetime.utcnow().isoformat(),
        }

    async def update_listing(
        self, listing_id: str, updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        return {"success": False, "error": "Not implemented"}

    async def delete_listing(self, listing_id: str) -> Dict[str, Any]:
        return {"success": False, "error": "Not implemented"}
