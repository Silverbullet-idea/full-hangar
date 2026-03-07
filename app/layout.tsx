import './globals.css'
import HeaderBrand from "./components/HeaderBrand"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-brand-black text-white">
        <header className="border-b border-brand-dark bg-brand-black px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <a href="/" className="flex items-center" aria-label="Full Hangar home">
              <HeaderBrand />
            </a>
            <nav>
              <a href="/listings" className="text-sm text-brand-muted hover:text-brand-orange">
                Browse Aircraft
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
