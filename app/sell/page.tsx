import type { Metadata } from "next"
import SellerIntakeClient from "./SellerIntakeClient"

export const metadata: Metadata = {
  title: "List your aircraft",
  description: "Seller intake — one form structured for Trade-A-Plane, Controller, ASO, and cross-post.",
}

export default function SellPage() {
  return (
    <div className="min-h-[60vh] pb-16">
      <SellerIntakeClient />
    </div>
  )
}
