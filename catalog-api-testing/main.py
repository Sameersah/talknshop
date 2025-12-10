from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
import os
import logging

from models.search import SearchRequest, SearchResponse, Product
from services.rapidapi_amazon_client import RapidAPIAmazonClient
from services.kroger_client import KrogerAPIClient

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TalknShop Catalog Service",
    description="Catalog service with RapidAPI Amazon integration",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Templates for HTML pages
templates = Jinja2Templates(directory="templates")

# Initialize RapidAPI Amazon client
rapidapi_key = os.getenv("RAPIDAPI_KEY", "")
if not rapidapi_key:
    logger.warning("RAPIDAPI_KEY not set in environment variables. Set it in .env file.")
rapidapi_client = RapidAPIAmazonClient(api_key=rapidapi_key) if rapidapi_key else None

# Initialize Kroger API client
kroger_client_id = os.getenv("KROGER_CLIENT_ID", "")
kroger_client_secret = os.getenv("KROGER_CLIENT_SECRET", "")
if not kroger_client_id or not kroger_client_secret:
    logger.warning("KROGER_CLIENT_ID and KROGER_CLIENT_SECRET not set in environment variables.")
kroger_client = KrogerAPIClient(
    client_id=kroger_client_id,
    client_secret=kroger_client_secret
) if kroger_client_id and kroger_client_secret else None


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Home page with search interface"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
def health():
    """Health check endpoint"""
    return {"status": "ok", "service": "catalog-service"}


@app.post("/api/v1/search", response_model=SearchResponse)
async def search_products(request: SearchRequest):
    """
    Search products using RapidAPI Amazon API
    
    Args:
        request: Search request with query and optional filters
    
    Returns:
        SearchResponse with products and metadata
    """
    try:
        logger.info(f"Received search request: query='{request.query}'")
        
        if not rapidapi_client:
            raise HTTPException(
                status_code=500,
                detail="RapidAPI key not configured. Please set RAPIDAPI_KEY in .env file."
            )
        
        # Get platforms to search (default to amazon)
        platforms_to_search = request.filters.platforms if request.filters and request.filters.platforms else ["amazon"]
        
        # Search multiple platforms
        products = []
        
        # Search Amazon if included
        if "amazon" in platforms_to_search:
            logger.info("Searching RapidAPI Amazon...")
            page = request.pagination.page if request.pagination else 1
            
            # Determine sort_by parameter for RapidAPI
            rapidapi_sort = "RELEVANCE"
            if request.sort_by:
                if request.sort_by == "price_asc":
                    rapidapi_sort = "PRICE_LOW_TO_HIGH"
                elif request.sort_by == "price_desc":
                    rapidapi_sort = "PRICE_HIGH_TO_LOW"
            
            amazon_results = await rapidapi_client.search_products(
                query=request.query,
                page=page,
                country="US",
                sort_by=rapidapi_sort
            )
            products.extend(amazon_results)
            logger.info(f"Found {len(amazon_results)} products from Amazon")
        
        # Search Kroger if included
        if "kroger" in platforms_to_search:
            if not kroger_client:
                logger.warning("Kroger API not configured. Skipping Kroger search.")
            else:
                try:
                    logger.info("Searching Kroger API...")
                    page = request.pagination.page if request.pagination else 1
                    size = request.pagination.size if request.pagination else 20
                    start = (page - 1) * size
                    
                    # Try to get location_id from zip code (optional - for prices)
                    zip_code = os.getenv("KROGER_ZIP_CODE", "95112")  # Default to San Jose
                    
                    kroger_results = await kroger_client.search_products(
                        query=request.query,
                        limit=size,
                        start=start,
                        zip_code=zip_code
                    )
                    products.extend(kroger_results)
                    logger.info(f"Found {len(kroger_results)} products from Kroger")
                except Exception as e:
                    logger.error(f"Error searching Kroger: {str(e)}")
                    # Continue with other platforms even if Kroger fails
        
        # Apply price filters
        if request.filters:
            if request.filters.price_min is not None:
                products = [p for p in products if p.price and p.price >= request.filters.price_min]
            if request.filters.price_max is not None:
                products = [p for p in products if p.price and p.price <= request.filters.price_max]
        
        # Apply sorting (additional client-side sorting)
        if request.sort_by:
            if request.sort_by == "price_asc":
                products = sorted(products, key=lambda p: p.price or float('inf'))
            elif request.sort_by == "price_desc":
                products = sorted(products, key=lambda p: p.price or 0, reverse=True)
            elif request.sort_by == "rating_desc":
                products = sorted(products, key=lambda p: p.rating or 0, reverse=True)
        
        # Apply pagination
        page = request.pagination.page if request.pagination else 1
        size = request.pagination.size if request.pagination else 20
        start_idx = (page - 1) * size
        end_idx = start_idx + size
        paginated_products = products[start_idx:end_idx]
        
        response = SearchResponse(
            query=request.query,
            total_results=len(products),
            page=page,
            size=len(paginated_products),
            products=paginated_products
        )
        
        logger.info(f"Returning {len(paginated_products)} products (page {page})")
        return response
        
    except Exception as e:
        logger.error(f"Error searching products: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error searching products: {str(e)}")


