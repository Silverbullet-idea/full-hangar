import type { Metadata } from 'next'
import CompactCardPrototypeDemo from '../components/CompactCardPrototypeDemo'

/** Always render fresh (layout uses cookies via header). */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Compact card layout prototype — Full Hangar',
  description: 'Internal layout preview for the compact listing row (no thumbnail, full title).',
  robots: { index: false, follow: false },
}

export default function CompactCardPrototypePage() {
  return <CompactCardPrototypeDemo />
}
