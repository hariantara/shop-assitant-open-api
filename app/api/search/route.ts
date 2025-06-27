import { NextRequest, NextResponse } from 'next/server'
import { SearchRequest, SearchResult } from '@/types'

// DeepSeek API configuration
const DEEPSEEK_API_KEY = process.env.OPENROUTER_API_KEY || 'sk-or-v1-...'
const DEEPSEEK_BASE_URL = 'https://openrouter.ai/api/v1'
const DEEPSEEK_MODEL = 'deepseek/deepseek-chat'
// Alternative: Fireworks AI
// const DEEPSEEK_API_KEY = "fw_3ZV61SdV1JH59UvyfnChMRPP"
// const DEEPSEEK_BASE_URL = 'https://api.fireworks.ai/inference/v1'
// const DEEPSEEK_MODEL = 'accounts/fireworks/models/mixtral-8x7b-instruct'

// Batch processing configuration
const BATCH_SIZE = 50; // Process products in batches of 50
const MAX_BATCHES = 10; // Limit to prevent timeout

// In-memory cache for AI catalog understanding
const catalogCache = new Map<string, any>();
const userSessionCache = new Map<string, any>();

// AI-powered query processing replaces manual synonym mapping
// The system now uses advanced NLP to understand user intent, correct typos, and extract product categories

// AI Catalog Analysis - Process products in batches and build understanding
async function analyzeCatalogWithAI(products: any[], storeUrl: string): Promise<any> {
  const cacheKey = `catalog_${storeUrl}`;
  
  // Check if we already analyzed this store
  if (catalogCache.has(cacheKey)) {
    console.log(`📚 Using cached catalog analysis for ${storeUrl}`);
    return catalogCache.get(cacheKey);
  }

  console.log(`🧠 Starting AI catalog analysis for ${products.length} products...`);
  
  const catalogInsights = {
    totalProducts: products.length,
    categories: new Set<string>(),
    brands: new Set<string>(),
    priceRanges: { min: Infinity, max: 0 },
    popularItems: [] as string[],
    seasonalItems: [] as string[],
    recommendations: [] as string[],
    searchPatterns: new Map<string, string[]>()
  };

  // Process products in batches
  const batches = [];
  for (let i = 0; i < products.length && i < BATCH_SIZE * MAX_BATCHES; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE));
  }

  console.log(`📦 Processing ${batches.length} batches of products...`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} products)`);

    // Extract insights from this batch
    batch.forEach((product: any) => {
      if (product.product_type) catalogInsights.categories.add(product.product_type);
      if (product.vendor) catalogInsights.brands.add(product.vendor);
      
      const price = parseFloat(product.variants?.[0]?.price || 0);
      if (price > 0) {
        catalogInsights.priceRanges.min = Math.min(catalogInsights.priceRanges.min, price);
        catalogInsights.priceRanges.max = Math.max(catalogInsights.priceRanges.max, price);
      }
    });

    // Let AI analyze this batch if API is available
    try {
      const batchAnalysis = await analyzeProductBatch(batch, batchIndex + 1, batches.length);
      if (batchAnalysis) {
        // Merge insights from AI analysis
        if (batchAnalysis.popularItems && Array.isArray(batchAnalysis.popularItems)) {
          catalogInsights.popularItems.push(...batchAnalysis.popularItems);
        }
        if (batchAnalysis.seasonalItems && Array.isArray(batchAnalysis.seasonalItems)) {
          catalogInsights.seasonalItems.push(...batchAnalysis.seasonalItems);
        }
      }
    } catch (error) {
      console.log(`⚠️ AI batch analysis failed for batch ${batchIndex + 1}, continuing...`);
    }
  }

  // Finalize insights
  const finalInsights = {
    ...catalogInsights,
    categories: [...catalogInsights.categories],
    brands: [...catalogInsights.brands],
    priceRanges: {
      min: catalogInsights.priceRanges.min === Infinity ? 0 : catalogInsights.priceRanges.min,
      max: catalogInsights.priceRanges.max
    }
  };

  // Cache the results
  catalogCache.set(cacheKey, finalInsights);
  console.log(`✅ Catalog analysis complete! Found ${finalInsights.categories.length} categories, ${finalInsights.brands.length} brands`);
  
  return finalInsights;
}

// Analyze individual product batch with AI
async function analyzeProductBatch(products: any[], batchNum: number, totalBatches: number): Promise<any> {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-or-v1-...') {
    return null;
  }

  const productSummary = products.slice(0, 10).map(p => ({
    title: p.title,
    type: p.product_type,
    price: p.variants?.[0]?.price,
    vendor: p.vendor
  }));

  const prompt = `Analyze this product batch (${batchNum}/${totalBatches}):

${JSON.stringify(productSummary, null, 2)}

Provide insights in this JSON format:
{
  "popularItems": ["item1", "item2"],
  "seasonalItems": ["seasonal1", "seasonal2"],
  "trends": ["trend1", "trend2"]
}

Focus on identifying popular items and seasonal trends. Keep response concise.`;

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
        max_tokens: 500,
        temperature: 0.3
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      try {
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
  } catch (error) {
    console.log(`⚠️ Batch analysis failed:`, error);
  }
  
  return null;
}

// Dynamic Store Intelligence - Learn about ANY website automatically
function getStoreSpecialty(hostname: string, catalogInsights: any, products: any[]): string {
  const categories = catalogInsights.categories || [];
  const brands = catalogInsights.brands || [];
  
  // Analyze product catalog to understand store specialty
  const analysis = analyzeStoreFromProducts(products, hostname);
  
  let specialty = `${analysis.storeType} - specializes in ${analysis.mainProducts.join(', ')}`;
  
  if (analysis.keyFeatures.length > 0) {
    specialty += `. Key features: ${analysis.keyFeatures.join(', ')}`;
  }
  
  if (brands.length > 0) {
    specialty += `. Available brands: ${brands.slice(0, 5).join(', ')}${brands.length > 5 ? ' and more' : ''}`;
  }
  
  return specialty;
}

// Analyze any store's products to understand what they sell
function analyzeStoreFromProducts(products: any[], hostname: string): any {
  const analysis = {
    storeType: 'Online retail store',
    mainProducts: [] as string[],
    keyFeatures: [] as string[],
    priceSegment: 'mid-range',
    targetAudience: [] as string[]
  };
  
  // Analyze product titles and types to understand specialization
  const productTitles = products.map(p => (p.title || '').toLowerCase()).join(' ');
  const productTypes = products.map(p => (p.product_type || '').toLowerCase());
  const vendors = products.map(p => (p.vendor || '').toLowerCase());
  const allText = `${productTitles} ${productTypes.join(' ')} ${vendors.join(' ')}`;
  
  // Detect store type based on products
  if (hostname.includes('allbirds') || allText.includes('sustainable') || allText.includes('eco')) {
    analysis.storeType = 'Sustainable fashion retailer';
    analysis.keyFeatures.push('eco-friendly materials', 'sustainable practices');
  } else if (allText.includes('tech') || allText.includes('electronic') || allText.includes('gadget')) {
    analysis.storeType = 'Technology retailer';
  } else if (allText.includes('fashion') || allText.includes('style') || allText.includes('designer')) {
    analysis.storeType = 'Fashion retailer';
  } else if (allText.includes('home') || allText.includes('furniture') || allText.includes('decor')) {
    analysis.storeType = 'Home goods retailer';
  } else if (allText.includes('beauty') || allText.includes('cosmetic') || allText.includes('skincare')) {
    analysis.storeType = 'Beauty and cosmetics retailer';
  }
  
  // Detect main product categories
  const categoryCount = new Map<string, number>();
  
  productTypes.forEach(type => {
    if (type) {
      // Normalize common product types
      if (type.includes('shoe') || type.includes('sneaker') || type.includes('boot') || type.includes('sandal')) {
        categoryCount.set('footwear', (categoryCount.get('footwear') || 0) + 1);
      } else if (type.includes('apparel') || type.includes('shirt') || type.includes('tee') || type.includes('hoodie') || type.includes('jacket')) {
        categoryCount.set('apparel', (categoryCount.get('apparel') || 0) + 1);
      } else if (type.includes('accessori') || type.includes('bag') || type.includes('hat') || type.includes('cap')) {
        categoryCount.set('accessories', (categoryCount.get('accessories') || 0) + 1);
      } else if (type.includes('sock')) {
        categoryCount.set('socks', (categoryCount.get('socks') || 0) + 1);
      } else {
        categoryCount.set(type, (categoryCount.get('type') || 0) + 1);
      }
    }
  });
  
  // Get top categories
  const sortedCategories = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);
  
  analysis.mainProducts = sortedCategories.length > 0 ? sortedCategories : ['general merchandise'];
  
  // Detect target audience
  if (allText.includes('women') || allText.includes('womens')) {
    analysis.targetAudience.push('women');
  }
  if (allText.includes('men') || allText.includes('mens')) {
    analysis.targetAudience.push('men');
  }
  if (allText.includes('kid') || allText.includes('child')) {
    analysis.targetAudience.push('children');
  }
  
  // Detect price segment
  const prices = products
    .map(p => parseFloat(p.variants?.[0]?.price || 0))
    .filter(p => p > 0);
  
  if (prices.length > 0) {
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (avgPrice < 30) {
      analysis.priceSegment = 'budget-friendly';
    } else if (avgPrice > 100) {
      analysis.priceSegment = 'premium';
    } else {
      analysis.priceSegment = 'mid-range';
    }
  }
  
  // Add price segment to features
  analysis.keyFeatures.push(`${analysis.priceSegment} pricing`);
  
  // Add target audience to features if detected
  if (analysis.targetAudience.length > 0) {
    analysis.keyFeatures.push(`targets ${analysis.targetAudience.join(' and ')}`);
  }
  
  return analysis;
}

function getAvailabilityRules(catalogInsights: any, products: any[]): string {
  const categories = catalogInsights.categories || [];
  const priceRange = catalogInsights.priceRanges || { min: 0, max: 1000 };
  const analysis = analyzeStoreFromProducts(products, '');
  
  // Generate specific examples based on what this store actually sells
  const availableProducts = analysis.mainProducts;
  const commonRequests = ['hats', 'pants', 'dresses', 'jewelry', 'electronics', 'books'];
  const unavailableItems = commonRequests.filter((item: string) => 
    !availableProducts.some((product: string) => product.includes(item.toLowerCase()))
  );
  
  let rules = `CRITICAL - Only search for products that actually exist in this store:
- Available categories: ${categories.join(', ')}
- Main products: ${availableProducts.join(', ')}
- Price range: $${priceRange.min.toFixed(2)} - $${priceRange.max.toFixed(2)}
- Store type: ${analysis.storeType}
- DO NOT add price filters unless user specifically mentions price

SEARCH RULES FOR THIS SPECIFIC STORE:
- ONLY search for categories that exist: ${availableProducts.join(', ')}
- If user asks for: ${unavailableItems.slice(0, 3).join(', ')}, etc. → Explain store doesn't carry these, suggest: ${availableProducts.slice(0, 3).join(', ')}

