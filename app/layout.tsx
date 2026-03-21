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
      <body className="min-h-screen overflow-x-hidden bg-brand-black text-white" suppressHydrationWarning>
        <ThemeProvider>
          <Suspense fallback={null}>
            <NavigationLoadingProvider>
              <header className="border-b border-brand-dark bg-brand-black px-4 py-3 sm:px-6 sm:py-4">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
                  <a href="/" className="flex shrink-0 items-center" aria-label="Full Hangar home">
                    <HeaderBrand />
                  </a>
                  <div className="flex min-w-0 w-full flex-1 basis-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:basis-auto sm:gap-3 md:flex-nowrap">
                    <div className="min-w-0 flex-1 basis-[min(100%,280px)] sm:max-w-[560px]">
                      <HeaderSearchBar />
                    </div>
                    <nav className="shrink-0">
                      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs sm:text-sm">
                        <a href="/internal/login" className="whitespace-nowrap text-brand-muted hover:text-brand-orange">
                          Admin Login
                        </a>
                        <a href="/beta/join" className="whitespace-nowrap text-brand-muted hover:text-brand-orange">
                          Beta Login
                        </a>
                      </div>
                    </nav>
                    <ThemeToggle />
                  </div>
                </div>
              </header>
              <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">{children}</main>
            </NavigationLoadingProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  )
}