@app.get("/api/v1/products/{product_id}", response_model=Product)
async def get_product_details(product_id: str):
    """
    Get detailed product information by product ID (ASIN)
    
    Args:
        product_id: Product ID (Amazon ASIN)
    
    Returns:
        Product with detailed information
    """
    try:
        if not rapidapi_client:
            raise HTTPException(
                status_code=500,
                detail="RapidAPI key not configured"
            )
        
        # Extract ASIN from product_id (format: amazon_ASIN or just ASIN)
        asin = product_id.replace("amazon_", "") if product_id.startswith("amazon_") else product_id
        
        logger.info(f"Fetching product details for ASIN: {asin}")
        
        # Get detailed product information
        details = await rapidapi_client.get_product_details(asin)
        
        if not details:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # Transform to Product model
        price_str = details.get("product_price", "0")
        price = None
        try:
            price = float(str(price_str).replace("$", "").replace(",", "").strip())
        except:
            pass
        
        rating = None
        try:
            rating = float(details.get("product_star_rating", "0"))
        except:
            pass
        
        review_count = None
        try:
            review_count = int(details.get("product_num_ratings", "0"))
        except:
            pass
        
        availability = "out_of_stock"
        availability_text = details.get("product_availability", "")
        if availability_text and any(word in availability_text.lower() for word in ["in stock", "available", "order soon"]):
            availability = "in_stock"
        
        product = Product(
            id=f"amazon_{asin}",
            title=details.get("product_title", "Unknown Product"),
            brand=details.get("product_details", {}).get("Brand") if isinstance(details.get("product_details"), dict) else None,
            price=price,
            currency=details.get("currency", "USD"),
            platform="amazon",
            platform_id=asin,
            rating=rating,
            review_count=review_count,
            image_url=details.get("product_photo"),
            availability=availability,
            shipping_info=None,  # Can be enhanced later
            description=details.get("product_description"),
            url=details.get("product_url")
        )
        
        return product
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching product details: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching product details: {str(e)}")


@app.get("/api/v1/products/{product_id}/reviews")
async def get_product_reviews(product_id: str, page: int = 1):
    """
    Get product reviews
    
    Args:
        product_id: Product ID (Amazon ASIN)
        page: Page number
    
    Returns:
        List of reviews
    """
    try:
        if not rapidapi_client:
            raise HTTPException(status_code=500, detail="RapidAPI key not configured")
        
        asin = product_id.replace("amazon_", "") if product_id.startswith("amazon_") else product_id
        
        reviews = await rapidapi_client.get_product_reviews(asin, page=page)
        
        return {"reviews": reviews or [], "page": page}
        
    except Exception as e:
        logger.error(f"Error fetching reviews: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching reviews: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)