CORRECT EXAMPLES FOR THIS STORE:`;

  // Generate dynamic examples based on actual products
  availableProducts.forEach((product: string) => {
    rules += `\n- User: "${product}" → search_products({"query": "${product}"}) - NO price_range`;
    rules += `\n- User: "any ${product}" → search_products({"query": "${product}"}) - NO price_range`;
  });
  
  rules += `\n- User: "${availableProducts[0]} under $50" → search_products({"query": "${availableProducts[0]}", "price_range": "under 50"})`;
  
  if (unavailableItems.length > 0) {
    rules += `\n- User: "${unavailableItems[0]}" → Explain store doesn't carry ${unavailableItems[0]}, suggest ${availableProducts[0]} instead`;
  }

  return rules;
}

// Enhanced User Session Management with Conversation State
function getUserSession(sessionId: string = 'default') {
  if (!userSessionCache.has(sessionId)) {
    userSessionCache.set(sessionId, {
      searchHistory: [],
      preferences: {},
      viewedProducts: [],
      budget: null,
      style: null,
      conversationState: 'initial', // initial, consulting, ready_to_show, browsing
      consultationData: {
        productType: null,
        style: null,
        occasion: null,
        budget: null,
        color: null,
        size: null,
        brand: null
      },
      questionsAsked: [],
      lastActivity: Date.now()
    });
  }
  return userSessionCache.get(sessionId);
}

function updateUserSession(sessionId: string, data: any) {
  const session = getUserSession(sessionId);
  Object.assign(session, data, { lastActivity: Date.now() });
  userSessionCache.set(sessionId, session);
}

// Conversation State Management
function shouldStartConsultation(query: string, userSession: any): boolean {
  const lowerQuery = query.toLowerCase();
  
  // If it's a very specific query with details, skip consultation
  const isSpecificQuery = (
    (lowerQuery.includes('$') && /\d+/.test(lowerQuery)) || // Has price
    (lowerQuery.includes('size') && /\d+/.test(lowerQuery)) || // Has size
    (lowerQuery.includes('color') && (lowerQuery.includes('black') || lowerQuery.includes('white') || lowerQuery.includes('blue') || lowerQuery.includes('red'))) || // Has color
    lowerQuery.split(' ').length > 5 // Long detailed query
  );
  
  if (isSpecificQuery) {
    return false;
  }
  
  // Check if it's a general request for recommendations
  const isGeneralRequest = (
    lowerQuery.includes('recommend') ||
    lowerQuery.includes('suggestion') ||
    lowerQuery.includes('help me find') ||
    lowerQuery.includes('looking for') ||
    lowerQuery.includes('need') ||
    lowerQuery.includes('want') ||
    (lowerQuery.includes('show') && lowerQuery.includes('me')) ||
    /^(shoes?|shirt|dress|jacket|pants?|socks?|hat|cap|bag)s?(\s|$)/.test(lowerQuery.trim()) // Just product type
  );
  
  // Disable consultation for now to fix basic search first
  return false;
}

function generateConsultationQuestion(query: string, userSession: any, catalogInsights: any): string {
  const lowerQuery = query.toLowerCase();
  const consultation = userSession.consultationData;
  const asked = userSession.questionsAsked;
  
  // Determine product type first - be more accurate
  let productType = consultation.productType;
  if (!productType) {
    if (lowerQuery.includes('shoe') || lowerQuery.includes('sneaker') || lowerQuery.includes('boot') || lowerQuery.includes('sandal') || lowerQuery.includes('loafer')) {
      productType = 'shoes';
    } else if (lowerQuery.includes('shirt') || lowerQuery.includes('tee') || lowerQuery.includes('top') || lowerQuery.includes('blouse')) {
      productType = 'shirts';
    } else if (lowerQuery.includes('dress')) {
      productType = 'dresses';
    } else if (lowerQuery.includes('jacket') || lowerQuery.includes('coat') || lowerQuery.includes('hoodie') || lowerQuery.includes('sweater')) {
      productType = 'outerwear';
    } else if (lowerQuery.includes('pants') || lowerQuery.includes('jean') || lowerQuery.includes('trouser') || lowerQuery.includes('short')) {
      productType = 'bottoms';
    } else if (lowerQuery.includes('sock')) {
      productType = 'socks';
    } else if (lowerQuery.includes('hat') || lowerQuery.includes('cap') || lowerQuery.includes('beanie')) {
      productType = 'headwear';
    }
    
    // Store the product type
    if (productType) {
      consultation.productType = productType;
    }
  }
  
  // Ask questions in logical order
  const questions = {
    occasion: {
      condition: !consultation.occasion && !asked.includes('occasion'),
      shoes: "Great! I'd love to help you find the perfect shoes. 👟 What will you be wearing them for? Work, casual everyday wear, exercise, or special occasions?",
      shirts: "Perfect! I'm excited to help you find a great shirt. 👔 What's the occasion? Work, casual hangouts, date night, or something else?",
      dresses: "Wonderful! Let me help you find the perfect dress. 👗 What's the occasion? Work, casual day out, evening event, or something special?",
      outerwear: "Excellent! I'll help you find the right jacket. 🧥 What's the main purpose? Work, casual daily wear, outdoor activities, or formal events?",
      bottoms: "Great choice! I'll help you find perfect pants. 👖 What's the occasion? Work, casual wear, going out, or something specific?",
      socks: "Perfect! Let me help you find the right socks. 🧦 What will you be wearing them for? Athletic activities, work, casual wear, or special occasions?",
      headwear: "Awesome! I'll help you find the perfect hat. 🧢 What's the main purpose? Sun protection, warmth, fashion, or sports?",
      default: "I'd love to help you find exactly what you need! 😊 What's the main occasion or purpose? Work, casual wear, special events, or something else?"
    },
    
    style: {
      condition: !consultation.style && !asked.includes('style') && consultation.occasion,
      shoes: "Perfect! Now, what style appeals to you most? Sleek and minimal, trendy and bold, classic and timeless, or sporty and functional? 🎨",
      shirts: "Great! What style vibe are you going for? Casual and relaxed, professional and polished, trendy and fashionable, or classic and timeless? ✨",
      dresses: "Lovely! What style speaks to you? Elegant and sophisticated, fun and flirty, professional and polished, or casual and comfortable? 💫",
      outerwear: "Nice! What style direction interests you? Sleek and modern, rugged and outdoorsy, classic and timeless, or trendy and fashionable? 🌟",
      bottoms: "Excellent! What style preference do you have? Relaxed and comfortable, fitted and sleek, trendy and fashionable, or classic and versatile? ⭐",
      socks: "Great! What style do you prefer? Fun and colorful, classic and neutral, performance and technical, or cozy and warm? 🌈",
      headwear: "Perfect! What style appeals to you? Sporty and casual, classic and timeless, trendy and fashionable, or functional and practical? 🎯",
      default: "Wonderful! What style direction interests you most? Classic and timeless, trendy and modern, casual and relaxed, or bold and unique? 🎨"
    },
    
    budget: {
      condition: !consultation.budget && !asked.includes('budget') && consultation.occasion && consultation.style,
      question: "Awesome! One more thing - what's your budget looking like? Under $50, $50-100, $100-200, or I'm flexible with pricing? 💰 This helps me show you the best options in your range!"
    }
  };
  
  // Check each question type in order
  for (const [questionType, questionData] of Object.entries(questions)) {
    if (questionType === 'budget') {
      const budgetData = questionData as { condition: boolean; question: string };
      if (budgetData.condition) {
        return budgetData.question;
      }
    } else {
      const qData = questionData as any;
      if (qData.condition) {
        const specificQuestion = qData[productType || 'default'] || qData.default;
        return specificQuestion;
      }
    }
  }
  
  // If we have enough info, indicate we're ready to show products
  return '';
}

function hasEnoughConsultationInfo(userSession: any): boolean {
  const consultation = userSession.consultationData;
  
  // We need at least product type and one other piece of info (occasion, style, or budget)
  return !!(consultation.productType && (consultation.occasion || consultation.style || consultation.budget));
}

function buildSearchFromConsultation(query: string, userSession: any): any {
  const consultation = userSession.consultationData;
  
  // Build search parameters from consultation data
  const searchParams: any = {
    query: generateSearchQuery(consultation.productType) || extractProductTypeFromQuery(query)
  };
  
  console.log(`🤝 Building search for product type: ${consultation.productType} → query: ${searchParams.query}`);
  
  // Add category based on style/occasion
  if (consultation.style) {
    const styleMapping: any = {
      'casual': 'casual',
      'professional': 'formal',
      'sporty': 'athletic',
      'trendy': 'fashion',
      'classic': 'classic'
    };
    
    for (const [key, value] of Object.entries(styleMapping)) {
      if (consultation.style.toLowerCase().includes(key)) {
        searchParams.category = value;
        break;
      }
    }
  }
  
  // Add price range from budget
  if (consultation.budget) {
    const budgetMapping: any = {
      'under $50': 'under 50',
      '$50-100': '50-100',
      '$100-200': '100-200',
      'flexible': null
    };
    
    for (const [key, value] of Object.entries(budgetMapping)) {
      if (consultation.budget.toLowerCase().includes(key.toLowerCase())) {
        if (value) searchParams.price_range = value;
        break;
      }
    }
  }
  
  console.log(`🤝 Final search params:`, searchParams);
  return searchParams;
}

function extractProductTypeFromQuery(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('shoe') || lowerQuery.includes('sneaker') || lowerQuery.includes('boot')) {
    return 'shoes';
  } else if (lowerQuery.includes('shirt') || lowerQuery.includes('tee') || lowerQuery.includes('top')) {
    return 'shirt';
  } else if (lowerQuery.includes('dress')) {
    return 'dress';
  } else if (lowerQuery.includes('jacket') || lowerQuery.includes('coat')) {
    return 'jacket';
  } else if (lowerQuery.includes('pants') || lowerQuery.includes('jean')) {
    return 'pants';
  } else if (lowerQuery.includes('sock')) {
    return 'socks';
  } else if (lowerQuery.includes('hat') || lowerQuery.includes('cap')) {
    return 'hat';
  }
  
  return query;
}

  // Dynamic Engagement System - Learns from ANY store
