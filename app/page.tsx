'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, ShoppingCart, Sparkles, ArrowRight, Send, User, Bot, X, ExternalLink, Info, AlertCircle, Heart } from 'lucide-react'
import ProductCard from '@/components/ProductCard'
import { Product, SearchResult } from '@/types'

interface Message {
  id: string
  type: 'user' | 'bot'
  content: string
  timestamp: Date
  products?: Product[]
  categories?: string[]
  suggestions?: string[]
}

// Helper to parse bot message into blocks (paragraphs, ul, ol)
function parseBotMessage(message: string) {
  const lines = message.split('\n');
  const blocks: any[] = [];
  let currentList: string[] = [];
  let currentListType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (currentList.length > 0 && currentListType) {
      blocks.push({ type: currentListType, items: [...currentList] });
      currentList = [];
      currentListType = null;
    }
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^•\s*(.*)/);
    const numberMatch = line.match(/^\d+\.\s*(.*)/);
    if (bulletMatch) {
      if (currentListType !== 'ul') flushList();
      currentListType = 'ul';
      currentList.push(bulletMatch[1]);
    } else if (numberMatch) {
      if (currentListType !== 'ol') flushList();
      currentListType = 'ol';
      currentList.push(numberMatch[1]);
    } else if (line.trim() === '') {
      flushList();
      blocks.push({ type: 'br' });
    } else {
      flushList();
      blocks.push({ type: 'p', text: line });
    }
  }
  flushList();
  return blocks;
}

const infoPages = [
  { label: 'About Us', path: '/pages/about-us' },
  { label: 'Contact', path: '/pages/contact' },
  { label: 'FAQ', path: '/pages/faq' },
  { label: 'Terms & Conditions', path: '/policies/terms-of-service' },
  { label: 'Privacy Policy', path: '/policies/privacy-policy' },
  { label: 'Shipping Info', path: '/pages/shipping' },
  { label: 'Shipping Policy', path: '/pages/shipping-policy' },
  { label: 'Shipping Policy', path: '/policies/shipping-policy' },
  { label: 'Track Order', path: '/pages/track-order' },
  { label: 'Order Tracking', path: '/pages/order-tracking' },
];

