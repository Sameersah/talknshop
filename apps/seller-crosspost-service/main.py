"""
Seller Crosspost Service — FastAPI application.

Key endpoints:
  POST /api/v1/upload-image   — accept image from mobile, save locally
  POST /api/v1/ebay/list      — create real eBay Sandbox listing
  POST /api/v1/post           — legacy async job endpoint (scaffolded)
  GET  /api/v1/jobs/{job_id}  — job status
"""

import logging
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from adapters.ebay_adapter import EbayAdapter

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv(override=True)  # override=True ensures .env values always take effect

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)

# Static image storage (images uploaded from the mobile app)
IMAGES_DIR = Path("/tmp/talknshop_images")
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# ── eBay adapter (singleton) ──────────────────────────────────────────────────

def _build_ebay_adapter() -> Optional[EbayAdapter]:
    app_id = os.getenv("EBAY_APP_ID", "")
    cert_id = os.getenv("EBAY_CERT_ID", "")
    refresh_token = os.getenv("EBAY_REFRESH_TOKEN", "")

    if not all([app_id, cert_id, refresh_token]):
        logger.warning(
            "eBay credentials missing — set EBAY_APP_ID, EBAY_CERT_ID, "
            "EBAY_REFRESH_TOKEN in .env. eBay listing endpoint will return 503."
        )
        return None

    return EbayAdapter(
        app_id=app_id,
        cert_id=cert_id,
        refresh_token=refresh_token,
        fulfillment_policy_id=os.getenv("EBAY_FULFILLMENT_POLICY_ID", ""),
        payment_policy_id=os.getenv("EBAY_PAYMENT_POLICY_ID", ""),
        return_policy_id=os.getenv("EBAY_RETURN_POLICY_ID", ""),
        merchant_location_key=os.getenv("EBAY_MERCHANT_LOCATION_KEY", "warehouse_01"),
        sandbox=os.getenv("EBAY_SANDBOX", "true").lower() == "true",
        ngrok_url=os.getenv("NGROK_URL") or None,
    )


ebay_adapter: Optional[EbayAdapter] = _build_ebay_adapter()

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="TalknShop Seller Crosspost Service",
    description="Multi-marketplace listing service with real eBay Sandbox integration",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images at /static/images/<filename>
app.mount("/static/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")


# ── Pydantic models ───────────────────────────────────────────────────────────

class EbayListRequest(BaseModel):
    title: str
    description: Optional[str] = None
    price: float
    condition: str = "good"           # new | like-new | good | fair | poor
    category: str = "Electronics"
    brand: Optional[str] = None
    quantity: int = 1
    image_urls: Optional[List[str]] = None   # If provided, used directly
    image_filename: Optional[str] = None     # Basename of previously uploaded image


class EbayListResponse(BaseModel):
    success: bool
    listing_id: Optional[str] = None
    listing_url: Optional[str] = None
    sku: Optional[str] = None
    image_used: Optional[str] = None
    posted_at: Optional[str] = None
    error: Optional[str] = None


class Location(BaseModel):
    city: str
    state: str
    zip: str


class ListingSpec(BaseModel):
    title: str
    description: str
    price: float
    currency: str = "USD"
    condition: str
    category: str
    attributes: Dict[str, Any] = {}
    media_s3_keys: List[str] = []
    target_marketplaces: List[str]
    shipping_options: List[str] = []
    location: Optional[Location] = None


class PostListingRequest(BaseModel):
    listing_spec: ListingSpec
    user_id: str
    session_id: str


class MarketplaceJob(BaseModel):
    marketplace: str
    job_id: str
    status: str


class PostListingResponse(BaseModel):
    job_id: str
    status: str
    created_at: str
    marketplace_jobs: List[MarketplaceJob]
    estimated_completion: str


class MarketplaceResult(BaseModel):
    marketplace: str
    status: str
    listing_id: Optional[str] = None
    confirmation_link: Optional[str] = None
    posted_at: Optional[str] = None
    message: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    created_at: str
    completed_at: Optional[str] = None
    marketplace_results: List[MarketplaceResult]


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "seller-crosspost-service",
        "version": "1.1.0",
        "ebay_configured": ebay_adapter is not None,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── Image upload ──────────────────────────────────────────────────────────────

LITTERBOX_API = "https://litterbox.catbox.moe/resources/internals/api.php"
UGUU_API = "https://uguu.se/upload"
# Use the longest available expiration so links survive long enough for eBay
# to mirror images to i.ebayimg.com (which usually happens within seconds, but
# we want a buffer in case of retries).
LITTERBOX_EXPIRATION = "72h"


async def _upload_to_uguu(file_path: Path) -> Optional[str]:
    """
    Upload an image to uguu.se (anonymous public host, JSON API, 3-hour TTL).
    eBay mirrors the image to its own CDN within seconds, so the short TTL is
    fine. Used as the primary mirror because it's been more reliable for us
    than litterbox (which sometimes returns a Cloudflare challenge HTML page).
    """
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            with file_path.open("rb") as f:
                resp = await client.post(
                    UGUU_API,
                    files={"files[]": (file_path.name, f, "application/octet-stream")},
                )
        if resp.status_code == 200:
            try:
                data = resp.json()
                files = data.get("files") or []
                if files and isinstance(files[0].get("url"), str):
                    return files[0]["url"].strip()
            except Exception:
                pass
        logger.warning("Uguu upload failed [%d]: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Uguu upload exception: %s", exc)
    return None


