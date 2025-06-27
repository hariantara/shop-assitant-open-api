import { NextRequest, NextResponse } from 'next/server'

// Environment variables
const DEEPSEEK_API_KEY = process.env.OPENROUTER_API_KEY
const DEEPSEEK_BASE_URL = 'https://openrouter.ai/api/v1'
const DEEPSEEK_MODEL = 'deepseek/deepseek-chat'

export async function POST(request: NextRequest) {
  try {
    const { product, storeUrl } = await request.json()

    if (!product || !storeUrl) {
      return NextResponse.json(
        { error: 'Product and store URL are required' },
        { status: 400 }
      )
    }

    console.log(`🔍 === PRODUCT DETAILS DEBUG ===`)
    console.log(`🔍 Product name: ${product.name}`)
    console.log(`🔍 Product ID: ${product.id}`)
    console.log(`🔍 Product URL: ${product.url}`)
    console.log(`🔍 Store URL: ${storeUrl}`)
    console.log(`🔍 Current description: "${product.description}"`)
    console.log(`🔍 Description length: ${product.description?.length || 0}`)

    // Try multiple approaches to fetch detailed product information
    let detailedProduct = null
    const baseUrl = storeUrl.replace(/\/$/, '')
    
    // Method 1: Try using the product handle from the existing URL
    if (product.url && product.url.includes('/products/')) {
      try {
        const urlParts = product.url.split('/products/')
        if (urlParts.length > 1) {
          const handle = urlParts[1].split('?')[0].split('#')[0] // Remove query parameters and anchors
          const productUrl = `${baseUrl}/products/${handle}.json?currency=USD`
          console.log(`📡 Method 1 - Trying handle: "${handle}"`)
          console.log(`📡 Method 1 - Full URL: ${productUrl}`)
          
          const response = await fetch(productUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json'
            }
          })

          console.log(`📡 Method 1 - Response status: ${response.status}`)
          if (response.ok) {
            const data = await response.json()
            detailedProduct = data.product
            console.log(`✅ Method 1 SUCCESS!`)
            console.log(`✅ Product title: ${detailedProduct.title}`)
            console.log(`✅ Body HTML length: ${detailedProduct.body_html?.length || 0}`)
            console.log(`✅ First 100 chars of body_html: ${detailedProduct.body_html?.substring(0, 100) || 'N/A'}`)
          } else {
            const errorText = await response.text()
            console.log(`⚠️ Method 1 failed - Error: ${errorText}`)
          }
        }
      } catch (error) {
        console.log(`⚠️ Method 1 error:`, error)
      }
    }
    
    // Method 2: Try different handle variations
    if (!detailedProduct && product.url) {
      const possibleHandles = []
      
      // Extract handle from URL in different ways
      if (product.url.includes('/products/')) {
        const urlPath = product.url.split('/products/')[1]
        possibleHandles.push(urlPath.split('?')[0].split('#')[0])
        
        // Try with different URL endings removed
        const cleanHandle = urlPath.split('?')[0].split('#')[0].split('/')[0]
        if (cleanHandle !== possibleHandles[0]) {
          possibleHandles.push(cleanHandle)
        }
      }
      
      // Try using product name as handle (slugified)
      if (product.name) {
        const slugifiedName = product.name
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
        possibleHandles.push(slugifiedName)
      }
      
      console.log(`📡 Method 2 - Trying handles: ${possibleHandles.join(', ')}`)
      
      for (const handle of possibleHandles) {
        if (detailedProduct || !handle) continue
        
        try {
          const productUrl = `${baseUrl}/products/${handle}.json?currency=USD`
          console.log(`📡 Method 2 - Trying: ${productUrl}`)
          
          const response = await fetch(productUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json'
            }
          })

          if (response.ok) {
            const data = await response.json()
            detailedProduct = data.product
            console.log(`✅ Method 2 SUCCESS with handle: ${handle}`)
            break
          } else {
            console.log(`⚠️ Method 2 failed for handle: ${handle} (${response.status})`)
          }
        } catch (error) {
          console.log(`⚠️ Method 2 error for handle ${handle}:`, error)
        }
      }
    }
    
    // Method 3: Try fetching from the all products endpoint and find our product
    if (!detailedProduct) {
      try {
        console.log(`📡 Method 3 - Searching in all products`)
        const allProductsUrl = `${baseUrl}/products.json?limit=250&currency=USD`
        
        const response = await fetch(allProductsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          console.log(`📡 Method 3 - Found ${data.products.length} products`)
          
          // Find the product by ID, title, or handle
          const foundProduct = data.products.find((p: any) => {
            const idMatch = p.id?.toString() === product.id?.toString()
            const titleMatch = p.title?.toLowerCase() === product.name?.toLowerCase()
            const handleMatch = product.url && product.url.includes(p.handle)
            
            console.log(`📡 Checking product: ${p.title}`)
            console.log(`📡 - ID match: ${idMatch} (${p.id} vs ${product.id})`)
            console.log(`📡 - Title match: ${titleMatch}`)
            console.log(`📡 - Handle match: ${handleMatch}`)
            
            return idMatch || titleMatch || handleMatch
          })
          
          if (foundProduct) {
            detailedProduct = foundProduct
            console.log(`✅ Method 3 SUCCESS - Found: ${foundProduct.title}`)
            console.log(`✅ Body HTML length: ${foundProduct.body_html?.length || 0}`)
          } else {
            console.log(`⚠️ Method 3 - Product not found in ${data.products.length} products`)
            // Log first few product titles for debugging
            console.log(`📡 Available products: ${data.products.slice(0, 5).map((p: any) => p.title).join(', ')}`)
          }
        } else {
          console.log(`⚠️ Method 3 failed with status: ${response.status}`)
        }
      } catch (error) {
        console.log(`⚠️ Method 3 error:`, error)
      }
    }

    // Use detailed product if available, otherwise use provided product
    const productData = detailedProduct || product
    
    // Log final results
    console.log(`🔍 === FINAL RESULTS ===`)
    if (detailedProduct) {
      console.log(`✅ SUCCESS: Using detailed product data`)
      console.log(`📄 Product title: ${detailedProduct.title}`)
      console.log(`📄 Body HTML length: ${detailedProduct.body_html?.length || 0}`)
      console.log(`📄 Body HTML preview: ${detailedProduct.body_html?.substring(0, 200) || 'N/A'}`)
    } else {
      console.log(`❌ FALLBACK: Using provided product data (truncated)`)
      console.log(`📄 Description: ${product.description}`)
    }

    // Get shipping information
    const shippingInfo = await getShippingInformation(storeUrl)

    // Generate AI-powered product analysis
    const aiAnalysis = await generateProductAnalysis(productData, shippingInfo)

    const result = {
      product: formatDetailedProduct(productData, storeUrl),
      shipping: shippingInfo,
      analysis: aiAnalysis,
      success: true,
      debug: {
        usedDetailedData: !!detailedProduct,
        originalDescriptionLength: product.description?.length || 0,
        finalDescriptionLength: productData.body_html?.length || productData.description?.length || 0
      }
    }

    console.log(`🔍 === RESPONSE DEBUG ===`)
    console.log(`📄 Final description length: ${result.product.description?.length || 0}`)
    console.log(`📄 Final description preview: ${result.product.description?.substring(0, 200) || 'N/A'}`)

    return NextResponse.json(result)

  } catch (error) {
    console.error('Product details API error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch product details',
        success: false
      },
      { status: 500 }
    )
  }
}