function generateStoreAwareSuggestions(website: string, catalogInsights: any, products: any[]): string[] {
  const hostname = new URL(website).hostname.replace('www.', '');
  const categories = catalogInsights.categories || [];
  const analysis = analyzeStoreFromProducts(products, hostname);
  
  const suggestions = [];
  
  // Generate intelligent suggestions based on what the store actually sells
  analysis.mainProducts.forEach((product: string) => {
    switch(product) {
      case 'footwear':
        suggestions.push("👟 Show me shoes", "🏃‍♂️ What's your most popular footwear?");
        break;
      case 'apparel':
        suggestions.push("👕 Show me apparel", "🧥 Any clothing for women?", "👔 Men's clothing?");
        break;
      case 'accessories':
        suggestions.push("🎒 Show me accessories", "⌚ What accessories do you have?");
        break;
      case 'socks':
        suggestions.push("🧦 Show me socks");
        break;
      default:
        suggestions.push(`🔍 Show me ${product}`);
    }
  });
  
  // Add store-specific suggestions based on features
  if (analysis.keyFeatures.includes('sustainable practices')) {
    suggestions.push("♻️ Show me eco-friendly products");
  }
  if (analysis.priceSegment === 'budget-friendly') {
    suggestions.push("💰 What's under $30?");
  } else if (analysis.priceSegment === 'premium') {
    suggestions.push("✨ Show me premium items");
  }
  
  // Add audience-specific suggestions
  if (analysis.targetAudience.includes('women')) {
    suggestions.push("👩 Women's collection");
  }
  if (analysis.targetAudience.includes('men')) {
    suggestions.push("👨 Men's collection");
  }
  
  // Fallback suggestions if none generated
  if (suggestions.length === 0) {
    categories.forEach((cat: string) => {
      suggestions.push(`🔍 Show me ${cat.toLowerCase()}`);
    });
  }
  
  // Final fallback
  return suggestions.length > 0 ? suggestions.slice(0, 5) : [
    "🔍 What products do you have?",
    "💡 Show me your bestsellers",
    "🛍️ What's popular here?",
    "🎯 Help me find something"
  ];
}

function generateDynamicSuggestions(query: string, results: any[], catalogInsights: any, userSession: any): string[] {
  const suggestions = [];
  const queryLower = query.toLowerCase();
  
  // Context-aware suggestions based on search results
  if (results.length > 0) {
    const avgPrice = results.reduce((sum, p) => sum + (p.price || 0), 0) / results.length;
    
    // Price-based suggestions
    if (avgPrice > 200) {
      suggestions.push("💰 Want to see more affordable options? Try 'show me similar items under $100'");
    } else if (avgPrice < 50) {
      suggestions.push("✨ Looking for premium options? Ask me 'show luxury versions of these'");
    }
    
    // Category expansion suggestions
    const categories = [...new Set(results.map(r => r.category))];
    if (categories.length === 1) {
      const relatedCategories = getRelatedCategories(categories[0]);
      if (relatedCategories.length > 0) {
        suggestions.push(`🔍 You might also like: "${relatedCategories[0]}" - just ask me!`);
      }
    }
  }
  
  // Seasonal suggestions
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) { // Spring
    suggestions.push("🌸 Spring is here! Ask me about 'light jackets' or 'spring dresses'");
  } else if (month >= 5 && month <= 7) { // Summer
    suggestions.push("☀️ Summer vibes! Try searching for 'shorts', 'sandals', or 'summer tops'");
  } else if (month >= 8 && month <= 10) { // Fall
    suggestions.push("🍂 Fall fashion! Look for 'boots', 'sweaters', or 'fall jackets'");
  } else { // Winter
    suggestions.push("❄️ Winter essentials! Search for 'coats', 'boots', or 'warm accessories'");
  }
  
  // Personalized suggestions based on history
  if (userSession.searchHistory.length > 0) {
    const lastSearch = userSession.searchHistory[userSession.searchHistory.length - 1];
    if (lastSearch !== queryLower) {
      suggestions.push(`🔄 Want to go back to "${lastSearch}"? Just let me know!`);
    }
  }
  
  // Budget-aware suggestions
  if (userSession.budget) {
    suggestions.push(`💸 Remember your budget of $${userSession.budget}? I can filter everything within that range!`);
  } else if (!queryLower.includes('budget') && !queryLower.includes('price')) {
    suggestions.push("💡 Want to set a budget? Try 'show me items under $X' to filter by price!");
  }
  
  // Style suggestions
  const styleKeywords = ['casual', 'formal', 'sporty', 'trendy', 'classic', 'vintage'];
  const hasStyleKeyword = styleKeywords.some(style => queryLower.includes(style));
  if (!hasStyleKeyword) {
    suggestions.push("🎨 Looking for a specific style? Try 'casual', 'formal', or 'trendy' in your search!");
  }
  
  // Comparison suggestions
  if (results.length >= 2) {
    suggestions.push("⚖️ Want to compare these items? Ask me 'compare the first two products'");
  }
  
  // Discovery suggestions
  suggestions.push("🎁 Need gift ideas? Try 'gifts for [occasion]' or 'gifts under $X'");
  suggestions.push("📱 Want product details? Click any item or ask me 'tell me more about [product name]'");
  
  // Shuffle and return random suggestions
  return suggestions.sort(() => Math.random() - 0.5).slice(0, 3);
}

function getRelatedCategories(category: string): string[] {
  const relations: { [key: string]: string[] } = {
    'shoes': ['boots', 'sneakers', 'sandals'],
    'boots': ['shoes', 'sneakers'],
    'sneakers': ['shoes', 'boots'],
    'hoodie': ['sweatshirt', 'jacket'],
    'jacket': ['coat', 'hoodie'],
    'pants': ['jeans', 'shorts'],
    'jeans': ['pants', 'shorts'],
    'shirt': ['t-shirt', 'polo'],
    't-shirt': ['shirt', 'tank'],
  };
  
  return relations[category.toLowerCase()] || [];
}

// Enhanced NLP Intent Recognition
// This function is now replaced by AI-powered query analysis
// The analyzeQueryWithAI function provides more sophisticated intent detection

// AI-powered Natural Language Processing for query understanding
async function analyzeQueryWithAI(query: string, catalogInsights: any): Promise<any> {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-or-v1-...') {
    console.log('⚠️ AI API not available, falling back to basic query processing');
    return { searchTerms: [query], intent: 'search', confidence: 0.5 };
  }

  const availableCategories = catalogInsights.categories?.slice(0, 20) || [];
  const availableBrands = catalogInsights.brands?.slice(0, 15) || [];
  
  const prompt = `Analyze this shopping query and extract structured information:

Query: "${query}"

Available product categories: ${availableCategories.join(', ')}
Available brands: ${availableBrands.join(', ')}

Please analyze the query and return a JSON response with:
{
  "intent": "search|compare|recommend|question|browse",
  "searchTerms": ["corrected", "search", "terms"],
  "category": "specific category if mentioned",
  "brand": "specific brand if mentioned", 
  "priceRange": {"min": 0, "max": 100} or null,
  "priceSort": "expensive|cheapest|null",
  "attributes": ["color", "size", "style"],
  "corrections": [{"original": "typo", "corrected": "fixed"}],
  "confidence": 0.95,
  "reasoning": "Brief explanation of understanding"
}

Instructions:
- Correct common typos (shock→socks, shose→shoes, hodie→hoodie, etc.)
- Extract price mentions (under $50, budget $100, between 20-80, etc.)
- Detect price sorting intent: "most expensive", "cheapest", "highest price", "lowest price"
- Identify product categories and brands from the available lists
- Detect colors, sizes, styles, materials mentioned
- Determine user intent (searching, comparing, asking questions, etc.)
- Provide confidence score (0-1) for your analysis
- Keep response concise and accurate

Examples:
"shock under $50" → searchTerms: ["socks"], priceRange: {"max": 50}
"most expensive shoes" → searchTerms: ["shoes"], priceSort: "expensive"
"what is the most expensive shoes do you have?" → searchTerms: ["shoes"], priceSort: "expensive"
"cheapest hoodies" → searchTerms: ["hoodie"], priceSort: "cheapest"
"show me the highest priced sneakers" → searchTerms: ["sneakers"], priceSort: "expensive"
"red hodie for winter" → searchTerms: ["hoodie"], attributes: ["red", "winter"]
"compare nike vs adidas sneakers" → intent: "compare", searchTerms: ["sneakers"], brand: "nike"`;

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
        max_tokens: 400,
        temperature: 0.1 // Low temperature for consistent analysis
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      try {
        if (!content) {
          throw new Error('No content received from AI');
        }
        
        // Clean the content - remove markdown code blocks and other formatting issues
        let cleanContent = content.trim();
        
        // Remove markdown code blocks
        cleanContent = cleanContent.replace(/```json\s*/g, '');
        cleanContent = cleanContent.replace(/```\s*/g, '');
        
        // Remove any leading/trailing non-JSON characters
        const jsonStart = cleanContent.indexOf('{');
        const jsonEnd = cleanContent.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
        }
        
        console.log('🧹 Cleaned content for parsing:', cleanContent);
        
        const analysis = JSON.parse(cleanContent);
        console.log(`🧠 AI Query Analysis:`, analysis);
        
        // Validate the analysis structure
        if (analysis && analysis.searchTerms && Array.isArray(analysis.searchTerms)) {
          return analysis;
        } else {
          console.log('⚠️ Invalid AI analysis structure, using fallback');
        }
      } catch (parseError) {
        console.log('⚠️ Failed to parse AI response, using fallback:', parseError);
        console.log('⚠️ Raw AI content:', content);
      }
    }
  } catch (error) {
    console.log(`⚠️ AI query analysis failed:`, error);
  }
  
  // Fallback to basic processing with improved term extraction and synonyms
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
  const commonWords = ['any', 'for', 'the', 'and', 'you', 'have', 'that', 'with', 'what', 'where', 'how', 'can', 'show', 'me'];
  const meaningfulWords = queryWords.filter(word => !commonWords.includes(word));
  
  // Add synonym mapping for common terms
  const synonymMap: Record<string, string[]> = {
    'hats': ['hat', 'cap', 'caps', 'beanie', 'headwear'],
    'hat': ['hat', 'cap', 'caps', 'beanie', 'headwear'],
    'shoes': ['shoe', 'sneaker', 'sneakers', 'footwear', 'boots', 'runners'],
    'apparel': ['clothing', 'clothes', 'shirt', 'shirts', 'tee', 'tees'],
    'accessories': ['accessory', 'bag', 'bags', 'insole', 'insoles']
  };
  
  // Expand search terms with synonyms
  const expandedTerms: string[] = [];
  meaningfulWords.forEach(word => {
    expandedTerms.push(word);
    if (synonymMap[word]) {
      expandedTerms.push(...synonymMap[word]);
    }
  });
  
  return {
    searchTerms: expandedTerms.length > 0 ? expandedTerms : [query],
    intent: 'search',
    confidence: 0.5,
    reasoning: 'AI analysis unavailable, using basic processing with synonyms'
  };
}

// Simplified query expansion using AI analysis
function expandQueryFromAI(analysis: any): string[] {
  if (!analysis || !analysis.searchTerms) {
    return [];
  }
  
  let expandedTerms = [...analysis.searchTerms];
  
  // Add category-based terms
  if (analysis.category) {
    expandedTerms.push(analysis.category);
  }
  
  // Add attribute-based terms
  if (analysis.attributes && Array.isArray(analysis.attributes)) {
    expandedTerms.push(...analysis.attributes);
  }
  
  // Remove duplicates and empty terms
  expandedTerms = [...new Set(expandedTerms.filter(term => term && term.trim()))];
  
  console.log(`🔍 Expanded search terms from AI:`, expandedTerms);
  return expandedTerms;
}

// Helper to validate Shopify store with timeout
async function isValidShopifyStore(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const res = await fetch(url.replace(/\/$/, '') + '/products.json', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) return false;
    
    const data = await res.json();
    return Array.isArray(data.products);
  } catch {
    return false;
  }
}

