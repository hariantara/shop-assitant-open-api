export interface Product {
  id: string
  name: string
  description: string
  price: number
  currency: string
  image: string
  category: string
  url: string
  rating?: number
  reviewCount?: number
  inStock?: boolean
  compareAtPrice?: number
}

export interface SearchResult {
  message?: string
  products?: Product[]
  categories?: string[]
  suggestions?: string[]
}

export interface SearchRequest {
  query: string
  websiteUrl: string
} 