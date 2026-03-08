import { computeBuyerIntelligence } from "@/lib/admin/analytics";
import BuyerIntelligenceClient from "./BuyerIntelligenceClient";

export const dynamic = "force-dynamic";

export default async function BuyerIntelligencePage() {
  const payload = await computeBuyerIntelligence();
  return <BuyerIntelligenceClient data={payload} />;
}