async def _upload_to_litterbox(file_path: Path) -> Optional[str]:
    """
    Fallback upload to litter.catbox.moe (anonymous public host). Returns the
    public URL on success, or None on failure.

    SSL verification is disabled because some local Python trust stores fail to
    verify catbox.moe's certificate. The payload is a public image being
    uploaded to a public host, so skipping verification is safe.
    """
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            with file_path.open("rb") as f:
                resp = await client.post(
                    LITTERBOX_API,
                    data={"reqtype": "fileupload", "time": LITTERBOX_EXPIRATION},
                    files={"fileToUpload": (file_path.name, f, "application/octet-stream")},
                )
        if resp.status_code == 200 and resp.text.startswith("https://"):
            return resp.text.strip()
        logger.warning(
            "Litterbox upload failed [%d]: %s", resp.status_code, resp.text[:200]
        )
    except Exception as exc:
        logger.warning("Litterbox upload exception: %s", exc)
    return None


async def _mirror_to_public_host(file_path: Path) -> Optional[str]:
    """
    Try multiple public image hosts. eBay's image fetcher needs to retrieve a
    raw JPEG byte stream — ngrok-free.dev fails this because it returns an
    HTML browser-warning to browser-like User-Agents.
    """
    url = await _upload_to_uguu(file_path)
    if url:
        return url
    logger.info("Uguu failed, trying litterbox fallback…")
    return await _upload_to_litterbox(file_path)


@app.post("/api/v1/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """
    Accept an image upload from the mobile app, save it locally, and mirror it
    to a public image host (litter.catbox.moe) so eBay can fetch it without
    hitting the ngrok browser-warning page.

    Returns the filename so the client can pass it back with the listing
    request. The public URL is also persisted in a sidecar `{filename}.url`
    file so the eBay adapter can resolve it later.
    """
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = IMAGES_DIR / filename

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    logger.info("Saved uploaded image: %s (%d bytes)", filename, dest.stat().st_size)

    # Mirror to public host (best-effort — falls back to ngrok/placeholder)
    public_url = await _mirror_to_public_host(dest)
    if public_url:
        logger.info("Mirrored to public host: %s", public_url)
        # Sidecar file so the eBay adapter can look this up by filename later
        try:
            (IMAGES_DIR / f"{filename}.url").write_text(public_url)
        except Exception as exc:
            logger.warning("Failed to write sidecar URL: %s", exc)
    else:
        # Fall back to ngrok if available
        ngrok_url = os.getenv("NGROK_URL", "").rstrip("/")
        if ngrok_url:
            public_url = f"{ngrok_url}/static/images/{filename}"

    return {
        "filename": filename,
        "public_url": public_url,
        "local_path": str(dest),
    }


# ── eBay listing (real Sandbox API) ──────────────────────────────────────────

@app.post("/api/v1/ebay/list", response_model=EbayListResponse)
async def create_ebay_listing(request: EbayListRequest):
    """
    Create a real eBay Sandbox listing via Inventory API v1.

    Flow:
      1. Refresh OAuth token using EBAY_REFRESH_TOKEN
      2. PUT inventory_item
      3. POST offer
      4. POST offer/{id}/publish  → returns listingId
    """
    if ebay_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "eBay credentials not configured. "
                "Set EBAY_APP_ID, EBAY_CERT_ID, EBAY_REFRESH_TOKEN in "
                "apps/seller-crosspost-service/.env and restart the service."
            ),
        )

    logger.info(
        "eBay listing request | title=%r price=%.2f category=%s",
        request.title, request.price, request.category,
    )

    try:
        result = await ebay_adapter.create_ebay_listing(
            listing_data={
                "title": request.title,
                "description": request.description,
                "price": request.price,
                "condition": request.condition,
                "category": request.category,
                "brand": request.brand,
                "quantity": request.quantity,
                "image_urls": request.image_urls or [],
            },
            local_image_filename=request.image_filename,
        )
        return EbayListResponse(**result)

    except Exception as exc:
        logger.error("eBay listing failed: %s", exc, exc_info=True)
        # Reset cached token so next request gets a fresh one
        if ebay_adapter:
            ebay_adapter._access_token = None
        return EbayListResponse(success=False, error=str(exc))


# ── Legacy async job endpoint (scaffolded) ────────────────────────────────────

@app.post(
    "/api/v1/post",
    response_model=PostListingResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def post_listing(request: PostListingRequest):
    """Legacy multi-marketplace async job endpoint (returns job_id for polling)."""
    logger.info("Legacy post request from user %s", request.user_id)

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    marketplace_jobs = [
        MarketplaceJob(
            marketplace=mp,
            job_id=f"{mp}_{uuid.uuid4().hex[:8]}",
            status="queued",
        )
        for mp in request.listing_spec.target_marketplaces
    ]

    return PostListingResponse(
        job_id=job_id,
        status="processing",
        created_at=datetime.utcnow().isoformat(),
        marketplace_jobs=marketplace_jobs,
        estimated_completion="2-5 minutes",
    )


@app.get("/api/v1/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    return JobStatusResponse(
        job_id=job_id,
        status="completed",
        created_at=datetime.utcnow().isoformat(),
        completed_at=datetime.utcnow().isoformat(),
        marketplace_results=[],
    )


@app.delete("/api/v1/jobs/{job_id}")
async def cancel_job(job_id: str):
    return {"job_id": job_id, "status": "cancelled", "cancelled_at": datetime.utcnow().isoformat()}


# ── Startup / shutdown ────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    logger.info("=== Seller Crosspost Service v1.1.0 Starting ===")
    logger.info("eBay adapter: %s", "READY" if ebay_adapter else "NOT CONFIGURED")
    logger.info("Image storage: %s", IMAGES_DIR)
    logger.info("ngrok URL: %s", os.getenv("NGROK_URL") or "not set (using Unsplash placeholders)")
    logger.info("=== Service Ready on port 8003 ===")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("=== Seller Crosspost Service Shutting Down ===")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True, log_level="info")