// Get shipping information from store
async function getShippingInformation(storeUrl: string) {
  const shippingInfo: any = {
    methods: [
      { name: "Standard Shipping", cost: "Free over $50", delivery: "5-7 business days" },
      { name: "Express Shipping", cost: "$12.99", delivery: "2-3 business days" },
      { name: "Overnight Shipping", cost: "$24.99", delivery: "1 business day" }
    ],
    freeShippingThreshold: 50,
    returnPolicy: "30-day return policy",
    estimatedDelivery: "3-7 business days"
  }

  // Try to fetch actual shipping policies from common store pages
  const shippingPages = ['/pages/shipping', '/policies/shipping-policy', '/shipping']
  
  for (const page of shippingPages) {
    try {
      const response = await fetch(`${storeUrl}${page}`, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      if (response.ok) {
        shippingInfo.policyUrl = `${storeUrl}${page}`
        break
      }
    } catch (error) {
      // Continue to next page
    }
  }

  return shippingInfo
}

// Generate AI-powered product analysis
async function generateProductAnalysis(product: any, shipping: any) {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-or-v1-...') {
    return {
      summary: `This is a ${product.product_type || 'product'} available for purchase.`,
      highlights: ['Available for purchase', 'Multiple shipping options available'],
      recommendation: 'Consider your needs and budget when making a purchase decision.'
    }
  }

  const productInfo = {
    name: product.title || product.name,
    price: product.variants?.[0]?.price || product.price,
    category: product.product_type || product.category,
    description: product.body_html ? product.body_html.replace(/<[^>]*>/g, '') : product.description,
    variants: product.variants || [],
    images: product.images || [],
    vendor: product.vendor || 'Unknown'
  }

  const prompt = `Analyze this product and provide detailed insights:

Product: ${JSON.stringify(productInfo, null, 2)}

Shipping Info: ${JSON.stringify(shipping, null, 2)}

Please provide a comprehensive analysis in this JSON format:
{
  "summary": "2-3 sentence product overview",
  "highlights": ["key feature 1", "key feature 2", "key feature 3"],
  "pros": ["advantage 1", "advantage 2"],
  "considerations": ["thing to consider 1", "thing to consider 2"],
  "sizeGuide": "sizing advice if applicable",
  "careInstructions": "care instructions if applicable",
  "shippingAdvice": "shipping recommendations based on product type",
  "recommendation": "personalized buying recommendation"
}

Focus on:
- Product quality and value assessment
- Practical usage advice
- Shipping considerations for this product type
- Size/fit guidance if clothing/shoes
- Care and maintenance tips
- Overall purchase recommendation`

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.3
      })
    })

    if (response.ok) {
      const data = await response.json()
      const content = data.choices[0]?.message?.content
      
      try {
        return JSON.parse(content)
      } catch (parseError) {
        console.log('⚠️ Failed to parse AI analysis, using fallback')
      }
    }
  } catch (error) {
    console.log(`⚠️ AI analysis failed:`, error)
  }

  // Fallback analysis
  return {
    summary: `${productInfo.name} is a ${productInfo.category} priced at $${productInfo.price}. This product offers good value and quality.`,
    highlights: ['Quality construction', 'Competitive pricing', 'Reliable shipping'],
    pros: ['Good value for money', 'Available for immediate purchase'],
    considerations: ['Check size guide before ordering', 'Review return policy'],
    shippingAdvice: `Standard shipping available. Consider express shipping for faster delivery.`,
    recommendation: 'This appears to be a solid choice. Review the details and consider your specific needs.'
  }
}

