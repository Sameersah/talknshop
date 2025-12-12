/**
 * Product card component for displaying search results
 */

import React from 'react';
import { ProductResult } from '../types';

interface ProductCardProps {
  product: ProductResult;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-200 overflow-hidden border border-gray-200">
      <div className="flex">
        {/* Product Image */}
        {product.image_url && (
          <div className="flex-shrink-0 w-24 h-24 bg-gray-100">
            <img
              src={product.image_url}
              alt={product.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = 'https://via.placeholder.com/96?text=No+Image';
              }}
            />
          </div>
        )}

        {/* Product Info */}
        <div className="flex-1 p-3">
          <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">
            {product.title}
          </h3>
          
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-bold text-indigo-600">
              {product.currency} {product.price.toFixed(2)}
            </span>
            
            {product.rating && (
              <div className="flex items-center text-xs text-gray-600">
                <span className="text-yellow-500 mr-1">★</span>
                <span>{product.rating.toFixed(1)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {product.marketplace}
            </span>
            
            <a
              href={product.deep_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              View Product →
            </a>
          </div>

          {product.availability && (
            <p className="text-xs text-green-600 mt-1">
              ✓ {product.availability}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};






