import './globals.css'
import HeaderBrand from "./components/HeaderBrand"
import ThemeToggle from "./components/ThemeToggle"
import { ThemeProvider } from "./components/ThemeProvider"
import { getThemeBootstrapScript } from "./components/themeBootstrap"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
          suppressHydrationWarning
        />
      </head>
      <body className="min-h-screen bg-brand-black text-white">
        <ThemeProvider>
          <header className="border-b border-brand-dark bg-brand-black px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <a href="/" className="flex items-center" aria-label="Full Hangar home">
                <HeaderBrand />
              </a>
              <div className="flex items-center gap-3">
                <nav>
                  <a href="/listings" className="text-sm text-brand-muted hover:text-brand-orange">
                    Browse Aircraft
                  </a>
                </nav>
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
