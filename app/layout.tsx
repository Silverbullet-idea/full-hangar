import './globals.css'
import { Suspense } from "react"
import type { Metadata } from "next"
import HeaderBrand from "./components/HeaderBrand"
import HeaderSearchBar from "./components/HeaderSearchBar"
import { NavigationLoadingProvider } from "./components/NavigationLoadingProvider"
import ThemeToggle from "./components/ThemeToggle"
import { ThemeProvider } from "./components/ThemeProvider"
import { getThemeBootstrapScript } from "./components/themeBootstrap"
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  toAbsoluteUrl,
} from "../lib/seo/site"

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim()
const bingVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim()

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Aircraft Market Intelligence`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Aircraft Market Intelligence`,
    description: DEFAULT_SITE_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: toAbsoluteUrl(DEFAULT_OG_IMAGE_PATH) }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Aircraft Market Intelligence`,
    description: DEFAULT_SITE_DESCRIPTION,
    images: [toAbsoluteUrl(DEFAULT_OG_IMAGE_PATH)],
  },
  verification: {
    ...(googleVerification ? { google: googleVerification } : {}),
    ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}),
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
          suppressHydrationWarning
        />
      </head>
      <body className="min-h-screen bg-brand-black text-white" suppressHydrationWarning>
        <ThemeProvider>
          <Suspense fallback={null}>
            <NavigationLoadingProvider>
              <header className="border-b border-brand-dark bg-brand-black px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                  <a href="/" className="flex items-center" aria-label="Full Hangar home">
                    <HeaderBrand />
                  </a>
                  <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
                    <HeaderSearchBar />
                    <nav>
                      <div className="flex items-center gap-3">
                        <a href="/internal/login" className="text-sm text-brand-muted hover:text-brand-orange">
                          Admin Login
                        </a>
                        <a href="/beta/join" className="text-sm text-brand-muted hover:text-brand-orange">
                          Beta Login
                        </a>
                      </div>
                    </nav>
                    <ThemeToggle />
                  </div>
                </div>
              </header>
              <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
            </NavigationLoadingProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  )
}
