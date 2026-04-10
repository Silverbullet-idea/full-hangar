import type { Metadata } from 'next'
import CompactCardPrototypeDemo from '../listings/components/CompactCardPrototypeDemo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Compact card layout prototype — Full Hangar',
  description: 'Internal layout preview for the compact listing row (no thumbnail, full title).',
  robots: { index: false, follow: false },
}

/** Same demo as `/listings/compact-card-prototype` — shorter URL for debugging routing. */
export default function CompactCardPrototypeRootPage() {
  return <CompactCardPrototypeDemo />
}
