'use client'

import { ExternalLink, Star, ShoppingCart, Image as ImageIcon } from 'lucide-react'
import { Product } from '@/types'
import { useState } from 'react'

interface ProductCardProps {
  product: Product
  onShowDetails?: (product: Product) => void
}

export default function ProductCard({ product, onShowDetails }: ProductCardProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)

  const handleImageLoad = () => {
    setImageLoading(false)
  }

  const handleImageError = () => {
    setImageError(true)
    setImageLoading(false)
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price)
  }

  // Generate a placeholder image based on product category
  const getPlaceholderImage = (category: string) => {
    const categoryColors = {
      'sneakers': 'bg-red-100',
      'shoes': 'bg-blue-100', 
      'electronics': 'bg-purple-100',
      'clothing': 'bg-green-100',
      'books': 'bg-yellow-100',
      'home': 'bg-orange-100',
      'sports': 'bg-indigo-100',
      'beauty': 'bg-pink-100',
      'toys': 'bg-teal-100',
      'default': 'bg-gray-100'
    }
    
    const color = categoryColors[category.toLowerCase() as keyof typeof categoryColors] || categoryColors.default
    return color
  }

  return (
    <div className="group bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200 overflow-hidden">
      <div className="p-2 flex gap-2 h-full">
        {/* Product Image - Left Side */}
        <div className="relative w-16 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0">
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin"></div>
            </div>
          )}
          
          {!imageError && product.image && product.image !== '/placeholder-product.jpg' ? (
            <img
              src={product.image}
              alt={product.name}
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                imageLoading ? 'opacity-0' : 'opacity-100'
              }`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <ShoppingCart className="w-4 h-4 text-gray-400" />
            </div>
          )}
        </div>

        {/* Product Info - Right Side */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Product Name */}
          <h3 className="font-medium text-gray-900 text-xs line-clamp-2 leading-tight mb-1">
            {product.name}
          </h3>
          
          {/* Price */}
          <div className="mb-1">
            {product.compareAtPrice && product.compareAtPrice > product.price ? (
              /* Show both sale price and original price when on sale */
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-green-600 font-bold text-sm">
                    {formatPrice(product.price)}
                  </p>
                  <p className="text-gray-400 line-through text-xs">
                    {formatPrice(product.compareAtPrice)}
                  </p>
                </div>
                <div className="text-xs text-red-600 font-medium">
                  Save {formatPrice(product.compareAtPrice - product.price)}
                </div>
              </div>
            ) : (
              /* Show only regular price when not on sale */
              <p className="text-green-600 font-bold text-sm">
                {formatPrice(product.price)}
              </p>
            )}
          </div>

          {/* Category */}
          <div className="mb-2">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {product.category}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(product.url, '_blank');
              }}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1 rounded transition-colors duration-200 flex items-center justify-center"
            >
              <ShoppingCart className="w-3 h-3 mr-1" />
              <span className="truncate">Buy</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onShowDetails) {
                  onShowDetails(product);
                }
              }}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded transition-colors duration-200 flex items-center justify-center"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              <span className="truncate">Details</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 