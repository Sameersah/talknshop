#!/usr/bin/env python3
"""
Test script for RapidAPI Amazon Product API
Tests product details and search functionality
"""

import requests
import json
import sys
from typing import Dict, Any

# RapidAPI Configuration
RAPIDAPI_HOST = "real-time-amazon-data.p.rapidapi.com"
RAPIDAPI_BASE_URL = f"https://{RAPIDAPI_HOST}"

# You need to set your RapidAPI key here or pass as argument
RAPIDAPI_KEY = None


def test_product_details(api_key: str, asin: str = "B07ZPKBL9V"):
    """
    Test product details endpoint
    Example ASIN: B07ZPKBL9V
    """
    print("\n" + "="*60)
    print("TEST 1: Product Details")
    print("="*60)
    
    url = f"{RAPIDAPI_BASE_URL}/product-details"
    params = {
        "asin": asin,
        "country": "US"
    }
    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": api_key
    }
    
    print(f"\nRequesting product details for ASIN: {asin}")
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Pretty print the response
            print("\n" + "-"*60)
            print("RESPONSE DATA:")
            print("-"*60)
            print(json.dumps(data, indent=2))
            
            # Check for key fields
            print("\n" + "-"*60)
            print("KEY FIELDS CHECK:")
            print("-"*60)
            
            fields_to_check = [
                "product_title",
                "product_price",
                "product_rating",
                "product_images",
                "product_description",
                "product_availability",
                "product_url"
            ]
            
            for field in fields_to_check:
                if field in data:
                    value = data[field]
                    if isinstance(value, list):
                        print(f"✅ {field}: Found (list with {len(value)} items)")
                        if value and len(value) > 0:
                            print(f"   First item: {value[0]}")
                    elif isinstance(value, dict):
                        print(f"✅ {field}: Found (dict with keys: {list(value.keys())})")
                    else:
                        print(f"✅ {field}: {value}")
                else:
                    print(f"❌ {field}: Not found")
            
            # Check specifically for images
            print("\n" + "-"*60)
            print("IMAGES CHECK:")
            print("-"*60)
            
            # Check common image field names
            image_fields = ["product_images", "images", "image_url", "main_image", "thumbnail"]
            images_found = False
            
            for img_field in image_fields:
                if img_field in data:
                    images_found = True
                    img_data = data[img_field]
                    if isinstance(img_data, list) and len(img_data) > 0:
                        print(f"✅ Found {len(img_data)} images in '{img_field}'")
                        print(f"   First image URL: {img_data[0]}")
                    elif isinstance(img_data, str):
                        print(f"✅ Found image URL in '{img_field}': {img_data}")
                    break
            
            if not images_found:
                print("⚠️  No images found in common fields")
                print("   Available fields:", list(data.keys())[:10])
            
            return True, data
        else:
            print(f"\n❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
            
    except Exception as e:
        print(f"\n❌ Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None


def test_product_search(api_key: str, query: str = "laptop"):
    """
    Test product search endpoint
    """
    print("\n" + "="*60)
    print("TEST 2: Product Search")
    print("="*60)
    
    # Try different possible endpoints
    search_endpoints = [
        f"{RAPIDAPI_BASE_URL}/search",
        f"{RAPIDAPI_BASE_URL}/search-products",
        f"{RAPIDAPI_BASE_URL}/products/search"
    ]
    
    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": api_key
    }
    
    for url in search_endpoints:
        print(f"\nTrying endpoint: {url}")
        
        params = {
            "query": query,
            "country": "US",
            "page": "1"
        }
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                print(f"✅ Success! Status: {response.status_code}")
                print("\n" + "-"*60)
                print("SEARCH RESULTS:")
                print("-"*60)
                print(json.dumps(data, indent=2))
                
                # Check if it's a list of products or wrapped
                if isinstance(data, list):
                    print(f"\n✅ Found {len(data)} products")
                    if len(data) > 0:
                        print("\nFirst product keys:", list(data[0].keys()))
                elif isinstance(data, dict):
                    # Look for common result fields
                    result_fields = ["results", "products", "data", "items"]
                    for field in result_fields:
                        if field in data:
                            products = data[field]
                            print(f"\n✅ Found {len(products)} products in '{field}'")
                            if len(products) > 0:
                                print("First product keys:", list(products[0].keys()))
                            break
                    else:
                        print("\nAvailable top-level keys:", list(data.keys())[:10])
                
                return True, data
            elif response.status_code == 404:
                print(f"❌ Endpoint not found (404)")
                continue
            else:
                print(f"⚠️  Status: {response.status_code}")
                print(f"Response: {response.text[:200]}")
                continue
                
        except Exception as e:
            print(f"❌ Exception: {str(e)}")
            continue
    
    print("\n❌ No working search endpoint found")
    print("You may need to check RapidAPI documentation for the correct search endpoint")
    return False, None


def test_list_endpoints(api_key: str):
    """
    Try to discover available endpoints
    """
    print("\n" + "="*60)
    print("TEST 3: Discover Endpoints")
    print("="*60)
    
    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": api_key
    }
    
    # Common endpoints to try
    common_endpoints = [
        "",
        "/",
        "/search",
        "/products",
        "/search-products",
        "/products/search",
        "/product",
        "/product-details"
    ]
    
    print("\nTesting common endpoint patterns...")
    for endpoint in common_endpoints:
        url = f"{RAPIDAPI_BASE_URL}{endpoint}"
        try:
            response = requests.get(url, headers=headers, timeout=5)
            print(f"{url}: Status {response.status_code}")
        except:
            print(f"{url}: Connection error")


def main():
    print("="*60)
    print("RapidAPI Amazon Product API Test")
    print("="*60)
    
    # Get API key from command line or environment
    api_key = None
    if len(sys.argv) > 1:
        api_key = sys.argv[1]
    else:
        import os
        api_key = os.getenv("RAPIDAPI_KEY")
    
    if not api_key:
        print("\n❌ Error: RapidAPI key required!")
        print("\nUsage:")
        print("  python test_rapidapi.py YOUR_API_KEY")
        print("\nOr set environment variable:")
        print("  export RAPIDAPI_KEY=your_key_here")
        print("  python test_rapidapi.py")
        print("\nGet your key from: https://rapidapi.com/")
        sys.exit(1)
    
    print(f"\nUsing API Key: {api_key[:10]}...{api_key[-4:]}")
    
    # Test 1: Product Details
    success1, product_data = test_product_details(api_key, "B07ZPKBL9V")
    
    # Test 2: Product Search
    success2, search_data = test_product_search(api_key, "laptop")
    
    # Test 3: Discover endpoints
    test_list_endpoints(api_key)
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Product Details: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Product Search: {'✅ PASS' if success2 else '❌ FAIL'}")
    
    if success1:
        print("\n✅ Product Details endpoint works!")
        print("   Ready to integrate into catalog service")
    if success2:
        print("\n✅ Product Search endpoint works!")
        print("   Ready to integrate into catalog service")
    
    if not success1 and not success2:
        print("\n⚠️  Some endpoints may need different parameters")
        print("   Check RapidAPI documentation for correct usage")


if __name__ == "__main__":
    main()



