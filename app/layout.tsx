import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shop Assistant - AI-Powered E-commerce Helper',
  description: 'Find products, browse categories, and get personalized recommendations with AI assistance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          {children}
        </div>
        {/* Hide any default Next.js or Vercel footer */}
        <style>{`footer { display: none !important; }`}</style>
      </body>
    </html>
  )
} 