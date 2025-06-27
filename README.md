# Shop Assistant - AI-Powered E-commerce Helper

An intelligent e-commerce assistant built with Next.js and OpenAPI that helps users find products, browse categories, and get personalized recommendations.

## Features

- 🤖 **AI-Powered Search**: Uses OpenAPI to understand user queries and provide relevant results
- 🛍️ **Product Discovery**: Find products based on natural language queries
- 📂 **Category Browsing**: Explore product categories with AI assistance
- 🎯 **Smart Recommendations**: Get personalized product suggestions
- 🔗 **Direct Product Links**: Click on products to visit the actual e-commerce website
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices
- ⚡ **Fast & Modern**: Built with Next.js 14 and Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd shop-assistant-open-api
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Enter Website URL**: Input the e-commerce website URL you want to search
2. **Ask Questions**: Use natural language to describe what you're looking for:
   - "Show me red sneakers"
   - "What electronics do you have?"
   - "I need a gift for my mom"
   - "Browse clothing categories"
3. **View Results**: See products, categories, and suggestions
4. **Click Products**: Click on any product card to visit the actual product page

## API Configuration

The app uses Perplexity AI's OpenAPI for intelligent responses. The API key is configured in the search route.

## Project Structure

```
├── app/
│   ├── api/search/route.ts    # Search API endpoint
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main page
├── components/
│   └── ProductCard.tsx       # Product card component
├── types/
│   └── index.ts              # TypeScript type definitions
├── package.json
├── tailwind.config.js
└── README.md
```

## Technologies Used

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **OpenAI/Perplexity**: AI-powered search and recommendations
- **Lucide React**: Beautiful icons

## Customization

### Adding New Features

1. **New Product Fields**: Update the `Product` interface in `types/index.ts`
2. **Custom Styling**: Modify `tailwind.config.js` and `globals.css`
3. **Additional API Endpoints**: Create new routes in `app/api/`

### Styling

The app uses Tailwind CSS with custom components defined in `globals.css`. You can customize:
- Color scheme in `tailwind.config.js`
- Component styles in `globals.css`
- Individual component styling

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Deploy automatically

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

If you encounter any issues or have questions, please open an issue on GitHub. 