// Format detailed product information
function formatDetailedProduct(product: any, storeUrl: string) {
  const baseUrl = storeUrl.replace(/\/$/, '')
  
  // Improved URL logic - use handle if available, otherwise try to construct from product data, or fallback to original URL
  let productUrl = baseUrl; // default fallback
  
  if (product.handle) {
    // Use handle to construct proper product URL
    productUrl = `${baseUrl}/products/${product.handle}`;
  } else if (product.url && product.url !== baseUrl) {
    // Use original product URL if it's different from base URL
    productUrl = product.url;
  } else if (product.id) {
    // Try constructing URL with ID as handle (common pattern)
    productUrl = `${baseUrl}/products/${product.id}`;
  }
  
  // Process the full description properly
  let fullDescription = '';
  if (product.body_html) {
    // Remove HTML tags and clean up the description
    fullDescription = product.body_html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with spaces
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  } else if (product.description && !product.description.endsWith('...')) {
    // Use description if it's not truncated
    fullDescription = product.description;
  }
  
  console.log(`📄 Processing description:`);
  console.log(`📄 Original body_html length: ${product.body_html?.length || 0}`);
  console.log(`📄 Processed description length: ${fullDescription.length}`);
  console.log(`📄 First 200 chars: ${fullDescription.substring(0, 200)}`);
  
  // Format price consistently with search API
  const rawPrice = product.variants?.[0]?.price || product.price || "0";
  let formattedPrice = 0;
  if (rawPrice !== "0") {
    const numPrice = parseFloat(rawPrice);
    // Since we're requesting USD currency, prices should already be in dollars
    // Only divide by 100 if the price seems unreasonably high (likely in cents)
    formattedPrice = numPrice > 10000 ? numPrice / 100 : numPrice;
    console.log(`💰 Price formatting: raw="${rawPrice}" → parsed=${numPrice} → formatted=${formattedPrice} (divided by 100: ${numPrice > 10000})`);
  }
  
  const rawComparePrice = product.variants?.[0]?.compare_at_price || "0";
  let formattedComparePrice = 0;
  if (rawComparePrice !== "0") {
    const numComparePrice = parseFloat(rawComparePrice);
    formattedComparePrice = numComparePrice > 10000 ? numComparePrice / 100 : numComparePrice;
  }

  return {
    id: product.id?.toString() || '',
    name: product.title || product.name || '',
    description: fullDescription,
    price: formattedPrice,
    compareAtPrice: formattedComparePrice,
    currency: 'USD',
    images: product.images?.map((img: any) => img.src || img) || [product.image],
    category: product.product_type || product.category || 'General',
    vendor: product.vendor || 'Unknown',
    tags: Array.isArray(product.tags) ? product.tags : (product.tags || '').split(',').map((t: string) => t.trim()),
    variants: product.variants?.map((variant: any) => {
      const variantRawPrice = variant.price || "0";
      let variantFormattedPrice = 0;
      if (variantRawPrice !== "0") {
        const variantNumPrice = parseFloat(variantRawPrice);
        variantFormattedPrice = variantNumPrice > 10000 ? variantNumPrice / 100 : variantNumPrice;
      }
      
      return {
        id: variant.id,
        title: variant.title,
        price: variantFormattedPrice,
        available: variant.available || false,
        option1: variant.option1,
        option2: variant.option2,
        option3: variant.option3
      };
    }) || [],
    options: product.options || [],
    url: productUrl,
    createdAt: product.created_at,
    updatedAt: product.updated_at
  }
} 