// Helper to validate URL format
function isValidUrlFormat(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

// Helper to suggest URL format
function getUrlFormatSuggestion(input: string): string {
  if (input.includes('.')) {
    // User might have entered domain without protocol
    return `Try adding "https://" before your domain: https://${input}`;
  } else {
    return 'Please enter a valid URL like: https://your-store.com';
  }
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: 'Hi there! 👋 I\'m your AI shopping assistant! 🛒\n\nTo get started, please enter a Shopify store URL above, then I can help you:\n• Find products and browse categories\n• Get personalized recommendations\n• Check store info and policies\n• Compare prices and features\n\nJust paste a store URL and start chatting! 😊',
      timestamp: new Date()
    }
  ])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [websiteInfoLinks, setWebsiteInfoLinks] = useState<{ label: string, url: string }[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [productDetails, setProductDetails] = useState<any>(null);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>('');

  const scrollToBottom = () => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Check if store URL is empty and remind user periodically
  useEffect(() => {
    if (!websiteUrl.trim()) {
      const checkInterval = setInterval(() => {
        const lastMessage = messages[messages.length - 1];
        const isReminderMessage = lastMessage?.content.includes('store URL') && lastMessage?.type === 'bot';
        
        // Only add reminder if the last message isn't already a reminder and user hasn't interacted recently
        if (!isReminderMessage && messages.length > 1) {
          const timeSinceLastMessage = Date.now() - lastMessage.timestamp.getTime();
          const fiveMinutes = 5 * 60 * 1000; // 5 minutes
          
          if (timeSinceLastMessage > fiveMinutes) {
            const reminderMessage: Message = {
              id: Date.now().toString(),
              type: 'bot',
              content: '💡 Don\'t forget to enter a Shopify store URL above to start searching for products! I\'m here to help once you do. 😊',
              timestamp: new Date()
            };
            setMessages(prev => [...prev, reminderMessage]);
          }
        }
      }, 30000); // Check every 30 seconds

      return () => clearInterval(checkInterval);
    }
  }, [websiteUrl, messages]);

  const toggleProductExpansion = (messageId: string) => {
    setExpandedProducts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  const handleShowProductDetails = async (product: Product) => {
    setSelectedProduct(product);
    setShowProductModal(true);
    setLoadingDetails(true);
    setProductDetails(null);
    
    try {
      console.log('🔍 Fetching detailed product information...');
      
      // Extract store URL from product URL
      if (!product.url) {
        throw new Error('Product URL is required for detailed analysis');
      }
      
      const storeUrl = new URL(product.url).origin;
      console.log('🏪 Store URL:', storeUrl);
      
      const response = await fetch('/api/product-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          product,
          storeUrl
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const details = await response.json();
      console.log('✅ Product details loaded:', details);
      setProductDetails(details);
    } catch (error) {
      console.error('❌ Error fetching product details:', error);
      setProductDetails({
        error: 'Failed to load product details. Please try again.',
        product: product
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return
    
    // Check if website URL is provided
    if (!websiteUrl.trim()) {
      const reminderMessage: Message = {
        id: Date.now().toString(),
        type: 'bot',
        content: 'Please enter a Shopify store URL first! 📝 Once you do that, I can search for products and help you find what you\'re looking for. 😊',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, reminderMessage]);
      return;
    }
    
    // Check if URL format is valid
    if (!isValidUrlFormat(websiteUrl)) {
      const suggestion = getUrlFormatSuggestion(websiteUrl);
      const formatMessage: Message = {
        id: Date.now().toString(),
        type: 'bot',
        content: `The URL format doesn't look quite right! 🔗\n\n${suggestion}\n\nMake sure to include "https://" at the beginning. 😊`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, formatMessage]);
      return;
    }

    // Smart context-aware search: combine with previous search if relevant
    let searchQuery = query;
    if (lastSearchQuery && isFollowUpQuery(query, lastSearchQuery)) {
      searchQuery = `${lastSearchQuery} ${query}`;
      console.log(`🔗 Context-aware search: "${lastSearchQuery}" + "${query}" = "${searchQuery}"`);
    } else {
      // Store the main category for future follow-up questions
      setLastSearchQuery(extractMainCategory(query));
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: query,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: searchQuery, 
          websiteUrl: websiteUrl
        }),
      })
      
      const data: SearchResult = await response.json()
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: data.message || 'Here are the products I found for you:',
        timestamp: new Date(),
        products: data.products,
        categories: data.categories,
        suggestions: data.suggestions
      }
      
      setMessages(prev => [...prev, botMessage])
      
      // Add engaging follow-up question after products are shown
      if (data.products && data.products.length > 0) {
        setTimeout(() => {
          const followUpQuestion = generateFollowUpQuestion(searchQuery, data.products!.length);
          const followUpMessage: Message = {
            id: (Date.now() + 2).toString(),
            type: 'bot',
            content: followUpQuestion,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, followUpMessage]);
          scrollToBottom();
        }, 2000); // 2 second delay to let user see the products first
      }
      
    } catch (error) {
      console.error('Search error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: 'Sorry, I encountered an error while searching. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      setQuery('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleSearchWithCategory = async (category: string) => {
    if (!websiteUrl) {
      const reminderMessage: Message = {
        id: Date.now().toString(),
        type: 'bot',
        content: 'Please enter a Shopify store URL first! 📝 Once you do that, I can search for products and help you find what you\'re looking for. 😊',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, reminderMessage]);
      return;
    }
    
    // Check if URL format is valid
    if (!isValidUrlFormat(websiteUrl)) {
      const suggestion = getUrlFormatSuggestion(websiteUrl);
      const formatMessage: Message = {
        id: Date.now().toString(),
        type: 'bot',
        content: `The URL format doesn't look quite right! 🔗\n\n${suggestion}\n\nMake sure to include "https://" at the beginning. 😊`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, formatMessage]);
      return;
    }
    
    // Store the search query for follow-up questions
    setLastSearchQuery(category);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: category,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: category, 
          websiteUrl: websiteUrl
        }),
      });
      const data: SearchResult = await response.json();
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: data.message || 'Here are the products I found for you:',
        timestamp: new Date(),
        products: data.products,
        categories: data.categories,
        suggestions: data.suggestions
      };
      setMessages(prev => [...prev, botMessage]);
      
      // Add engaging follow-up question after products are shown
      if (data.products && data.products.length > 0) {
        setTimeout(() => {
          const followUpQuestion = generateFollowUpQuestion(category, data.products!.length);
          const followUpMessage: Message = {
            id: (Date.now() + 2).toString(),
            type: 'bot',
            content: followUpQuestion,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, followUpMessage]);
          scrollToBottom();
        }, 2000); // 2 second delay to let user see the products first
      }
      
    } catch (error) {
      console.error('Search error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: 'Sorry, I encountered an error while searching. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setQuery('');
    }
  };

  // Dynamically check which info pages exist for the current website
  const checkWebsiteInfoLinks = async (websiteUrl: string) => {
    // Disabled to prevent CORS errors - external fetch calls from browser are blocked
    console.log(`ℹ️ Website info links check disabled for ${websiteUrl} to prevent CORS errors`);
    setWebsiteInfoLinks([]);
    return;
    
    /* DISABLED CODE - causes CORS errors
    const base = websiteUrl.replace(/\/$/, '');
    const foundLinks: { label: string, url: string }[] = [];
    await Promise.all(
      infoPages.map(async (page) => {
        try {
          const res = await fetch(`${base}${page.path}`, { method: 'HEAD' });
          if (res.ok) {
            foundLinks.push({ label: page.label, url: `${base}${page.path}` });
          }
        } catch {}
      })
    );
    setWebsiteInfoLinks(foundLinks);
    */
  };

  useEffect(() => {
    if (websiteUrl) {
      checkWebsiteInfoLinks(websiteUrl);
    } else {
      setWebsiteInfoLinks([]);
    }
  }, [websiteUrl]);

  const formatPrice = (price: string | number | undefined) => {
    if (!price) return '';
    
    // If price already includes $, return as is (already formatted)
    if (typeof price === 'string' && price.includes('$')) {
      return price;
    }
    
    // Convert to number for proper formatting
    const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
    
    // Handle invalid numbers
    if (isNaN(numericPrice)) return '';
    
    // Use Intl.NumberFormat for proper currency formatting
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericPrice);
  };

  // Helper function to generate engaging follow-up questions
  const generateFollowUpQuestion = (query: string, productCount: number): string => {
    const lowerQuery = query.toLowerCase();
    
    // Category-specific questions
    if (lowerQuery.includes('shoe') || lowerQuery.includes('sneaker') || lowerQuery.includes('boot')) {
      const questions = [
        `Great! I found ${productCount} products for you. Are you shopping for a particular season or weather condition?`,
        `Perfect! I found ${productCount} options. What's your preferred style - casual, athletic, or formal?`,
        `Awesome! I found ${productCount} products. Do you have a specific color preference in mind?`,
        `Nice! I found ${productCount} options. Are you looking for something for everyday wear or special occasions?`
      ];
      return questions[Math.floor(Math.random() * questions.length)];
    }
    
    if (lowerQuery.includes('sock')) {
      const questions = [
        `Great! I found ${productCount} products for you. Are you looking for athletic socks, dress socks, or casual everyday socks?`,
        `Perfect! I found ${productCount} options. Do you prefer ankle, crew, or knee-high socks?`,
        `Awesome! I found ${productCount} products. Any specific material preferences like wool, cotton, or synthetic blends?`
      ];
      return questions[Math.floor(Math.random() * questions.length)];
    }
    
    if (lowerQuery.includes('hat') || lowerQuery.includes('cap') || lowerQuery.includes('beanie')) {
      const questions = [
        `Great! I found ${productCount} products for you. Are you looking for something for sun protection or warmth?`,
        `Perfect! I found ${productCount} options. Do you prefer baseball caps, beanies, or wide-brim hats?`,
        `Awesome! I found ${productCount} products. Any particular color or style you have in mind?`
      ];
      return questions[Math.floor(Math.random() * questions.length)];
    }
    
    if (lowerQuery.includes('shirt') || lowerQuery.includes('tee') || lowerQuery.includes('hoodie') || lowerQuery.includes('sweatshirt')) {
      const questions = [
        `Great! I found ${productCount} products for you. Are you shopping for a particular season or weather condition?`,
        `Perfect! I found ${productCount} options. Do you prefer fitted, regular, or oversized fits?`,
        `Awesome! I found ${productCount} products. Any specific fabric preferences like cotton, merino wool, or blends?`
      ];
      return questions[Math.floor(Math.random() * questions.length)];
    }
    
    // Generic questions for other categories
    const genericQuestions = [
      `Great! I found ${productCount} products for you. What specific features are most important to you?`,
      `Perfect! I found ${productCount} options. Do you have a preferred price range in mind?`,
      `Awesome! I found ${productCount} products. Are you shopping for yourself or as a gift?`,
      `Nice! I found ${productCount} options. Any particular brand preferences?`
    ];
    
    return genericQuestions[Math.floor(Math.random() * genericQuestions.length)];
  };

  // Helper function to detect if a query is a follow-up to previous search
  const isFollowUpQuery = (currentQuery: string, previousQuery: string): boolean => {
    const current = currentQuery.toLowerCase().trim();
    const previous = previousQuery.toLowerCase();
    
    // Check for follow-up indicators
    const followUpIndicators = [
      'any for', 'for', 'in', 'with', 'that are', 'which are',
      'something', 'anything', 'what about', 'how about',
      'winter', 'summer', 'spring', 'fall', 'autumn',
      'casual', 'formal', 'athletic', 'sporty',
      'black', 'white', 'blue', 'red', 'green', 'brown', 'gray', 'grey'
    ];
    
    // If current query is short and contains follow-up indicators
    if (current.length < 20 && followUpIndicators.some(indicator => current.includes(indicator))) {
      return true;
    }
    
    // If current query doesn't contain main product categories but previous did
    const productCategories = ['shoe', 'sock', 'hat', 'cap', 'shirt', 'tee', 'hoodie', 'boot', 'sneaker'];
    const currentHasCategory = productCategories.some(cat => current.includes(cat));
    const previousHasCategory = productCategories.some(cat => previous.includes(cat));
    
    if (!currentHasCategory && previousHasCategory && current.length < 30) {
      return true;
    }
    
    return false;
  };

  // Helper function to extract main category from query
  const extractMainCategory = (query: string): string => {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('shoe') || lowerQuery.includes('sneaker') || lowerQuery.includes('boot')) {
      return 'shoes';
    }
    if (lowerQuery.includes('sock')) {
      return 'socks';
    }
    if (lowerQuery.includes('hat') || lowerQuery.includes('cap') || lowerQuery.includes('beanie')) {
      return 'hats';
    }
    if (lowerQuery.includes('shirt') || lowerQuery.includes('tee') || lowerQuery.includes('hoodie') || lowerQuery.includes('sweatshirt')) {
      return 'apparel';
    }
    
    return query; // Return original if no category detected
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-center">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mr-3">
            <Sparkles className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Shop Assistant</h1>
            <p className="text-green-100 text-sm">Online • AI-powered shopping</p>
          </div>
        </div>
      </div>

      {/* Website URL Input */}
      <div className="bg-white p-4 border-b border-gray-200">
        <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-2">
          Store URL
        </label>
        <input
          id="website"
          type="url"
          placeholder="https://your-store.com"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 placeholder-gray-500"
        />
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message, index) => (
          <div key={message.id}>
            {/* Message Bubble */}
            {!(message.type === 'bot' && message.products && message.products.length > 0) && (
              <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[75%] ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.type === 'user' 
                      ? 'bg-green-500 text-white ml-2' 
                      : 'bg-gray-200 text-gray-600 mr-2'
                  }`}>
                    {message.type === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  
                  {/* Message Bubble */}
                  <div className={`rounded-2xl px-4 py-2 shadow-sm ${
                    message.type === 'user' 
                      ? 'bg-green-500 text-white rounded-br-md' 
                      : 'bg-white text-gray-800 rounded-bl-md border border-gray-200'
                  }`}>
                    {message.type === 'bot' && (!message.products || message.products.length === 0)
                      ? parseBotMessage(message.content).map((block, idx) => {
                          if (block.type === 'ul') {
                            return <ul key={idx} className="list-disc ml-5 mb-1">{block.items.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>;
                          } else if (block.type === 'ol') {
                            return <ol key={idx} className="list-decimal ml-5 mb-1">{block.items.map((item: string, i: number) => <li key={i}>{item}</li>)}</ol>;
                          } else if (block.type === 'br') {
                            return <br key={idx} />;
                          } else {
                            return <div key={idx} className="mb-1 whitespace-pre-line">{block.text}</div>;
                          }
                        })
                      : message.type === 'user'
                        ? <p className="text-sm leading-relaxed">{message.content}</p>
                        : null
                    }
                    <p className={`text-xs mt-1 ${
                      message.type === 'user' ? 'text-green-100' : 'text-gray-400'
                    }`}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Products Display - Inline with chat */}
            {message.products && message.products.length > 0 && (
              <div className="flex justify-start mt-3">
                <div className="flex max-w-[85%]">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 text-gray-600 mr-2 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-200">
                    <p className="text-sm text-gray-800 mb-3">
                      Found {message.products.length} product{message.products.length !== 1 ? 's' : ''} for you{message.products.length >= 50 ? ' (showing top 50)' : ''}:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                      {message.products.slice(0, expandedProducts.has(message.id) ? message.products.length : 12).map((product, index) => (
                        <ProductCard 
                          key={index} 
                          product={product} 
                          onShowDetails={handleShowProductDetails}
                        />
                      ))}
                    </div>
                    {message.products.length > 12 && (
                      <button 
                        onClick={() => toggleProductExpansion(message.id)}
                        className="text-xs text-green-600 hover:text-green-700 mt-2 text-center w-full font-medium transition-colors"
                      >
                        {expandedProducts.has(message.id) 
                          ? `Show less (${12} products)` 
                          : `+${message.products.length - 12} more products`
                        }
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Categories Display - Inline with chat */}
            {message.categories && message.categories.length > 0 && (
              <div className="flex justify-start mt-3">
                <div className="flex max-w-[85%]">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 text-gray-600 mr-2 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-200">
                    <p className="text-sm text-gray-800 mb-3">Browse these categories:</p>
                    <div className="flex flex-wrap gap-2">
                      {message.categories.map((category, index) => (
                        <button
                          key={index}
                          className="bg-gray-100 rounded-full px-3 py-1 cursor-pointer hover:bg-green-100 hover:text-green-700 transition-colors text-xs text-gray-700 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400"
                          onClick={() => {
                            setQuery(category);
                            handleSearchWithCategory(category);
                          }}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Helpful links from this store */}
            {websiteInfoLinks.length > 0 && (
              <div className="flex justify-start mt-3">
                <div className="flex max-w-[85%]">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 text-gray-600 mr-2 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-200">
                    <p className="text-sm text-gray-800 mb-3">Helpful links from this store:</p>
                    <div className="flex flex-wrap gap-2">
                      {websiteInfoLinks.map((info, idx) => (
                        <a
                          key={idx}
                          href={info.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-blue-800 text-xs hover:bg-blue-100 transition-colors"
                        >
                          {info.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        
        {/* Loading Message */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex max-w-[75%]">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 text-gray-600 mr-2 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-200">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center space-x-3">
            <input
              type="text"
              placeholder="Type your message..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 placeholder-gray-500"
              disabled={isLoading}
            />
            <button
              onClick={handleSearch}
              disabled={isLoading || !query.trim()}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white p-3 rounded-full transition-colors duration-200 flex items-center justify-center shadow-sm"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Product Details Modal */}
      {showProductModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">Product Details</h2>
              <button
                onClick={() => {
                  setShowProductModal(false);
                  setSelectedProduct(null);
                  setProductDetails(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
              {loadingDetails ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-3 mb-4">
                      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-600">Analyzing product details...</span>
                    </div>
                    <p className="text-sm text-gray-500">Getting comprehensive product information</p>
                  </div>
                </div>
              ) : productDetails?.error ? (
                <div className="p-6 text-center">
                  <div className="text-red-500 mb-4">
                    <AlertCircle className="w-12 h-12 mx-auto mb-2" />
                    <p className="text-lg font-medium">Error Loading Details</p>
                  </div>
                  <p className="text-gray-600 mb-4">{productDetails.error}</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => handleShowProductDetails(selectedProduct!)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg mr-2"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => window.open(selectedProduct?.url, '_blank')}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg"
                    >
                      <ExternalLink className="w-4 h-4 inline mr-2" />
                      View Original
                    </button>
                  </div>
                </div>
              ) : productDetails ? (
                <div className="p-6">
                  {/* Product Header */}
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <img
                        src={productDetails.product?.image || selectedProduct?.image}
                        alt={productDetails.product?.name || selectedProduct?.name}
                        className="w-full h-80 object-contain rounded-lg bg-gray-50"
                      />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold mb-2 text-gray-900">
                        {productDetails.product?.name || selectedProduct?.name}
                      </h1>
                      <div className="flex items-center space-x-4 mb-4">
                        <span className="text-3xl font-bold text-green-600">
                          {formatPrice(productDetails.product?.price || selectedProduct?.price)}
                        </span>
                        {productDetails.product?.compareAtPrice && (
                          <span className="text-lg text-gray-500 line-through">
                            {formatPrice(productDetails.product.compareAtPrice)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 mb-4">
                        {productDetails.product?.vendor && (
                          <p className="text-gray-700">
                            <strong className="text-gray-900">Brand:</strong> {productDetails.product.vendor}
                          </p>
                        )}
                        {productDetails.product?.category && (
                          <p className="text-gray-700">
                            <strong className="text-gray-900">Category:</strong> {productDetails.product.category}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => window.open(selectedProduct?.url, '_blank')}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 px-6 rounded-lg font-medium flex items-center justify-center"
                      >
                        <ExternalLink className="w-5 h-5 mr-2" />
                        View More Detail
                      </button>
                    </div>
                  </div>

                  {/* AI Analysis */}
                  {productDetails.analysis && (
                    <div className="bg-blue-50 rounded-lg p-6 mb-6">
                      <h3 className="text-lg font-semibold mb-4 flex items-center text-gray-900">
                        <Sparkles className="w-5 h-5 mr-2 text-blue-500" />
                        AI Product Analysis
                      </h3>
                      
                      {productDetails.analysis.summary && (
                        <div className="mb-4">
                          <h4 className="font-medium mb-2 text-gray-900">Summary</h4>
                          <p className="text-gray-800">{productDetails.analysis.summary}</p>
                        </div>
                      )}
                      
                      {productDetails.analysis.highlights && productDetails.analysis.highlights.length > 0 && (
                        <div className="mb-4">
                          <h4 className="font-medium mb-2 text-gray-900">Key Highlights</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {productDetails.analysis.highlights.map((highlight: string, index: number) => (
                              <li key={index} className="text-gray-800">{highlight}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="grid md:grid-cols-2 gap-4">
                        {productDetails.analysis.pros && productDetails.analysis.pros.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2 text-green-700">Pros</h4>
                            <ul className="list-disc list-inside space-y-1">
                              {productDetails.analysis.pros.map((pro: string, index: number) => (
                                <li key={index} className="text-gray-800 text-sm">{pro}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {productDetails.analysis.cons && productDetails.analysis.cons.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2 text-red-700">Considerations</h4>
                            <ul className="list-disc list-inside space-y-1">
                              {productDetails.analysis.cons.map((con: string, index: number) => (
                                <li key={index} className="text-gray-800 text-sm">{con}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Product Description */}
                  {productDetails.product?.description && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold mb-3 text-gray-900">Description</h3>
                      <div className="prose prose-sm max-w-none text-gray-800">
                        {productDetails.product.description.split('\n').map((paragraph: string, index: number) => (
                          paragraph.trim() && <p key={index} className="mb-2 text-gray-800">{paragraph}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Smart Features */}
                  {(productDetails.features?.sizeGuide || productDetails.features?.careInstructions) && (
                    <div className="grid md:grid-cols-2 gap-6">
                      {productDetails.features.sizeGuide && (
                        <div className="bg-yellow-50 rounded-lg p-4">
                          <h4 className="font-medium mb-2 flex items-center text-yellow-800">
                            <Info className="w-4 h-4 mr-2 text-yellow-700" />
                            Size Guide
                          </h4>
                          <p className="text-sm text-yellow-900">{productDetails.features.sizeGuide}</p>
                        </div>
                      )}
                      
                      {productDetails.features.careInstructions && (
                        <div className="bg-green-50 rounded-lg p-4">
                          <h4 className="font-medium mb-2 flex items-center text-green-800">
                            <Heart className="w-4 h-4 mr-2 text-green-700" />
                            Care Instructions
                          </h4>
                          <p className="text-sm text-green-900">{productDetails.features.careInstructions}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 