// Fetch products from store with timeout and error handling
async function fetchStoreProducts(website: string) {
  const baseUrl = website.replace(/\/$/, "");
  let allProducts = new Map();
  let endpoints = [];
  let collectionsList = [];

  // Always try the main products endpoint
  endpoints.push(baseUrl + "/products.json?currency=USD");

  // Dynamically fetch all collections for this store
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const collectionsRes = await fetch(baseUrl + "/collections.json", {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    clearTimeout(timeout);
    
    const collectionsData = await collectionsRes.json();
    const collections = collectionsData.collections || [];
    collectionsList = collections.map((col: any) => ({ title: col.title, handle: col.handle }));
    
    // Add each collection's products endpoint
    for (const col of collections) {
      endpoints.push(`${baseUrl}/collections/${col.handle}/products.json?currency=USD`);
    }
  } catch (err) {
    console.log(`⚠️ Failed to fetch collections.json:`, err);
  }

  for (let url of endpoints) {
    try {
      console.log(`🔍 Fetching from: ${url}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      clearTimeout(timeout);
      
      const json = await response.json();
      const fetchedProducts = json.products || [];
      
      if (fetchedProducts.length > 0) {
        console.log(`✅ Found ${fetchedProducts.length} products from ${url}`);
        fetchedProducts.forEach((product: any) => {
          if (!allProducts.has(product.id)) {
            allProducts.set(product.id, product);
          }
        });
      }
    } catch (err) {
      console.log(`⚠️ Failed to fetch from ${url}:`, err);
      continue;
    }
  }

  const products = Array.from(allProducts.values());
  console.log(`📦 Total unique products: ${products.length}`);
  return { products, collections: collectionsList };
}

// Build context for AI
function buildContext(products: any[], catalogInsights: any, userSession: any) {
  const context = `Store Catalog Intelligence:
- Total Products: ${catalogInsights.totalProducts}
- Categories: ${catalogInsights.categories.slice(0, 15).join(', ')}${catalogInsights.categories.length > 15 ? ', and more' : ''}
- Brands: ${catalogInsights.brands.slice(0, 10).join(', ')}${catalogInsights.brands.length > 10 ? ', and more' : ''}
- Price Range: $${catalogInsights.priceRanges.min.toFixed(2)} - $${catalogInsights.priceRanges.max.toFixed(2)}

User Profile:
- Search History: ${userSession.searchHistory.slice(-3).join(', ') || 'None'}
- Preferred Budget: ${userSession.budget ? `$${userSession.budget}` : 'Not set'}
- Style Preference: ${userSession.style || 'Not specified'}
- Recently Viewed: ${userSession.viewedProducts.length} items

Available Tools:
- search_products: Find specific products with intelligent filtering
- analyze_user_intent: Understand complex user requests
- generate_recommendations: Create personalized suggestions
- compare_products: Side-by-side product comparison`;

  return context;
}

// Tool implementations
async function searchProducts(products: any[], args: any, storeUrl: string, catalogInsights?: any) {
  const { query, category, price_range, brand } = args;
  
  console.log(`🔍 Searching products with:`, { query, category, price_range, brand });
  console.log(`📦 Total products to search: ${products.length}`);

  // If no query provided, start with all products (for price-only filtering)
  let filtered = products;
  let aiAnalysis: any = null;
  let effectivePriceRange = price_range;
  
  // Apply AI-powered text search if query is provided
  if (query && query.trim()) {
    // Use AI to analyze and understand the query
    aiAnalysis = await analyzeQueryWithAI(query, catalogInsights || {});
    console.log(`🧠 AI Analysis Result:`, aiAnalysis);
    
    // Get search terms from AI analysis
    const searchTerms = expandQueryFromAI(aiAnalysis);
    console.log(`🔍 AI-processed search terms:`, searchTerms);
    
    // Handle AI-detected price sorting
    if (aiAnalysis.priceSort) {
      console.log(`💰 AI detected price sorting: ${aiAnalysis.priceSort}`);
      if (!effectivePriceRange) {
        // If no explicit price range was provided, use AI's price sorting
        effectivePriceRange = aiAnalysis.priceSort === 'expensive' ? 'most expensive' : 'cheapest';
        console.log(`💰 Applied AI price sorting: ${effectivePriceRange}`);
      }
    }
    
    // Apply AI-enhanced filtering
    filtered = products.filter((product: any) => {
      const title = (product.title || '').toLowerCase();
      const productType = (product.product_type || '').toLowerCase();
      const vendor = (product.vendor || '').toLowerCase();
      const tags = Array.isArray(product.tags) ? product.tags.join(' ').toLowerCase() : (product.tags || '').toLowerCase();
      const description = (product.body_html || '').replace(/<[^>]*>/g, '').toLowerCase();
      
      // Combined text for searching
      const searchText = `${title} ${productType} ${tags} ${vendor} ${description}`;
      
      // AI-powered text search with multiple search terms
      const matchesQuery = searchTerms.some((term: string) => {
        const termLower = term.toLowerCase();
        
        // Exact matches in product type (highest priority)
        if (productType.includes(termLower)) return true;
        
        // Exact matches in title (high priority)
        if (title.includes(termLower)) return true;
        
        // Word boundary matches (medium priority)
        const regex = new RegExp(`\\b${termLower}\\b`, 'i');
        if (regex.test(searchText)) return true;
        
        // Partial matches as fallback (lower priority)
        if (searchText.includes(termLower)) return true;
        
        return false;
      });
      
      // Additional filtering based on AI-detected attributes
      let matchesAttributes = true;
      if (aiAnalysis.attributes && aiAnalysis.attributes.length > 0) {
        matchesAttributes = aiAnalysis.attributes.some((attr: string) => {
          const attrLower = attr.toLowerCase();
          return searchText.includes(attrLower);
        });
      }
      
      return matchesQuery || matchesAttributes;
    });
    
    // If no results with AI analysis, fall back to more flexible basic search
    if (filtered.length === 0) {
      console.log(`🔍 No AI matches found for "${query}", trying enhanced basic search...`);
      const queryWords = query.toLowerCase().split(/\s+/);
      
      // Also include search terms from AI analysis (which includes synonyms)
      const allSearchTerms = [...queryWords, ...searchTerms];
      console.log(`🔍 All search terms (including synonyms): ${allSearchTerms.join(', ')}`);
      
      filtered = products.filter((product: any) => {
        const title = (product.title || '').toLowerCase();
        const productType = (product.product_type || '').toLowerCase();
        const vendor = (product.vendor || '').toLowerCase();
        const tags = Array.isArray(product.tags) ? product.tags.join(' ').toLowerCase() : (product.tags || '').toLowerCase();
        const description = (product.body_html || '').replace(/<[^>]*>/g, '').toLowerCase();
        
        const searchText = `${title} ${productType} ${tags} ${vendor} ${description}`;
        
        // Match if any search term (including synonyms) matches any part of the product
        const matches = allSearchTerms.some((word: string) => {
          if (word.length < 2) return false; // Skip very short words
          
          // Check for partial matches in different fields
          const hasMatch = title.includes(word) || 
                          productType.includes(word) || 
                          tags.includes(word) ||
                          vendor.includes(word) ||
                          description.includes(word);
          
          if (hasMatch) {
            console.log(`✅ Found match for "${word}" in product: ${title}`);
          }
          
          return hasMatch;
        });
        
        return matches;
      });
      
      console.log(`🔍 Enhanced basic search found ${filtered.length} products for terms: ${allSearchTerms.join(', ')}`);
    }
  }
  
  // Apply additional filters
  if (category || brand) {
    filtered = filtered.filter((product: any) => {
      const title = (product.title || '').toLowerCase();
      const productType = (product.product_type || '').toLowerCase();
      const vendor = (product.vendor || '').toLowerCase();
      const tags = Array.isArray(product.tags) ? product.tags.join(' ').toLowerCase() : (product.tags || '').toLowerCase();
      
      // Category filter - be more flexible
      const matchesCategory = category ? 
        title.includes(category.toLowerCase()) || 
        productType.includes(category.toLowerCase()) || 
        tags.includes(category.toLowerCase()) ||
        vendor.includes(category.toLowerCase()) : true;
      
      // Brand filter
      const matchesBrand = brand ? 
        vendor.includes(brand.toLowerCase()) || 
        title.includes(brand.toLowerCase()) : true;
      
      return matchesCategory && matchesBrand;
    });
  }

  // Price range filter - improved logic
  if (effectivePriceRange && effectivePriceRange !== "null") {
    console.log(`💰 Filtering by price range: ${effectivePriceRange}`);
    console.log(`💰 Products before price filter: ${filtered.length}`);
    if (filtered.length > 0) {
      console.log(`💰 Sample prices before filter:`, filtered.slice(0, 5).map(p => `${p.title}: $${p.variants?.[0]?.price}`));
    }
    const priceText = effectivePriceRange.toLowerCase();
    
    if (priceText.includes('under') || priceText.includes('below') || priceText.includes('less than')) {
      const maxPrice = parseFloat(priceText.replace(/[^0-9.-]/g, ''));
      // Only apply price filter if we extracted a valid number
      if (!isNaN(maxPrice) && maxPrice > 0) {
        const beforeCount = filtered.length;
        filtered = filtered.filter((p: any) => {
          const price = parseFloat(p.variants?.[0]?.price || 0);
          return price > 0 && price <= maxPrice;
        });
        console.log(`💰 Price filter (under $${maxPrice}): ${beforeCount} → ${filtered.length} products`);
      } else {
        console.log(`💰 Invalid price detected in "${priceText}", skipping price filter`);
      }
    } else if (priceText.includes('over') || priceText.includes('above') || priceText.includes('more than')) {
      const minPrice = parseFloat(priceText.replace(/[^0-9.-]/g, ''));
      if (!isNaN(minPrice) && minPrice > 0) {
        const beforeCount = filtered.length;
        filtered = filtered.filter((p: any) => {
          const price = parseFloat(p.variants?.[0]?.price || 0);
          return price > 0 && price > minPrice;
        });
        console.log(`💰 Price filter (over $${minPrice}): ${beforeCount} → ${filtered.length} products`);
      } else {
        console.log(`💰 Invalid price detected in "${priceText}", skipping price filter`);
      }
    } else if (priceText.includes('-')) {
      // Handle range like "20-50"
      const parts = priceText.split('-');
      if (parts.length === 2) {
        const minPrice = parseFloat(parts[0]);
        const maxPrice = parseFloat(parts[1]);
        const beforeCount = filtered.length;
        filtered = filtered.filter((p: any) => {
          const price = parseFloat(p.variants?.[0]?.price || 0);
          return price > 0 && price >= minPrice && price <= maxPrice;
        });
        console.log(`💰 Price filter ($${minPrice}-$${maxPrice}): ${beforeCount} → ${filtered.length} products`);
      }
    } else if (priceText.includes('cheapest') || priceText.includes('lowest')) {
      // Sort by price ascending
      filtered.sort((a: any, b: any) => {
        const priceA = parseFloat(a.variants?.[0]?.price || 0);
        const priceB = parseFloat(b.variants?.[0]?.price || 0);
        return priceA - priceB;
      });
      console.log(`💰 Sorted by price (cheapest first): ${filtered.length} products`);
    } else if (priceText.includes('expensive') || priceText.includes('highest') || priceText.includes('most expensive')) {
      // Sort by price descending
      filtered.sort((a: any, b: any) => {
        const priceA = parseFloat(a.variants?.[0]?.price || 0);
        const priceB = parseFloat(b.variants?.[0]?.price || 0);
        return priceB - priceA;
      });
      console.log(`💰 Sorted by price (most expensive first): ${filtered.length} products`);
      
      // For "most expensive" queries, also log the top prices for debugging
      if (priceText.includes('most expensive') && filtered.length > 0) {
        console.log(`💰 Top 5 most expensive:`, filtered.slice(0, 5).map(p => `${p.title}: $${p.variants?.[0]?.price}`));
      }
    }
  }

  // Check if we found relevant products - but be less strict
  if (query && query.trim() && filtered.length === 0) {
    console.log(`❌ No products found matching "${query}" - this store may not carry this type of item`);
    
    // Get available product types for suggestions
    const availableTypes = [...new Set(products.map((p: any) => p.product_type).filter(Boolean))];
    console.log(`📋 Available product types:`, availableTypes.slice(0, 10));
    
    return {
      products: [],
      message: `I couldn't find any "${query}" in this store. This store specializes in ${availableTypes.slice(0, 3).join(', ')}${availableTypes.length > 3 ? ' and more' : ''}. Would you like to see any of these instead?`,
      suggestions: availableTypes.slice(0, 5).map(type => `Show me ${type.toLowerCase()}`),
      availableTypes: availableTypes
    };
  }

  console.log(`✅ Search completed: Found ${filtered.length} products, returning ${Math.min(filtered.length, 50)}`);

  return {
    found: filtered.length,
    products: filtered.slice(0, 50).map((p: any) => formatProduct(p, storeUrl)), // Increased from 20 to 50
    total: filtered.length,
    searchTerms: { query, category, price_range: effectivePriceRange, brand }
  };
}

async function webSearch(query: string) {
  try {
    // Using a free search API (you can replace with your preferred service)
    const searchQuery = encodeURIComponent(query);
    const response = await fetch(`https://api.duckduckgo.com/?q=${searchQuery}&format=json&no_html=1&skip_disambig=1`);
    const data = await response.json();
    
    return {
      query: query,
      results: data.AbstractText ? [{
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL
      }] : [],
      source: "DuckDuckGo"
    };
  } catch (error) {
    return {
      query: query,
      error: "Search failed",
      results: []
    };
  }
}

async function analyzePrices(productsJson: string, budget: string) {
  try {
    const products = JSON.parse(productsJson);
    
    if (!products || products.length === 0) {
      return { error: "No products to analyze" };
    }

    const prices = products.map((p: any) => parseFloat(p.price || 0)).filter((p: number) => p > 0);
    const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    let recommendation = "";
    if (budget) {
      const budgetNum = parseFloat(budget.replace(/[^0-9.-]/g, ''));
      const affordable = products.filter((p: any) => parseFloat(p.price || 0) <= budgetNum);
      recommendation = `Found ${affordable.length} products within your budget of $${budgetNum}.`;
    }

    return {
      analysis: {
        total_products: products.length,
        average_price: `$${avgPrice.toFixed(2)}`,
        price_range: `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`,
        budget_recommendation: recommendation
      },
      products: products.slice(0, 5).map(formatProduct)
    };
  } catch (error) {
    return { error: "Price analysis failed" };
  }
}

async function getRecommendations(products: any[], args: any) {
  const { user_preferences, budget, occasion } = args;
  
  // Simple recommendation logic (can be enhanced)
  let filtered = products;
  
  if (budget) {
    const budgetNum = parseFloat(budget.replace(/[^0-9.-]/g, ''));
    filtered = filtered.filter((p: any) => parseFloat(p.variants?.[0]?.price || 0) <= budgetNum);
  }

  // Filter by preferences
  if (user_preferences) {
    const prefs = user_preferences.toLowerCase();
    filtered = filtered.filter((p: any) => {
      const title = (p.title || '').toLowerCase();
      const productType = (p.product_type || '').toLowerCase();
      return title.includes(prefs) || productType.includes(prefs);
    });
  }

  return {
    recommendations: filtered.slice(0, 8).map((p: any) => formatProduct(p, '')),
    reasoning: `Based on your preferences: ${user_preferences}${budget ? `, budget: ${budget}` : ''}${occasion ? `, occasion: ${occasion}` : ''}`,
    total_found: filtered.length
  };
}

async function compareProducts(products: any[], productIds: string) {
  const ids = productIds.split(',').map(id => id.trim());
  const selectedProducts = products.filter((p: any) => ids.includes(p.id.toString()));
  
  if (selectedProducts.length === 0) {
    return { error: "No products found for comparison" };
  }

  return {
    comparison: selectedProducts.map((p: any) => formatProduct(p, '')),
    summary: `Comparing ${selectedProducts.length} products`,
    features: selectedProducts.map((p: any) => ({
      id: p.id,
      title: p.title,
      price: p.variants?.[0]?.price || 'N/A',
      type: p.product_type || 'N/A'
    }))
  };
}

async function checkInventory(productId: string) {
  // Mock inventory check (in real implementation, you'd check actual inventory)
  return {
    product_id: productId,
    in_stock: Math.random() > 0.3, // 70% chance of being in stock
    quantity: Math.floor(Math.random() * 50) + 1,
    estimated_delivery: "3-5 business days"
  };
}

async function getShippingInfo(location: string, items: string) {
  // Mock shipping info
  return {
    location: location,
    shipping_methods: [
      { name: "Standard", cost: "$5.99", delivery: "5-7 days" },
      { name: "Express", cost: "$12.99", delivery: "2-3 days" },
      { name: "Overnight", cost: "$24.99", delivery: "1 day" }
    ],
    free_shipping_threshold: "$50.00"
  };
}

// Helper functions
function formatProduct(product: any, storeUrl: string = '') {
  const price = product.variants?.[0]?.price || "0";
  let formattedPrice = 0;
  if (price !== "0") {
    const numPrice = parseFloat(price);
    formattedPrice = numPrice > 10000 ? numPrice / 100 : numPrice;
  }
  
  // Format compare at price (original price before discount)
  const comparePrice = product.variants?.[0]?.compare_at_price || "0";
  let formattedComparePrice = undefined;
  if (comparePrice !== "0" && comparePrice) {
    const numComparePrice = parseFloat(comparePrice);
    formattedComparePrice = numComparePrice > 10000 ? numComparePrice / 100 : numComparePrice;
  }
  
  // Ensure storeUrl is a full URL with protocol
  let base = storeUrl;
  if (base && !base.startsWith('http://') && !base.startsWith('https://')) {
    base = `https://${base}`;
  }
  // Remove trailing slash
  base = base.replace(/\/$/, "");
  
  return {
    id: product.id?.toString() || '',
    name: product.title || '',
    description: product.body_html ? product.body_html.replace(/<[^>]*>/g, '').substring(0, 150) + '...' : '',
    price: formattedPrice,
    compareAtPrice: formattedComparePrice,
    currency: 'USD',
    image: product.images?.[0]?.src || '/placeholder-product.jpg',
    category: product.product_type || 'General',
    url: product.handle ? `${base}/products/${product.handle}` : base,
    rating: undefined,
    reviewCount: undefined,
    inStock: product.variants?.[0]?.available || false
  };
}

function formatProductsForDisplay(products: any[], storeUrl: string = '') {
  return products.map((p: any) => formatProduct(p, storeUrl));
}

// Clean up AI response for chat display
function cleanAIResponse(response: string): string {
  if (!response) return '';

  return response
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove markdown links but keep the text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // Remove markdown images
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Add newline after bullets and numbered lists
    .replace(/(• .+?)(?=• |$)/g, '$1\n')
    .replace(/(\d+\.\s.+?)(?=\d+\.|$)/g, '$1\n')
    // Add newline after colon if followed by a bullet, number, or uppercase word (category)
    .replace(/([A-Za-z ]+:)(?=\s*\d+\.|\s*•|\s*[A-Z])/g, '$1\n')
    // Add newline before common follow-up prompts
    .replace(/(Would you like me to:)/g, '\n$1')
    // Remove extra whitespace and newlines
    .replace(/\n\s*\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function addFriendlyFollowUp(message: string) {
  const followUp = "Is there anything else I can help you with? 😊";
  if (!message.includes(followUp)) {
    return message + "\n\n" + followUp;
  }
  return message;
}

// Add this helper near the top of your file
function isGreeting(query: string) {
  const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
  return greetings.some(greet => query.trim().toLowerCase().startsWith(greet));
}

// Add this helper function near the top of the file:
function addEngagingFollowUp(message: string, customSuggestions: string[] = []) {
  if (customSuggestions.length > 0) {
    return message + "\n\n" + customSuggestions.join("\n\n");
  }
  
  const engagingSuggestions = [
    "💡 Want to filter by price or see more options? Just ask!",
    "🎯 Need help finding the perfect size or style? I'm here to help!",
    "✨ Looking for something specific? Try asking me to search for different keywords!",
    "🛒 Want to compare products or check reviews? Just let me know!",
    "🎁 Shopping for a gift? I can help you find the perfect present!",
    "🔥 Found something you like? I can show you similar items or help you decide!",
    "💬 Have questions about shipping, returns, or sizing? Ask away!",
    "🎨 Want to explore different categories or brands? I can guide you through the store!"
  ];
  
  const randomSuggestion = engagingSuggestions[Math.floor(Math.random() * engagingSuggestions.length)];
  
  if (!message.includes(randomSuggestion)) {
    return message + "\n\n" + randomSuggestion;
  }
  return message;
}

// Add this helper near the top of your file
function extractPriceRangeFromQuery(query: string): string | null {
  if (!query) return null;
  const lower = query.toLowerCase();
  
  // Match patterns like 'budget under $50', 'budget is under 100', 'have budget under $75'
  let m = lower.match(/(?:budget|have budget|my budget).*?(?:under|below|less than)\s*\$?(\d+[\.,]?\d*)/);
  if (m) return `under ${m[1]}`;
  
  // Match patterns like 'budget over $100', 'budget above 200'
  m = lower.match(/(?:budget|have budget|my budget).*?(?:over|above|more than)\s*\$?(\d+[\.,]?\d*)/);
  if (m) return `over ${m[1]}`;
  
  // Match patterns like 'budget between $50 and $100', 'budget from 20 to 80'
  m = lower.match(/(?:budget|have budget|my budget).*?(?:between|from)\s*\$?(\d+[\.,]?\d*)\s*(?:and|to)\s*\$?(\d+[\.,]?\d*)/);
  if (m) return `${m[1]}-${m[2]}`;
  
  // Match patterns like 'under $50', 'below 100', 'less than $75'
  m = lower.match(/(?:under|below|less than)\s*\$?(\d+[\.,]?\d*)/);
  if (m) return `under ${m[1]}`;
  
  // Match patterns like 'over $100', 'above 200', 'more than $150'
  m = lower.match(/(?:over|above|more than)\s*\$?(\d+[\.,]?\d*)/);
  if (m) return `over ${m[1]}`;
  
  // Match patterns like 'between $50 and $100', 'from 20 to 80'
  m = lower.match(/(?:between|from)\s*\$?(\d+[\.,]?\d*)\s*(?:and|to)\s*\$?(\d+[\.,]?\d*)/);
  if (m) return `${m[1]}-${m[2]}`;
  
  // Match patterns like '$20-$80', '20-80'
  m = lower.match(/\$?(\d+[\.,]?\d*)\s*[-–]\s*\$?(\d+[\.,]?\d*)/);
  if (m) return `${m[1]}-${m[2]}`;
  
  // Match simple budget patterns like 'budget $50', 'budget is 100'
  m = lower.match(/budget(?: is|:)?\s*\$?(\d+[\.,]?\d*)/);
  if (m) return `under ${m[1]}`;
  
  return null;
}

// Improved response parsing function
function parseConsultationResponse(query: string, currentQuestionType: string): string {
  const lowerQuery = query.toLowerCase().trim();
  
  // Check if user is changing their mind or asking for a different product
  const isChangingMind = (
    lowerQuery.includes('change my mind') ||
    lowerQuery.includes('actually') ||
    lowerQuery.includes('instead') ||
    lowerQuery.includes('rather') ||
    lowerQuery.includes('i would love to find') ||
    lowerQuery.includes('i want to find') ||
    lowerQuery.includes('looking for') ||
    lowerQuery.includes('i need')
  );
  
  // Check if user mentions a different product type
  const mentionsNewProduct = (
    lowerQuery.includes('shorts') ||
    lowerQuery.includes('pants') ||
    lowerQuery.includes('shirt') ||
    lowerQuery.includes('dress') ||
    lowerQuery.includes('jacket') ||
    lowerQuery.includes('hat') ||
    lowerQuery.includes('socks') ||
    lowerQuery.includes('shoes') ||
    lowerQuery.includes('sneakers') ||
    lowerQuery.includes('boots')
  );
  
  // If user is changing their mind about product type, return special flag
  if (isChangingMind && mentionsNewProduct) {
    return 'PRODUCT_CHANGE_REQUEST';
  }
  
  // Clean up the response and extract meaningful parts
  let cleanResponse = query.trim();
  
  // Handle different question types
  if (currentQuestionType === 'occasion') {
    // Extract occasion-related keywords
    if (lowerQuery.includes('work') || lowerQuery.includes('office') || lowerQuery.includes('professional')) {
      cleanResponse = 'work';
    } else if (lowerQuery.includes('casual') || lowerQuery.includes('everyday') || lowerQuery.includes('daily')) {
      cleanResponse = 'casual everyday wear';
    } else if (lowerQuery.includes('exercise') || lowerQuery.includes('gym') || lowerQuery.includes('sport') || lowerQuery.includes('running')) {
      cleanResponse = 'exercise';
    } else if (lowerQuery.includes('special') || lowerQuery.includes('formal') || lowerQuery.includes('event')) {
      cleanResponse = 'special occasions';
    }
  } else if (currentQuestionType === 'style') {
    // Extract style-related keywords
    if (lowerQuery.includes('classic') || lowerQuery.includes('timeless') || lowerQuery.includes('traditional')) {
      cleanResponse = 'classic and timeless';
    } else if (lowerQuery.includes('trendy') || lowerQuery.includes('bold') || lowerQuery.includes('fashionable') || lowerQuery.includes('modern')) {
      cleanResponse = 'trendy and bold';
    } else if (lowerQuery.includes('minimal') || lowerQuery.includes('sleek') || lowerQuery.includes('simple')) {
      cleanResponse = 'sleek and minimal';
    } else if (lowerQuery.includes('sporty') || lowerQuery.includes('functional') || lowerQuery.includes('athletic')) {
      cleanResponse = 'sporty and functional';
    } else if (lowerQuery.includes('casual') || lowerQuery.includes('relaxed') || lowerQuery.includes('comfortable')) {
      cleanResponse = 'casual and relaxed';
    }
  } else if (currentQuestionType === 'budget') {
    // Extract budget-related information
    if (lowerQuery.includes('under') && lowerQuery.includes('50')) {
      cleanResponse = 'under $50';
    } else if (lowerQuery.includes('50') && lowerQuery.includes('100')) {
      cleanResponse = '$50-100';
    } else if (lowerQuery.includes('100') && lowerQuery.includes('200')) {
      cleanResponse = '$100-200';
    } else if (lowerQuery.includes('flexible') || lowerQuery.includes('open') || lowerQuery.includes('any')) {
      cleanResponse = 'flexible with pricing';
    }
  }
  
  return cleanResponse;
}

// Detect and extract new product type from user's request
function extractNewProductType(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('shorts') || lowerQuery.includes('short')) {
    return 'shorts';
  } else if (lowerQuery.includes('pants') || lowerQuery.includes('jean') || lowerQuery.includes('trouser')) {
    return 'bottoms';
  } else if (lowerQuery.includes('shirt') || lowerQuery.includes('tee') || lowerQuery.includes('top') || lowerQuery.includes('blouse')) {
    return 'shirts';
  } else if (lowerQuery.includes('dress')) {
    return 'dresses';
  } else if (lowerQuery.includes('jacket') || lowerQuery.includes('coat') || lowerQuery.includes('hoodie') || lowerQuery.includes('sweater')) {
    return 'outerwear';
  } else if (lowerQuery.includes('shoe') || lowerQuery.includes('sneaker') || lowerQuery.includes('boot') || lowerQuery.includes('sandal') || lowerQuery.includes('loafer')) {
    return 'shoes';
  } else if (lowerQuery.includes('sock')) {
    return 'socks';
  } else if (lowerQuery.includes('hat') || lowerQuery.includes('cap') || lowerQuery.includes('beanie')) {
    return 'headwear';
  }
  
  return null;
}

// Reset consultation when user changes product type
function resetConsultationForNewProduct(userSession: any, newProductType: string): void {
  userSession.consultationData = {
    productType: newProductType,
    style: undefined,
    occasion: undefined,
    budget: undefined,
    color: undefined,
    size: undefined,
    brand: undefined
  };
  userSession.questionsAsked = [];
  userSession.conversationState = 'consulting';
}

// Generate contextual search query based on product type
function generateSearchQuery(productType: string): string {
  const searchMapping: { [key: string]: string } = {
    'shorts': 'shorts',
    'bottoms': 'pants',
    'shirts': 'shirt',
    'dresses': 'dress',
    'outerwear': 'jacket',
    'shoes': 'shoes',
    'socks': 'socks',
    'headwear': 'hat'
  };
  
  return searchMapping[productType] || productType;
}

// Determine what question type we should ask next
function getNextQuestionType(userSession: any): string {
  const consultation = userSession.consultationData;
  const asked = userSession.questionsAsked;
  
  if (!consultation.occasion && !asked.includes('occasion')) {
    return 'occasion';
  } else if (!consultation.style && !asked.includes('style')) {
    return 'style';
  } else if (!consultation.budget && !asked.includes('budget')) {
    return 'budget';
  }
  
  return '';
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json()
    const { query, websiteUrl } = body

    // Extract price range from query
    const effectivePriceRange = extractPriceRangeFromQuery(query);
    console.log(`🔍 Query: "${query}"`);
    console.log(`💰 Extracted price range: "${effectivePriceRange}"`);
    
    // Add detailed debugging
    console.log(`🔍 Raw query for price extraction: "${query}"`);
    console.log(`🔍 Query toLowerCase: "${query.toLowerCase()}"`);
    console.log(`🔍 Testing price patterns:`);
    console.log(`  - under pattern: ${/(?:under|below|less than)\s*\$?(\d+[\.,]?\d*)/.test(query.toLowerCase())}`);
    console.log(`  - budget pattern: ${/budget(?: is|:)?\s*\$?(\d+[\.,]?\d*)/.test(query.toLowerCase())}`);
    console.log(`  - range pattern: ${/(?:between|from)\s*\$?(\d+[\.,]?\d*)\s*(?:and|to)\s*\$?(\d+[\.,]?\d*)/.test(query.toLowerCase())}`);
    console.log(`  - dash pattern: ${/\$?(\d+[\.,]?\d*)\s*[-–]\s*\$?(\d+[\.,]?\d*)/.test(query.toLowerCase())}`);
    
    // Test each pattern manually
    const testQuery = query.toLowerCase();
    let testMatch = testQuery.match(/(?:under|below|less than)\s*\$?(\d+[\.,]?\d*)/);
    if (testMatch) console.log(`🔍 Under match found: ${testMatch[1]}`);
    testMatch = testQuery.match(/budget(?: is|:)?\s*\$?(\d+[\.,]?\d*)/);
    if (testMatch) console.log(`🔍 Budget match found: ${testMatch[1]}`);
    testMatch = testQuery.match(/(?:between|from)\s*\$?(\d+[\.,]?\d*)\s*(?:and|to)\s*\$?(\d+[\.,]?\d*)/);
    if (testMatch) console.log(`🔍 Range match found: ${testMatch[1]} to ${testMatch[2]}`);
    testMatch = testQuery.match(/\$?(\d+[\.,]?\d*)\s*[-–]\s*\$?(\d+[\.,]?\d*)/);
    if (testMatch) console.log(`🔍 Dash match found: ${testMatch[1]} to ${testMatch[2]}`);

    // Define executeFunction here so it can access effectivePriceRange
    const executeFunction = async (name: string, args: any, products: any[], website: string) => {
      console.log(`🔧 executeFunction called with: ${name}`, args);
      if (name === 'search_products') {
        console.log(`🔧 Original args:`, args);
        console.log(`🔧 Adding effectivePriceRange: "${effectivePriceRange}"`);
        // Use AI's price_range if provided, otherwise use our extracted one (but don't override with null)
        const finalArgs = { 
          ...args
        };
        // Only add price_range if we have a valid one
        if (args.price_range) {
          finalArgs.price_range = args.price_range;
        } else if (effectivePriceRange && effectivePriceRange !== "null") {
          finalArgs.price_range = effectivePriceRange;
        }
        console.log(`🔧 Final args:`, finalArgs);
        return await searchProducts(products, finalArgs, website, catalogInsights);
      }
      switch (name) {
        case 'web_search':
          return await webSearch(args.query);
        case 'analyze_prices':
          return await analyzePrices(args.products, args.budget);
        case 'get_product_recommendations':
          return await getRecommendations(products, args);
        case 'compare_products':
          return await compareProducts(products, args.product_ids);
        case 'check_inventory':
          return await checkInventory(args.product_id);
        case 'get_shipping_info':
          return await getShippingInfo(args.location, args.items);
        default:
          return { error: `Unknown function: ${name}` };
      }
    };

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }
    if (!websiteUrl) {
      return NextResponse.json(
        { error: 'Website URL is required' },
        { status: 400 }
      )
    }

    // Greeting intent detection - only when no website URL is provided
    if (isGreeting(query) && !websiteUrl.trim()) {
      return NextResponse.json({
        message: "Hi there! 👋 I'd love to help you find products! First, please enter a Shopify store URL above, then I can search for products, check store info, or help with anything else you need. 😊",
        products: [],
        categories: [],
        suggestions: []
      });
    }

    // Check if API key is configured
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-or-v1-...') {
      console.error("❌ OPENROUTER_API_KEY environment variable is not set");
      return NextResponse.json({ 
        error: "AI service is not properly configured. Please check the server configuration.",
        details: "Missing OpenRouter API key"
      }, { status: 500 });
    }

    // Store validation step
    const isValid = await isValidShopifyStore(websiteUrl);
    if (!isValid) {
      return NextResponse.json({
        error: "This doesn't appear to be a valid Shopify store. Please check the URL or try another store."
      }, { status: 400 });
    }

    // Extract website name from URL for display, but keep full URL for links
    const websiteHostname = new URL(websiteUrl).hostname.replace('www.', '')
    const website = websiteUrl.replace(/\/$/, '') // Full URL for product links

    // Define tools for the AI assistant
    const tools = [
      {
        type: "function",
        function: {
          name: "search_products",
          description: "Search for products in the store with advanced filtering",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query for products"
              },
              category: {
                type: "string", 
                description: "Product category (men, women, kids, footwear, etc.)"
              },
              price_range: {
                type: "string",
                description: "Price range filter (e.g., 'under 100', '50-200')"
              },
              brand: {
                type: "string",
                description: "Brand filter"
              }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for product reviews, comparisons, and market information",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query for web research"
              }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "analyze_prices",
          description: "Analyze product prices and provide recommendations",
          parameters: {
            type: "object",
            properties: {
              products: {
                type: "string",
                description: "JSON string of products to analyze"
              },
              budget: {
                type: "string",
                description: "User's budget constraint"
              }
            },
            required: ["products"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_product_recommendations",
          description: "Get personalized product recommendations based on user preferences",
          parameters: {
            type: "object",
            properties: {
              user_preferences: {
                type: "string",
                description: "User's style preferences and requirements"
              },
              budget: {
                type: "string",
                description: "User's budget"
              },
              occasion: {
                type: "string",
                description: "Occasion or use case"
              }
            },
            required: ["user_preferences"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "compare_products",
          description: "Compare multiple products side by side",
          parameters: {
            type: "object",
            properties: {
              product_ids: {
                type: "string",
                description: "Comma-separated list of product IDs to compare"
              }
            },
            required: ["product_ids"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "check_inventory",
          description: "Check product availability and inventory status",
          parameters: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description: "Product ID to check inventory for"
              }
            },
            required: ["product_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_shipping_info",
          description: "Get shipping information and delivery estimates",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "Shipping location"
              },
              items: {
                type: "string",
                description: "Items to ship"
              }
            },
            required: ["location"]
          }
        }
      }
    ];

    // Fetch products from the store
    const { products, collections } = await fetchStoreProducts(websiteUrl);
    
    if (!products || products.length === 0) {
      return NextResponse.json({
        message: "I couldn't find any products from this store. Please check the website URL or try a different store.",
        products: [],
        categories: [],
        suggestions: []
      }, { status: 200 });
    }

    // AI Catalog Analysis with batch processing
    console.log(`🧠 Starting intelligent catalog analysis...`);
    const catalogInsights = await analyzeCatalogWithAI(products, websiteUrl);
    
    // Enhanced User Session Management
    const sessionId = request.headers.get('user-session') || 'default';
    const userSession = getUserSession(sessionId);
    
    // 🤝 HUMAN-LIKE CONSULTATION SYSTEM
    // Check if we should start a consultation instead of immediately showing products
    if (shouldStartConsultation(query, userSession)) {
      console.log(`🤝 Starting consultation for query: "${query}"`);
      
      const consultationQuestion = generateConsultationQuestion(query, userSession, catalogInsights);
      
      if (consultationQuestion) {
        // Update session state
        updateUserSession(sessionId, {
          conversationState: 'consulting',
          searchHistory: [...userSession.searchHistory.slice(-4), query.toLowerCase()],
          lastQuery: query
        });
        
        return NextResponse.json({
          message: consultationQuestion,
          products: [],
          categories: [],
          suggestions: [],
          isConsultation: true
        });
      }
    }
    
    // Disable consultation system completely - reset if user was in consultation
    if (userSession.conversationState === 'consulting') {
      console.log(`🚫 Resetting consultation state - consultation is disabled`);
      updateUserSession(sessionId, { 
        conversationState: 'initial',
        consultationData: {
          productType: undefined,
          style: undefined,
          occasion: undefined,
          budget: undefined,
          color: undefined,
          size: undefined,
          brand: undefined
        }
      });
    }
    
    // Consultation system completely disabled
    if (false) {
      console.log(`🤝 Processing consultation response: "${query}"`);
      
      const consultation = userSession.consultationData;
      const nextQuestionType = getNextQuestionType(userSession);
      
      // Parse the user's response more intelligently
      if (nextQuestionType) {
        const parsedResponse = parseConsultationResponse(query, nextQuestionType);
        console.log(`🤝 Parsed response for ${nextQuestionType}: "${parsedResponse}"`);
        
        // Check if user wants to change product type
        if (parsedResponse === 'PRODUCT_CHANGE_REQUEST') {
          const newProductType = extractNewProductType(query);
          if (newProductType) {
            console.log(`🤝 User changing product type to: ${newProductType}`);
            resetConsultationForNewProduct(userSession, newProductType as string);
            
            // Start fresh consultation for new product
            const newQuestion = generateConsultationQuestion(query, userSession, catalogInsights);
            updateUserSession(sessionId, { conversationState: 'consulting' });
            
            return NextResponse.json({
              message: newQuestion,
              products: [],
              categories: [],
              suggestions: [],
              isConsultation: true
            });
          }
        }
        
        // Store the parsed response
        if (nextQuestionType === 'occasion') {
          consultation.occasion = parsedResponse;
          userSession.questionsAsked.push('occasion');
        } else if (nextQuestionType === 'style') {
          consultation.style = parsedResponse;
          userSession.questionsAsked.push('style');
        } else if (nextQuestionType === 'budget') {
          consultation.budget = parsedResponse;
          userSession.questionsAsked.push('budget');
        }
        
        // Generate next question
        const nextQuestion = generateConsultationQuestion('', userSession, catalogInsights);
        if (nextQuestion) {
          updateUserSession(sessionId, { conversationState: 'consulting' });
          return NextResponse.json({
            message: nextQuestion,
            products: [],
            categories: [],
            suggestions: [],
            isConsultation: true
          });
        }
      }
      
      // Check if we have enough information to show products
      if (hasEnoughConsultationInfo(userSession)) {
        console.log(`🤝 Consultation complete, showing products based on:`, consultation);
        
        // Build search parameters from consultation
        const searchParams = buildSearchFromConsultation(userSession.lastQuery || query, userSession);
        
        // Update session state
        updateUserSession(sessionId, {
          conversationState: 'ready_to_show',
          searchHistory: [...userSession.searchHistory.slice(-4), query.toLowerCase()],
          lastQuery: userSession.lastQuery || query,
          budget: consultation.budget || userSession.budget
        });
        
        // Execute the search with consultation data
        const consultationResults = await searchProducts(products, searchParams, website, catalogInsights);
        const displayProducts = consultationResults.products || formatProductsForDisplay(products.slice(0, 10), website);
        
        // Generate personalized message based on consultation
        const productDisplayName = consultation.productType === 'bottoms' ? 'pants' : 
                                  consultation.productType === 'outerwear' ? 'jackets' :
                                  consultation.productType === 'headwear' ? 'hats' :
                                  consultation.productType;
        
        const personalizedMessage = `Perfect! Based on what you've told me, I found ${displayProducts.length} great ${productDisplayName} options${consultation.occasion ? ` for ${consultation.occasion}` : ''}${consultation.style ? ` with a ${consultation.style} style` : ''}${consultation.budget && consultation.budget !== 'flexible with pricing' ? ` within your ${consultation.budget} budget` : ''}. Here are my top recommendations! ✨`;
        
        // Extract categories
        const categories = Array.from(new Set(displayProducts.map((p: any) => p.category).filter(Boolean)));
        
        return NextResponse.json({
          message: personalizedMessage,
          products: displayProducts,
          categories: categories,
          suggestions: [
            "💡 Want to see different styles?",
            "🔍 Looking for other colors?",
            "💰 Need a different price range?",
            "🎯 Want to see similar items?"
          ]
        });
      }
    }
    
    // AI-powered intent analysis will be done during query processing
    console.log(`🎯 Using AI-powered intent analysis for query: "${query}"`);
    
    // Update user session with current search
    updateUserSession(sessionId, {
      searchHistory: [...userSession.searchHistory.slice(-4), query.toLowerCase()],
      lastQuery: query,
      budget: extractPriceRangeFromQuery(query) || userSession.budget,
      conversationState: userSession.conversationState === 'initial' ? 'browsing' : userSession.conversationState
    });

    // Build enhanced context for AI
    const context = buildContext(products, catalogInsights, userSession);
    
    // Log what the AI learned about this store
    const storeAnalysis = analyzeStoreFromProducts(products, websiteHostname);
    console.log(`🧠 Store Learning Result for ${websiteHostname}:`, {
      storeType: storeAnalysis.storeType,
      mainProducts: storeAnalysis.mainProducts,
      keyFeatures: storeAnalysis.keyFeatures,
      priceSegment: storeAnalysis.priceSegment,
      targetAudience: storeAnalysis.targetAudience
    });
    
    // Create the enhanced AI prompt with intelligence
    const fullPrompt = `You are Shop Assistant, an advanced AI shopping companion with deep catalog knowledge and personalization capabilities.

WEBSITE INTELLIGENCE FOR: ${websiteHostname}
- Store URL: ${website}
- Store Type: ${websiteHostname.includes('allbirds') ? 'Sustainable footwear and apparel' : 'General retail'}
- Store Specialty: ${getStoreSpecialty(websiteHostname, catalogInsights, products)}

CATALOG INTELLIGENCE:
${context}

PRODUCT AVAILABILITY RULES:
${getAvailabilityRules(catalogInsights, products)}

CURRENT REQUEST: "${query}"

ADVANCED INSTRUCTIONS:

1. INTELLIGENT SEARCH EXECUTION:
   - ALWAYS use search_products function for product requests
   - Leverage catalog insights to enhance search accuracy
   - Consider user's search history and preferences
   - Extract precise product types and apply strict filtering

2. PRICE INTELLIGENCE:
   - Only use price filtering when explicitly mentioned in the query
   - Do NOT add price ranges if none are mentioned
   - Consider user's budget history only if relevant
   - Examples: "under $50" → price_range: "under 50", "apparel" → NO price_range

3. PERSONALIZATION:
   - Reference user's search history when relevant
   - Adapt recommendations based on previous interests
   - Remember and suggest similar styles/categories
   - Build on established preferences

4. DYNAMIC ENGAGEMENT:
   - Be extremely conversational with rich emojis 🛍️ ✨ 👟 🎯
   - Generate context-aware follow-up suggestions
   - Ask intelligent questions based on catalog insights
   - Create excitement about discoveries

5. SMART RECOMMENDATIONS:
   - Use catalog intelligence for cross-selling
   - Suggest complementary items
   - Recommend based on seasonal trends
   - Consider price point optimization

6. CONVERSATION FLOW:
   - Reference previous searches naturally
   - Build shopping journey continuity
   - Suggest next logical steps
   - Maintain enthusiasm throughout

SEARCH EXAMPLES FOR THIS SPECIFIC STORE:
- "hoodies" → search_products({"query": "hoodie"}) [NO price_range - let user see all options]
- "any apparel for women" → search_products({"query": "apparel", "category": "women"}) [NO price_range]
- "any accessories you have" → search_products({"query": "accessories"}) [NO price_range]
- "clothing for girl" → search_products({"query": "apparel", "category": "women"}) [NO price_range]
- ONLY add price_range when user explicitly mentions price: "under $X", "between $X-$Y", etc.

Execute search intelligently, then provide engaging response with personalized suggestions.
`;

    console.log("🤖 Smart E-commerce Assistant processing request...");

    // Try to use DeepSeek for enhanced search, but fallback to basic search if it fails
    try {
      // Generate response with potential function calls using DeepSeek
              const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://shop-assistant-open-api.vercel.app',
          'X-Title': 'Shop Assistant'
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful shopping assistant. Analyze the user\'s query and use the appropriate tools to provide the best results.'
            },
            {
              role: 'user',
              content: fullPrompt
            }
          ],
          tools: tools,
          tool_choice: 'auto'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`DeepSeek API error ${response.status}:`, errorText);
        throw new Error(`DeepSeek API error: ${response.status} - ${response.status === 402 ? 'Quota exceeded or billing issue' : 'Service unavailable'}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message;
      
      // Check if AI wants to use tools
      const functionCalls = aiResponse?.tool_calls;
      console.log(`🤖 AI response tool_calls:`, functionCalls);
      console.log(`🤖 AI response content:`, aiResponse?.content);
      console.log(`🤖 Function calls detected: ${functionCalls && functionCalls.length > 0 ? 'YES' : 'NO'}`);
      
      if (functionCalls && functionCalls.length > 0) {
        console.log(`🔧 AI requested ${functionCalls.length} tool(s):`, functionCalls.map((call: any) => call.function.name));
        
        // Execute function calls
        const functionResponses = await Promise.all(
          functionCalls.map(async (call: any) => {
            const args = JSON.parse(call.function.arguments);
            const result = await executeFunction(call.function.name, args, products, website);
            return {
              name: call.function.name,
              response: result
            };
          })
        );

        // Create a new prompt with function results
        const functionResultsText = functionResponses.map((fr: any) => 
          `Function ${fr.name} returned: ${JSON.stringify(fr.response, null, 2)}`
        ).join('\n\n');

        const followUpPrompt = `${fullPrompt}

I executed the requested functions and here are the results:

${functionResultsText}

Please provide a helpful response to the user based on these function results.`;

        // Send function results back to AI for final response
        const followUpResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://shop-assistant-open-api.vercel.app',
            'X-Title': 'Shop Assistant'
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful shopping assistant. Provide clear, helpful responses based on the function results.'
              },
              {
                role: 'user',
                content: followUpPrompt
              }
            ]
          })
        });

        if (!followUpResponse.ok) {
          throw new Error(`DeepSeek API error: ${followUpResponse.status}`);
        }

        const followUpData = await followUpResponse.json();
        const finalResponse = followUpData.choices[0]?.message?.content;
        
        // Check if any function returned products and include them
        let functionProducts: any[] = [];
        let functionMessage: string | null = null;
        let functionSuggestions: string[] = [];
        
        functionResponses.forEach((fr: any) => {
          if (fr.response) {
            if (fr.response.products && Array.isArray(fr.response.products)) {
              functionProducts = functionProducts.concat(fr.response.products);
            }
            if (fr.response.message) {
              functionMessage = fr.response.message;
            }
            if (fr.response.suggestions && Array.isArray(fr.response.suggestions)) {
              functionSuggestions = functionSuggestions.concat(fr.response.suggestions);
            }
          }
        });

        // Use function products if available, otherwise use first 10 products
        console.log(`🔧 Function products found: ${functionProducts.length}`);
        if (functionProducts.length > 0) {
          console.log(`🔧 Function products prices:`, functionProducts.map(p => `${p.name}: $${p.price}`).slice(0, 5));
        }
        
        // If we have a special message (like "no products found"), don't show default products
        const finalProducts = functionProducts.length > 0 ? functionProducts : 
                              (functionMessage ? [] : formatProductsForDisplay(products.slice(0, 10), website));
        
        console.log(`🔧 Final products count: ${finalProducts.length}`);
        if (finalProducts.length > 0) {
          console.log(`🔧 Final products prices:`, finalProducts.map(p => `${p.name}: $${p.price}`).slice(0, 5));
        }

        // Update user session with viewed products
        updateUserSession(sessionId, {
          viewedProducts: [...userSession.viewedProducts.slice(-10), ...finalProducts.slice(0, 3).map(p => p.id)]
        });

        // Generate dynamic, context-aware suggestions
        const dynamicSuggestions = finalProducts.length > 0 ? 
          generateDynamicSuggestions(query, finalProducts, catalogInsights, userSession) : 
          (functionSuggestions.length > 0 ? functionSuggestions : generateStoreAwareSuggestions(website, catalogInsights, products));
        
        // Extract categories from product types
        const categories = Array.from(new Set(finalProducts.map((p: any) => p.category).filter(Boolean)));

        // Use function message if available and no products found
        const responseMessage = finalProducts.length === 0 && functionMessage ? 
          functionMessage : 
          addEngagingFollowUp(addFriendlyFollowUp(cleanAIResponse(finalResponse) || "Here are the products I found for you:"), dynamicSuggestions);

        return NextResponse.json({
          message: responseMessage,
          products: finalProducts,
          categories: categories,
          suggestions: dynamicSuggestions.length > 0 ? dynamicSuggestions : [
            "💡 Want to filter by price range? Try 'under $X'",
            "🔍 Looking for similar items? Just ask!",
            "🎯 Need help with sizing or fit? I'm here to help!",
            "🛒 Ready to compare products? Ask me to compare!"
          ],
          userSession: {
            searchCount: userSession.searchHistory.length,
            hasPreferences: !!userSession.budget || !!userSession.style,
            lastSearch: userSession.searchHistory[userSession.searchHistory.length - 1]
          }
        });

      } else {
        // No function calls needed, return direct response
        console.log(`🤖 AI provided direct response, no function calls`);
        console.log(`🤖 Applying price filtering manually with: "${effectivePriceRange}"`);
        
        // Apply price filtering manually since AI didn't use function calls
        let filteredProducts = products;
        console.log(`🤖 Direct response path - original products: ${products.length}`);
        console.log(`🤖 Direct response path - effectivePriceRange: "${effectivePriceRange}"`);
        
        if (effectivePriceRange) {
          console.log(`🤖 Applying manual price filtering with range: "${effectivePriceRange}"`);
          const searchResult = await searchProducts(products, { query: "product", price_range: effectivePriceRange }, website, catalogInsights);
          console.log(`🤖 Manual search result:`, searchResult);
          
          filteredProducts = searchResult.products ? searchResult.products.map((p: any) => ({
            id: p.id,
            title: p.name,
            variants: [{ price: p.price }],
            product_type: p.category,
            images: [{ src: p.image }],
            handle: p.url.split('/').pop(),
            body_html: p.description
          })) : products;
          
          console.log(`🤖 Filtered products after manual search: ${filteredProducts.length}`);
          if (filteredProducts.length > 0) {
            console.log(`🤖 Filtered products prices:`, filteredProducts.map(p => `${p.title}: $${p.variants?.[0]?.price}`).slice(0, 5));
          }
        } else {
          console.log(`🤖 No price range detected, using original products`);
        }
        
        const displayProducts = formatProductsForDisplay(filteredProducts.slice(0, 10), website);
        console.log(`🤖 Direct response returning ${displayProducts.length} products`);
        console.log(`🤖 Display products prices:`, displayProducts.map(p => `${p.name}: $${p.price}`).slice(0, 5));

        // Extract categories from product types
        const categories = Array.from(new Set(displayProducts.map((p: any) => p.category).filter(Boolean)));

        return NextResponse.json({
          message: addEngagingFollowUp(addFriendlyFollowUp(cleanAIResponse(aiResponse?.content) || "Here are some products from this store:")),
          products: displayProducts,
          categories: categories,
          suggestions: [
            "Ask me to filter by price range",
            "Show me similar products", 
            "What's your return policy?",
            "Can you help me find a gift?",
            "Tell me about shipping options",
            "Show me different colors/sizes"
          ]
        });
      }

    } catch (error) {
      console.error('DeepSeek API error:', error);
      
      // Fallback to basic search functionality
      console.log('🔄 Falling back to basic search functionality...');
      console.log(`🔄 Using extracted price range in fallback: "${effectivePriceRange}"`);
      
      // Smart fallback: use AI analysis even in error cases
      let productType = query;
      try {
        const aiAnalysis = await analyzeQueryWithAI(query, catalogInsights);
        if (aiAnalysis && aiAnalysis.searchTerms && aiAnalysis.searchTerms.length > 0) {
          productType = aiAnalysis.searchTerms[0];
        }
      } catch (aiError) {
        console.log('⚠️ AI analysis failed in fallback, using original query');
      }
      
      const basicSearchResults = await searchProducts(products, { 
        query: productType, 
        price_range: effectivePriceRange 
      }, websiteUrl, catalogInsights);
      
      console.log(`🔄 Fallback search returned ${basicSearchResults.products?.length || 0} products`);
      
      // Check if search returned a special message (no products found)
      if (basicSearchResults.message && (!basicSearchResults.products || basicSearchResults.products.length === 0)) {
        return NextResponse.json({
          message: basicSearchResults.message,
          products: [],
          categories: [],
          suggestions: basicSearchResults.suggestions || []
        });
      }
      
      const displayProducts = basicSearchResults.products || formatProductsForDisplay(products.slice(0, 10), websiteUrl);
      
      // Extract categories from product types
      const categories = Array.from(new Set(displayProducts.map((p: any) => p.category).filter(Boolean)));

      return NextResponse.json({
        message: addEngagingFollowUp(addFriendlyFollowUp(`I found ${displayProducts.length} products for "${query}". (Note: Using basic search due to AI service issues)`)),
        products: displayProducts,
        categories: categories,
        suggestions: [
          "Ask me to filter by price range",
          "Show me similar products", 
          "What's your return policy?",
          "Can you help me find a gift?",
          "Tell me about shipping options",
          "Show me different colors/sizes"
        ]
      });
    }

  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process search request',
        message: 'Sorry, I encountered an error while searching. Please try again.',
        products: [],
        categories: [],
        suggestions: []
      },
      { status: 500 }
    )
  }
}

 