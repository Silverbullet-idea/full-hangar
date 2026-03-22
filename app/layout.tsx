import "./globals.css"
import { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { Barlow_Condensed, DM_Mono, DM_Sans } from "next/font/google"
import SiteHeader from "./components/SiteHeader"
import { NavigationLoadingProvider } from "./components/NavigationLoadingProvider"
import { ThemeProvider } from "./components/ThemeProvider"
import { getThemeBootstrapScript } from "./components/themeBootstrap"
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  toAbsoluteUrl,
} from "../lib/seo/site"

const barlowCondensed = Barlow_Condensed({
  weight: ["400", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-barlow-condensed",
  display: "swap",
})

const dmSans = DM_Sans({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
})

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
})

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim()
const bingVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim()

export const viewport: Viewport = {
  viewportFit: "cover",
}

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
  const fontVars = `${barlowCondensed.variable} ${dmSans.variable} ${dmMono.variable}`

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
          suppressHydrationWarning
        />
      </head>
      <body
        className={`${fontVars} min-h-screen overflow-x-hidden bg-brand-black text-white`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <Suspense fallback={null}>
            <NavigationLoadingProvider>
              <SiteHeader />
              <main className="site-header-main relative z-[1] mx-auto max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
                {children}
              </main>
            </NavigationLoadingProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  )
}
