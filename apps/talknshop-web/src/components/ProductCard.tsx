/**
 * Product card – vertical (height > width). Image takes most space; details below.
 * Availability shown only when in stock (not "out_of_stock").
 */

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { ProductResult } from '../types';

interface ProductCardProps {
  product: ProductResult;
}

/** Show availability only when it looks like "in stock" (not out_of_stock) */
function showAvailability(availability?: string): boolean {
  if (!availability || !availability.trim()) return false;
  const v = availability.trim().toLowerCase();
  if (v === 'out_of_stock' || v === 'out of stock') return false;
  return true;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md overflow-hidden transition-shadow duration-200 flex flex-col w-full">
      {/* Image – top, most of the space (~70% of card) */}
      <div className="relative w-full aspect-[3/4] min-h-[200px] bg-gray-100 flex-shrink-0">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = 'https://via.placeholder.com/240x320?text=No+Image';
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            No image
          </div>
        )}
      </div>

      {/* Details – bottom, rest of space */}
      <div className="flex flex-col flex-1 min-h-0 p-3">
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1.5">
          {product.title}
        </h3>

        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-base font-bold text-violet-600">
            {product.currency} {product.price.toFixed(2)}
          </span>
          {product.rating != null && (
            <span className="flex items-center text-xs text-gray-600">
              <span className="text-amber-500 mr-0.5">★</span>
              {product.rating.toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {product.marketplace}
          </span>
          {showAvailability(product.availability) && (
            <span className="text-xs text-emerald-600 font-medium">
              ✓ {product.availability}
            </span>
          )}
        </div>

        <a
          href={product.deep_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 transition-colors"
        >
          View product
          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
        </a>
      </div>
    </div>
  );
};
