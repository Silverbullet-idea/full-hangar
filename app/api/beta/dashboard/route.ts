import { NextRequest, NextResponse } from "next/server";
import { computeBuyerIntelligence, computePlatformStats } from "@/lib/admin/analytics";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { BETA_SESSION_COOKIE, validateBetaSessionToken } from "@/lib/beta/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(BETA_SESSION_COOKIE)?.value;
  const session = await validateBetaSessionToken(token);
  if (!session) return NextResponse.json({ error: "session_expired" }, { status: 401 });

  try {
    const [buyer, platform] = await Promise.all([computeBuyerIntelligence(), computePlatformStats()]);
    const supabase = createPrivilegedServerClient();
    const topDealsResult = await supabase
      .from("aircraft_listings")
      .select("id,year,make,model,asking_price,flip_score,flip_tier,days_on_market,listing_url,url")
      .eq("is_active", true)
      .not("flip_score", "is", null)
      .order("flip_score", { ascending: false })
      .limit(10);

    return NextResponse.json({
      buyer,
      platform,
      topDeals: topDealsResult.error ? [] : topDealsResult.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load beta dashboard data" },
      { status: 500 }
    );
  }
}
